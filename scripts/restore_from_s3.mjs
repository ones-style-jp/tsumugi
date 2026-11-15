// つむぎ: AWS S3 の「写真の控え」から本部の PC へ取り出す(2026-11-16)。Supabase へは書かない(戻す作業は手順書どおり本部が行う)。
//
// 使い方(鍵は環境変数で渡す。コマンドの引数には書かない・履歴に残るため)
//   export AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_BUCKET=tsumugi-backup-xxxx   (AWS_REGION は省略で大阪)
//   node scripts/restore_from_s3.mjs --list [--prefix storage/pf/14/] [--since 2026-11-01]        一覧だけ(取り出さない)
//   node scripts/restore_from_s3.mjs --download --out ~/Desktop/tsumugi_restore [--prefix storage/] [--since 2026-11-01]
//   node scripts/restore_from_s3.mjs --store store_ogibashi --out ~/Desktop/tsumugi_restore [--since 2026-11-01]
//         店舗データ本体(いちばん新しい app_state の控え)に出てくる写真のパスだけを取り出す(写真の置き場所に店舗の区別が無いため)
//   node scripts/restore_from_s3.mjs --app-state store_ogibashi 2026-11-16 --out ~/Desktop/tsumugi_restore
//         その日の店舗データ本体(JSON)を1つ取り出す(gzip をほどいて .json で保存)
//   node scripts/restore_from_s3.mjs --status            最後の控え(manifest/last_run.json)を表示
//
// 取り出した先: <out>/storage/<Storage と同じパス> ・ <out>/app_state/<店舗ID>/<日付>.json
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { S3Client, DEFAULT_REGION } from '../api/_s3.js';

const argv = process.argv.slice(2);
const has = (k) => argv.includes(k);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const log = (...a) => console.log('[restore]', ...a);

const cfg = { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY, region: process.env.AWS_REGION || DEFAULT_REGION, bucket: process.env.AWS_BUCKET };
if (!cfg.accessKeyId || !cfg.secretAccessKey || !cfg.bucket) {
  console.error('環境変数 AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_BUCKET を設定してから実行してください(値は画面にもコマンドにも書かないこと)。');
  process.exit(2);
}
const s3 = new S3Client(cfg);
const OUT = path.resolve(arg('--out', path.join(process.cwd(), 'tsumugi_restore')));
const SINCE = arg('--since', '');
const sinceMs = SINCE ? new Date(SINCE + (SINCE.length === 10 ? 'T00:00:00+09:00' : '')).getTime() : 0;
if (SINCE && !Number.isFinite(sinceMs)) { console.error('--since は 2026-11-01 の形で指定してください'); process.exit(2); }
const fmtMB = (n) => (n / 1048576).toFixed(2) + 'MB';
const safeRel = (key) => { const rel = String(key).split('/').filter((s) => s && s !== '.' && s !== '..').join(path.sep); if (!rel) throw new Error('不正なキー: ' + key); return rel; };

async function saveKey(key, buf) {
  const file = path.join(OUT, safeRel(key));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
  return file;
}
async function downloadKeys(keys) {
  let n = 0, bytes = 0; const failed = [];
  for (const key of keys) {
    try {
      const o = await s3.getObject(key);
      if (!o) { failed.push({ key, error: 'S3 にありません' }); continue; }
      await saveKey(key, o.body); n++; bytes += o.size;
      if (n % 25 === 0) log(`${n}/${keys.length} 件(${fmtMB(bytes)})`);
    } catch (e) { failed.push({ key, error: String((e && e.message) || e) }); }
  }
  log(`取り出し完了: ${n} 件 / ${fmtMB(bytes)} → ${OUT}`);
  if (failed.length) { log(`取り出せなかったもの ${failed.length} 件:`); failed.slice(0, 30).forEach((f) => log('  ', f.key, f.error)); }
  return { n, bytes, failed };
}
const filterSince = (items) => (sinceMs ? items.filter((it) => new Date(it.lastModified).getTime() >= sinceMs) : items);

async function latestAppStateKey(storeId) {
  const items = await s3.listAll(`app_state/${storeId}/`);
  const days = items.filter((it) => /\.json\.gz$/.test(it.key)).sort((a, b) => (a.key < b.key ? -1 : 1));
  return days.length ? days[days.length - 1].key : null;
}
async function readAppState(key) {
  const o = await s3.getObject(key);
  if (!o) return null;
  const txt = zlib.gunzipSync(o.body).toString('utf8');
  return { txt, json: JSON.parse(txt) };
}

if (has('--status')) {
  const last = await s3.getJson('manifest/last_run.json', null);
  const man = await s3.getJson('manifest/latest.json', null);
  if (!last) log('まだ1回も控えが取られていません(manifest/last_run.json が無い)');
  else log('最後の控え:', JSON.stringify({ finishedAt: last.finishedAt, ok: last.ok, copied: last.copied, skipped: last.skipped, remaining: last.remaining, errorCount: last.errorCount, totalFiles: last.totalFiles, appState: last.appState && { copied: last.appState.copied, skipped: last.appState.skipped } }, null, 2));
  if (man) { log(`台帳: ファイル ${Object.keys(man.files || {}).length} 件・更新 ${man.updatedAt}`); Object.entries(man.appState || {}).forEach(([k, v]) => log(`  ${k}: ${v.date} (version ${v.version})`)); }
  process.exit(0);
}

if (has('--app-state')) {
  const i = argv.indexOf('--app-state'); const storeId = argv[i + 1]; const date = argv[i + 2];
  if (!storeId || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) { console.error('--app-state <店舗ID> <YYYY-MM-DD> の形で指定してください'); process.exit(2); }
  const key = `app_state/${storeId}/${date}.json.gz`;
  const r = await readAppState(key);
  if (!r) { log(`無い: ${key}`); const items = await s3.listAll(`app_state/${storeId}/`); log('ある日付:', items.map((it) => it.key.split('/').pop().replace('.json.gz', '')).join(' ')); process.exit(1); }
  const file = await saveKey(`app_state/${storeId}/${date}.json`, Buffer.from(r.txt, 'utf8'));
  const d = r.json && r.json.data ? r.json.data : {};
  log(`保存: ${file}`); log(`version ${r.json.version}・利用者 ${Array.isArray(d.patients) ? d.patients.length : '?'} 名・記録 ${Array.isArray(d.records) ? d.records.length : '?'} 件・保存時刻 ${r.json.savedAt}`);
  process.exit(0);
}

if (has('--store')) {
  const storeId = arg('--store', '');
  if (!storeId) { console.error('--store <店舗ID> を指定してください'); process.exit(2); }
  const key = await latestAppStateKey(storeId);
  if (!key) { log(`店舗データ本体の控えがありません: app_state/${storeId}/`); process.exit(1); }
  log(`店舗データ本体の控え: ${key}`);
  const r = await readAppState(key);
  // files.js の storeHasPath と同じ考え方: 店舗データ本体に出てくる Storage のパスだけが、その店舗のもの
  const found = new Set(); const re = /"((?:pf|fs|news|misc)\/[A-Za-z0-9_\-./]+)"/g; let m;
  while ((m = re.exec(r.txt))) found.add(m[1]);
  log(`店舗データに出てくる写真・書類のパス: ${found.size} 件`);
  const inS3 = filterSince(await s3.listAll('storage/'));
  const have = new Map(inS3.map((it) => [it.key, it]));
  const keys = [...found].map((p) => 'storage/' + p).filter((k) => have.has(k));
  const missing = [...found].filter((p) => !have.has('storage/' + p));
  log(`S3 にある: ${keys.length} 件${SINCE ? `(${SINCE} 以降に写したもの)` : ''}・無い: ${missing.length} 件`);
  if (missing.length) missing.slice(0, 20).forEach((p) => log('  無い:', p));
  if (has('--list') || (!has('--download') && !has('--out'))) { keys.forEach((k) => console.log(k)); log('取り出すには --out <フォルダ> を付けてください'); process.exit(0); }
  await downloadKeys(keys);
  await saveKey(`app_state/${storeId}/${key.split('/').pop().replace('.gz', '')}`, Buffer.from(r.txt, 'utf8'));
  process.exit(0);
}

// --list / --download(prefix で絞る)
{
  const prefix = arg('--prefix', 'storage/');
  const items = filterSince(await s3.listAll(prefix));
  const total = items.reduce((s, it) => s + it.size, 0);
  log(`${prefix} の下: ${items.length} 件 / ${fmtMB(total)}${SINCE ? `(${SINCE} 以降)` : ''}`);
  if (!has('--download')) { items.forEach((it) => console.log(`${it.lastModified}  ${String(it.size).padStart(10)}  ${it.key}`)); if (!has('--list')) log('取り出すには --download --out <フォルダ> を付けてください'); process.exit(0); }
  await downloadKeys(items.map((it) => it.key));
}
