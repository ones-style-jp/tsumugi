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
const DEFAULT_MAX_FILES = 150;
const DEFAULT_BUDGET_MS = 45 * 1000;             // vercel.json の maxDuration 60 秒より手前で止める
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

  // 1) 写真(Storage)
  let files, listPartial = false;
  try { ({ files } = await listStorageAll(deadline)); }
  catch (e) { if (e.partial) { files = e.files; listPartial = true; out.errors.push({ path: '(一覧)', error: '一覧の途中で時間切れ。次回に続きます' }); } else throw e; }
  out.listed = files.length;
  // 前に失敗したもの(元が 404 など)は後ろへ回す(毎晩同じものが先頭で枠を使い切らないように)
  const failCount = (p) => (manifest.failed[p] && Number(manifest.failed[p].count)) || 0;
  const todo = files.filter((f) => changed(manifest.files[f.path], f)).sort((a, b) => failCount(a.path) - failCount(b.path));
  out.skipped = files.length - todo.length;
  const limit = Math.max(1, Math.min(Number(maxFiles) || DEFAULT_MAX_FILES, 2000));
  let i = 0; let dirty = false;
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
    const batch = todo.slice(i, Math.min(i + 4, limit)); i += batch.length;    // 4件ずつ並行
    if (dryRun) { out.copied += batch.length; continue; }
    await Promise.all(batch.map(copyOne));
  }
  out.remaining = Math.max(0, todo.length - i) + (listPartial ? 1 : 0);

  // 2) 店舗データ本体(1日1回・店舗ごと)
  const today = jstDate(started);
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

  // 3) 台帳と「最後の実行」を書く(dryRun では書かない)
  out.finishedAt = new Date().toISOString(); out.elapsedMs = Date.now() - started;
  const fresh = out.errors.filter((e) => !e.repeat);           // 初めての失敗だけを「異常」と数える(毎晩同じ 404 で ok:false にしない)
  out.ok = fresh.length === 0;
  out.repeatFailures = out.errors.length - fresh.length;
  if (!dryRun) {
    manifest.updatedAt = out.finishedAt; manifest.fileCount = Object.keys(manifest.files).length;
    try { if (dirty || !manifest.createdAt) { manifest.createdAt = manifest.createdAt || out.finishedAt; await s3.putJson(MANIFEST_KEY, manifest); } }
    catch (e) { out.errors.push({ path: MANIFEST_KEY, error: maskAws(String((e && e.message) || e)).slice(0, 200) }); out.ok = false; }
    const summary = { ...out, errors: out.errors.slice(0, 50), errorCount: out.errors.length, totalFiles: Object.keys(manifest.files).length, totalStores: Object.keys(manifest.appState).length, totalFailed: Object.keys(manifest.failed).length };
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
