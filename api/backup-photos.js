// Vercel Cron: 写真と店舗データの「控え」を AWS S3(大阪)へ毎晩写す(2026-11-16・社長承認 11/16・別紙2)
//
// ★ 何をするか
//   1) Supabase Storage(personal-files)の全ファイルを一覧し、前回の控え(manifest)と比べて「新しい・変わった」ものだけ S3 へ写す
//        S3 の置き場所: storage/<Storage と同じパス>   例) storage/pf/14/hokensho.jpg
//   2) 店舗データ本体(app_state の store_* の行)を1日1回、gzip して S3 へ写す
//        S3 の置き場所: app_state/<店舗ID>/<YYYY-MM-DD>.json.gz
//   3) 進み具合と最後の実行の要約を S3 に置く(manifest/latest.json・manifest/last_run.json)
//
// ★ 守ること
//   ・Supabase 側は読むだけ(書かない・消さない)。S3 側は置くだけ(消さない・Object Lock で30日は誰も消せない)。
//   ・1回の実行は時間と件数で区切る(既定 150件・45秒)。残りは次の晩に続きから(manifest に控えがあるので同じものは写さない)。
//   ・鍵の値はログにも応答にも出さない。
//
// 呼び方
//   GET  /api/backup-photos                 Vercel Cron(毎晩 03:30 JST = 18:30 UTC・vercel.json)。CRON_SECRET があればそれを確かめる
//   POST /api/backup-photos { secret, dryRun?, maxFiles?, budgetMs? }   本部の手動実行(secret = ADMIN_API_SECRET・管理局と同じ合言葉)
//   ?dryRun=1 / dryRun:true                 何も書かない(写す予定の件数だけ返す)
//   → { ok, dryRun, copied, skipped, remaining, errors:[{path,error}], appState:{copied,skipped}, listed, elapsedMs, startedAt, finishedAt }
import crypto from 'crypto';
import zlib from 'zlib';
import { s3FromSecrets, maskAws } from './_s3.js';

const SUPA_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'personal-files';                 // api/files.js と同じ
const MANIFEST_KEY = 'manifest/latest.json';
const LAST_RUN_KEY = 'manifest/last_run.json';
const DEFAULT_MAX_FILES = 600;                   // ★ 2026-11-19 trial592: 初回(488件)が何晩もかからないように 150→600
const DEFAULT_BUDGET_MS = 270 * 1000;            // vercel.json の maxDuration 300 秒より手前で止める(★ trial592: 45秒→270秒。初回は一覧だけで時間を使い切っていた)
const MAX_FILE_BYTES = 50 * 1024 * 1024;         // これより大きいものは今回は写さず errors に残す(Vercel のメモリ対策)
const JST_OFF = 9 * 60 * 60 * 1000;
const enc = encodeURIComponent;
const hdrs = () => ({ apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json' });
const jstDate = (ms) => new Date((ms || Date.now()) + JST_OFF).toISOString().slice(0, 10);

const secretOk = (given) => {
  const want = String(process.env.ADMIN_API_SECRET || '');
  if (!want) return false;
  const a = crypto.createHash('sha256').update(want).digest();
  const b = crypto.createHash('sha256').update(String(given || '')).digest();
  return crypto.timingSafeEqual(a, b);
};

async function sbJson(url, init) {
  const r = await fetch(url, { ...(init || {}), headers: { ...hdrs(), ...((init && init.headers) || {}) } });
  const text = await r.text().catch(() => '');
  let j = null; try { j = text ? JSON.parse(text) : null; } catch { j = null; }
  if (!r.ok) { const e = new Error((j && (j.message || j.error)) || `supabase ${r.status}`); e.status = r.status; throw e; }
  return j;
}

// Storage の一覧は1階層ずつ(フォルダは id が null)。全階層をたどって「ファイルだけ」を返す。1回 1000 件ずつページ送り。
async function listStorageAll(deadline) {
  const files = []; const stack = ['']; let calls = 0;
  while (stack.length) {
    if (Date.now() > deadline) { const e = new Error('一覧の途中で時間切れ'); e.partial = true; e.files = files; throw e; }
    const prefix = stack.pop();
    let offset = 0;
    for (;;) {
      const rows = await sbJson(`${SUPA_URL}/storage/v1/object/list/${BUCKET}`, { method: 'POST', body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }) });
      calls++;
      const arr = Array.isArray(rows) ? rows : [];
      for (const o of arr) {
        if (!o || !o.name || o.name === '.emptyFolderPlaceholder') continue;
        const path = prefix ? `${prefix}/${o.name}` : o.name;
        if (o.id == null) { stack.push(path); continue; }      // フォルダ
        const md = o.metadata || {};
        files.push({ path, size: Number(md.size || 0), updatedAt: o.updated_at || o.created_at || '', etag: String(md.eTag || '').replace(/"/g, ''), contentType: md.mimetype || 'application/octet-stream' });
      }
      if (arr.length < 1000) break;
      offset += arr.length;
    }
  }
  return { files, calls };
}

async function downloadStorage(path) {
  const r = await fetch(`${SUPA_URL}/storage/v1/object/${BUCKET}/${path.split('/').map(enc).join('/')}`, { headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY } });
  if (!r.ok) { const e = new Error(`storage ${r.status}`); e.status = r.status; throw e; }
  const body = Buffer.from(await r.arrayBuffer());
  return { body, contentType: r.headers.get('content-type') || 'application/octet-stream' };
}

const changed = (prev, f) => !prev || prev.size !== f.size || String(prev.updatedAt || '') !== String(f.updatedAt || '') || (f.etag && prev.etag && prev.etag !== f.etag);

export async function runBackup({ dryRun = false, maxFiles = DEFAULT_MAX_FILES, budgetMs = DEFAULT_BUDGET_MS, trigger = 'cron' } = {}) {
  const started = Date.now(); const deadline = started + Math.max(5000, Math.min(Number(budgetMs) || DEFAULT_BUDGET_MS, 280000));
  const out = { ok: true, dryRun: !!dryRun, trigger, copied: 0, skipped: 0, remaining: 0, errors: [], appState: { copied: 0, skipped: 0, stores: [] }, listed: 0, startedAt: new Date(started).toISOString() };
  const s3 = await s3FromSecrets();
  if (!s3) return { ...out, ok: false, configured: false, error: 'AWS の設定がありません。管理局 → 外部サービス設定 → 「AWS S3（写真の控え）」に4つの値を入れてください。' };
  out.bucket = s3.bucket; out.region = s3.region;

  // 前回までの控えの台帳
  const manifest = await s3.getJson(MANIFEST_KEY, null) || { version: 1, files: {}, appState: {}, failed: {}, updatedAt: null };
  manifest.files = manifest.files || {}; manifest.appState = manifest.appState || {}; manifest.failed = manifest.failed || {};

  // 1) 店舗データ本体(1日1回・店舗ごと) ★ 2026-11-19 trial592: 写真より先に(初回は写真の一覧と転送で時間を使い切り、店舗データが0店になった)
  const today = jstDate(started); let dirty = false;
  try {
    const rows = await sbJson(`${SUPA_URL}/rest/v1/app_state?select=key,version&key=like.store_*&order=key.asc`);
    for (const r of Array.isArray(rows) ? rows : []) {
      const sid = String(r.key); const prev = manifest.appState[sid];
      if (prev && prev.date === today) { out.appState.skipped++; continue; }
      if (Date.now() > deadline) { out.remaining++; continue; }
      if (dryRun) { out.appState.copied++; out.appState.stores.push(sid); continue; }
      try {
        const one = await sbJson(`${SUPA_URL}/rest/v1/app_state?select=key,version,data&key=eq.${enc(sid)}&limit=1`);
        const row = Array.isArray(one) && one[0]; if (!row || !row.data) { out.appState.skipped++; continue; }
        const gz = zlib.gzipSync(Buffer.from(JSON.stringify({ key: row.key, version: row.version, savedAt: new Date().toISOString(), data: row.data }), 'utf8'), { level: 6 });
        await s3.putObject(`app_state/${sid}/${today}.json.gz`, gz, 'application/gzip', { 'x-amz-meta-version': String(row.version ?? '') });
        manifest.appState[sid] = { date: today, version: row.version ?? null, bytes: gz.length, copiedAt: new Date().toISOString() };
        out.appState.copied++; out.appState.stores.push(sid); dirty = true;
      } catch (e) {
        out.errors.push({ path: `app_state/${sid}`, error: maskAws(String((e && e.message) || e)).slice(0, 200) });
      }
    }
  } catch (e) {
    out.errors.push({ path: 'app_state', error: maskAws(String((e && e.message) || e)).slice(0, 200) });
  }

  // 1b) 提供記録(ticket_records の表・店舗ごと・1日1回) ★ 2026-11-19 trial593/1119b(ユーザー「控えは写真だけ?」): 店舗データ本体(app_state)には提供記録が入っていない(別の表)ので、ここで店舗ごとに全行を写す
  out.records = { copied: 0, skipped: 0, rows: 0, stores: [] };
  try {
    const keys = await sbJson(`${SUPA_URL}/rest/v1/app_state?select=key&key=like.store_*&order=key.asc`);
    for (const r of Array.isArray(keys) ? keys : []) {
      const skey = String(r.key); const prev = manifest.records && manifest.records[skey];
      if (prev && prev.date === today) { out.records.skipped++; continue; }
      if (Date.now() > deadline) { out.remaining++; continue; }
      if (dryRun) { out.records.copied++; out.records.stores.push(skey); continue; }
      try {
        // ticket_records.store_id は app_state の鍵(store_xxx)と同じか、store_ を除いたものか、両方を試す(行があった方)
        const cands = [skey, skey.replace(/^store_/, '')].filter((v, i, a) => v && a.indexOf(v) === i);
        let sid = null; for (const c of cands) { const probe = await sbJson(`${SUPA_URL}/rest/v1/ticket_records?select=id&store_id=eq.${enc(c)}&limit=1`); if (Array.isArray(probe) && probe.length) { sid = c; break; } }
        if (!sid) { out.records.skipped++; continue; } // 提供記録がまだ無い店舗
        const all = []; let offset = 0;
        while (true) { // 1回1000行で切れる(Supabase の既定)ので最後までページ送り
          const page = await sbJson(`${SUPA_URL}/rest/v1/ticket_records?select=id,patient_id,rec_date,data,updated_at,deleted_at&store_id=eq.${enc(sid)}&order=id.asc&limit=1000&offset=${offset}`);
          if (!Array.isArray(page) || !page.length) break; all.push(...page); offset += page.length; if (page.length < 1000) break;
          if (Date.now() > deadline) throw new Error('時間切れ(次の晩に続きから)');
        }
        const gz = zlib.gzipSync(Buffer.from(JSON.stringify({ store: skey, storeId: sid, savedAt: new Date().toISOString(), count: all.length, rows: all }), 'utf8'), { level: 6 });
        await s3.putObject(`ticket_records/${skey}/${today}.json.gz`, gz, 'application/gzip', { 'x-amz-meta-count': String(all.length) });
        manifest.records = manifest.records || {}; manifest.records[skey] = { date: today, count: all.length, bytes: gz.length, copiedAt: new Date().toISOString() };
        out.records.copied++; out.records.rows += all.length; out.records.stores.push(skey); dirty = true;
      } catch (e) {
        out.errors.push({ path: `ticket_records/${skey}`, error: maskAws(String((e && e.message) || e)).slice(0, 200) });
      }
    }
  } catch (e) {
    out.errors.push({ path: 'ticket_records', error: maskAws(String((e && e.message) || e)).slice(0, 200) });
  }

  // 1c) そのほかの表(店舗・職員・招待・ご家族/ケアマネのアカウント・お知らせ・元に戻す控え・同期の履歴・app_state の店舗以外の行) ★ 2026-11-19 trial594/1119c
  //   ユーザー「控えを取るなら、提供記録が漏れていたようなことが無いよう必ず全部の記録を」→ 使っている表を全部、毎晩 1回ずつ全行 gzip で写す(表が無ければ飛ばす・時間切れは次の晩)。
  //   app_secrets(外部サービスの鍵)だけは写さない(鍵の控えを控え先に置かない。復旧時は管理局で入れ直す)。
  //   新しい表を足したときはここにも足す(scripts/run_tests.py の T-BK-01 が、API が触る表とこの一覧を突き合わせる)。
  const TABLES = [
    { name: 'stores', order: ['id'] },
    { name: 'staff', order: ['id'] },
    { name: 'staff_invites', order: ['id'] },
    { name: 'staff_logins', order: ['id', 'created_at'] },
    { name: 'family_accounts', order: ['id'] },
    { name: 'family_invites', order: ['id'] },
    { name: 'system_notices', order: ['id'] },
    { name: 'undo_snapshots', order: ['id', 't'] },
    { name: 'sync_ops', order: ['revision', 'id', 'seq', 'created_at'], sinceDays: 35, sinceCols: ['created_at', 'at', 'ts'], maxRows: 60000 }, // ★ 2026-11-24 1122g: 列は revision(並び)・期間の列が無ければ新しい順に 60000 行まで
    { name: 'app_state', order: ['key'], filter: 'key=not.like.store_*' },
  ];
  out.tables = { copied: 0, skipped: 0, rows: 0, names: [] };
  for (const tb of TABLES) {
    const prev = manifest.tables && manifest.tables[tb.name];
    if (prev && prev.date === today) { out.tables.skipped++; continue; }
    if (Date.now() > deadline) { out.remaining++; continue; }
    if (dryRun) { out.tables.copied++; out.tables.names.push(tb.name); continue; }
    try {
      let rows = null, usedOrder = '', missing = false;
      // ★ 2026-11-24 1122g(控えの失敗 1 件 = sync_ops「並び替えの列が合いません」): 並び替えの列と期間の列を別々に試す。
      //   以前は失敗のたびに両方を 1 つずつ進めていたため、組み合わせが合う前に候補が尽きていた。
      //   期間の列がどれも無い表は、並び替えの列の新しい順に maxRows 件まで(全履歴を毎晩写して時間切れにならないように)
      const sinceList = (tb.sinceDays && Array.isArray(tb.sinceCols) && tb.sinceCols.length) ? [...tb.sinceCols, null] : [null];
      outer: for (const oc of tb.order) {
        for (const sc of sinceList) {
          try {
            const all = []; let offset = 0; const descCap = (!sc && tb.sinceDays && tb.maxRows) ? Number(tb.maxRows) : 0;
            while (true) {
              let q = `${SUPA_URL}/rest/v1/${tb.name}?select=*&order=${enc(oc)}.${descCap ? 'desc' : 'asc'}&limit=1000&offset=${offset}`;
              if (tb.filter) q += `&${tb.filter}`;
              if (sc) q += `&${enc(sc)}=gte.${enc(new Date(Date.now() - tb.sinceDays * 86400000).toISOString())}`;
              const page = await sbJson(q);
              if (!Array.isArray(page)) throw new Error('rows not array');
              all.push(...page); offset += page.length; if (page.length < 1000) break;
              if (descCap && all.length >= descCap) break;
              if (Date.now() > deadline) throw Object.assign(new Error('時間切れ(次の晩に続きから)'), { fatal: true });
            }
            rows = descCap ? all.reverse() : all; usedOrder = sc ? `${oc}(${sc}≧${tb.sinceDays}日)` : (descCap ? `${oc}(新しい順 ${all.length}行)` : oc); break outer;
          } catch (e) {
            const m = String((e && e.message) || e);
            if (e && e.fatal) throw e;
            if (/404|relation .* does not exist|Could not find the table/.test(m)) { missing = true; break outer; } // 表が無い
            // 列が無い(400)など → 次の期間の列、次の並び替えの列で試す
          }
        }
      }
      if (missing) { out.tables.skipped++; continue; }
      if (!rows) throw new Error('読めませんでした(並び替えの列が合いません)');
      const gz = zlib.gzipSync(Buffer.from(JSON.stringify({ table: tb.name, order: usedOrder, savedAt: new Date().toISOString(), count: rows.length, rows }), 'utf8'), { level: 6 });
      await s3.putObject(`tables/${tb.name}/${today}.json.gz`, gz, 'application/gzip', { 'x-amz-meta-count': String(rows.length) });
      manifest.tables = manifest.tables || {}; manifest.tables[tb.name] = { date: today, count: rows.length, bytes: gz.length, copiedAt: new Date().toISOString() };
      out.tables.copied++; out.tables.rows += rows.length; out.tables.names.push(tb.name); dirty = true;
    } catch (e) {
      out.errors.push({ path: `tables/${tb.name}`, error: maskAws(String((e && e.message) || e)).slice(0, 200) });
    }
  }

  // 2) 写真(Storage)
  let files, listPartial = false;
  try { ({ files } = await listStorageAll(deadline)); }
  catch (e) { if (e.partial) { files = e.files; listPartial = true; out.errors.push({ path: '(一覧)', error: '一覧の途中で時間切れ。次回に続きます' }); } else throw e; }
  out.listed = files.length;
  // ★ 2026-11-19 trial592(ユーザー「484件も写真があるのか」): 種類別の件数(写真/PDF/その他)を要約に
  out.byKind = files.reduce((m, f) => { const ext = String(f.path).toLowerCase().match(/\.([a-z0-9]+)$/); const e = ext ? ext[1] : ''; const k = /^(jpe?g|png|heic|heif|webp|gif)$/.test(e) ? 'photo' : (e === 'pdf' ? 'pdf' : 'other'); m[k] = (m[k] || 0) + 1; return m; }, { photo: 0, pdf: 0, other: 0 });
  // 前に失敗したもの(元が 404 など)は後ろへ回す(毎晩同じものが先頭で枠を使い切らないように)
  const failCount = (p) => (manifest.failed[p] && Number(manifest.failed[p].count)) || 0;
  const todo = files.filter((f) => changed(manifest.files[f.path], f)).sort((a, b) => failCount(a.path) - failCount(b.path));
  out.skipped = files.length - todo.length;
  const limit = Math.max(1, Math.min(Number(maxFiles) || DEFAULT_MAX_FILES, 2000));
  let i = 0;
  const copyOne = async (f) => {
    if (f.size > MAX_FILE_BYTES) { out.errors.push({ path: f.path, error: `大きすぎるため今回は写していません(${Math.round(f.size / 1048576)}MB)` }); return; }
    try {
      const { body, contentType } = await downloadStorage(f.path);
      const put = await s3.putObject(`storage/${f.path}`, body, f.contentType || contentType, { 'x-amz-meta-src-updated-at': f.updatedAt || '' });
      manifest.files[f.path] = { size: f.size, updatedAt: f.updatedAt, etag: f.etag, copiedAt: new Date().toISOString(), s3Etag: put.etag };
      delete manifest.failed[f.path];
      out.copied++; dirty = true;
    } catch (e) {
      const msg = maskAws(String((e && e.message) || e)).slice(0, 200);
      const prev = manifest.failed[f.path] || { count: 0 };
      manifest.failed[f.path] = { count: prev.count + 1, error: msg, at: new Date().toISOString(), firstAt: prev.firstAt || new Date().toISOString() };
      out.errors.push({ path: f.path, error: msg, repeat: prev.count > 0 || undefined }); // repeat = 前の晩も失敗(元が無い等)。ok の判定からは外す
      dirty = true;
    }
  };
  while (i < todo.length && i < limit && Date.now() < deadline) {
    const batch = todo.slice(i, Math.min(i + 8, limit)); i += batch.length;    // 8件ずつ並行(★ trial592: 4→8)
    if (dryRun) { out.copied += batch.length; continue; }
    await Promise.all(batch.map(copyOne));
  }
  out.remaining = Math.max(0, todo.length - i) + (listPartial ? 1 : 0);

  // 3) 台帳と「最後の実行」を書く(dryRun では書かない)
  out.finishedAt = new Date().toISOString(); out.elapsedMs = Date.now() - started;
  const fresh = out.errors.filter((e) => !e.repeat);           // 初めての失敗だけを「異常」と数える(毎晩同じ 404 で ok:false にしない)
  out.ok = fresh.length === 0;
  out.repeatFailures = out.errors.length - fresh.length;
  if (!dryRun) {
    manifest.updatedAt = out.finishedAt; manifest.fileCount = Object.keys(manifest.files).length;
    try { if (dirty || !manifest.createdAt) { manifest.createdAt = manifest.createdAt || out.finishedAt; await s3.putJson(MANIFEST_KEY, manifest); } }
    catch (e) { out.errors.push({ path: MANIFEST_KEY, error: maskAws(String((e && e.message) || e)).slice(0, 200) }); out.ok = false; }
    const summary = { ...out, errors: out.errors.slice(0, 50), errorCount: out.errors.length, totalFiles: Object.keys(manifest.files).length, totalStores: Object.keys(manifest.appState).length, totalRecordStores: Object.keys(manifest.records || {}).length, totalTables: Object.keys(manifest.tables || {}).length, totalFailed: Object.keys(manifest.failed).length };
    try { await s3.putJson(LAST_RUN_KEY, summary); } catch { /* 要約が書けなくても控え自体はできている */ }
  }
  out.totalFiles = Object.keys(manifest.files).length;
  console.log(`[backup-photos] ${dryRun ? 'dryRun ' : ''}listed=${out.listed} copied=${out.copied} skipped=${out.skipped} remaining=${out.remaining} appState=${out.appState.copied} errors=${out.errors.length} ${out.elapsedMs}ms`);
  return out;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!SUPA_URL || !SERVICE_KEY) return res.status(500).json({ error: 'サーバー設定エラー: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です' });
  const q = req.query || {};
  let body = {};
  if (req.method === 'POST') { try { body = typeof req.body === 'object' && req.body ? req.body : JSON.parse(req.body || '{}'); } catch { body = {}; } }
  const dryRun = String(q.dryRun || body.dryRun || '') === '1' || body.dryRun === true;
  try {
    if (req.method === 'GET') {
      // Vercel Cron。CRON_SECRET を設定しているときはそれを確かめる(push.js と同じ)
      const secret = process.env.CRON_SECRET;
      const ua = String(req.headers['user-agent'] || '');
      if (secret ? req.headers.authorization !== `Bearer ${secret}` : !/vercel-cron/i.test(ua)) return res.status(401).json({ error: 'Unauthorized' });
      const r = await runBackup({ dryRun, trigger: 'cron' });
      return res.status(200).json(r); // 未設定(configured:false)も 200 で返す(Cron の失敗扱いにしない)
    }
    if (req.method === 'POST') {
      if (!secretOk(body.secret)) return res.status(401).json({ error: '合言葉が違います' });
      const r = await runBackup({ dryRun, maxFiles: body.maxFiles, budgetMs: body.budgetMs, trigger: 'manual' });
      return res.status(200).json(r);
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: maskAws(String((e && e.message) || e)).slice(0, 300) });
  }
}
