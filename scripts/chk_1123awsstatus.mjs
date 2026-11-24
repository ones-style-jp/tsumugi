// 2026-11-23 trial620 ユーザー「AWS にちゃんと保存されているか確認してほしい」→ 管理局 → 外部サービス設定 → AWS S3（写真の控え）に「控えの最後の実行を見る」
//   ① 合言葉を入れて一覧を出すと AWS のカードにボタンがある・押すと /api/backup-status に合言葉で問い合わせ、保存先・最後の実行・件数・店舗が出る(正常)
//   ② 最後の実行が 1 日以上前なら「注意」が出る・エラーがあれば「エラー N 件」
//   ③ AWS が未設定なら「設定がまだありません」
//   ④ 合言葉が違えば API の error をそのまま出す
//   実行: node scripts/chk_1123awsstatus.mjs [port]   (VITE_E2E_DEMO=1 のビルド・#hqservices)
import { chromium } from 'playwright';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
const b = await chromium.launch(); const r = {};
const SERVICES = { services: [ { id: 'aws_backup', name: 'AWS S3（写真の控え）', vendor: 'Amazon', status: 'active', configured: true, required: false, test: 'aws', desc: '写真・PDF と店舗データの控え', fields: [] },
  { id: 'interfax', name: 'InterFAX', vendor: 'InterFAX', status: 'active', configured: false, required: false, fields: [] } ] };
const run = async (status, label) => {
  const ctx = await b.newContext({ viewport: { width: 1000, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  const calls = [];
  await page.route('**/api/admin-secrets', async (route) => { const body = JSON.parse(route.request().postData() || '{}'); calls.push(['secrets', body.action, body.secret]); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SERVICES) }); });
  await page.route('**/api/backup-status', async (route) => { const body = JSON.parse(route.request().postData() || '{}'); calls.push(['status', body.secret, Object.keys(body).join(',')]); await route.fulfill({ status: status.http || 200, contentType: 'application/json', body: JSON.stringify(status.json) }); });
  await page.goto(`http://localhost:${PORT}/#hqservices`, { waitUntil: 'networkidle' }); await page.waitForTimeout(600);
  await page.getByText('外部サービス設定（全店共通').first().click(); await page.waitForTimeout(400);
  const pw = page.getByTestId('hq-secret'); await pw.fill('e2e-secret'); await pw.press('Enter'); await page.waitForTimeout(600);
  const btn = page.getByTestId('aws-backup-status-btn'); const has = await btn.count();
  if (has) { await btn.click(); await page.waitForTimeout(600); }
  const t = await page.locator('body').innerText();
  console.log(label, 'ボタン', has, '呼び出し', JSON.stringify(calls.filter(c => c[0] === 'status')), '|', t.replace(/\s+/g, ' ').slice(t.indexOf('控えの最後の実行を見る'), t.indexOf('控えの最後の実行を見る') + 260));
  await ctx.close(); return { has, calls, t };
};
const now = Date.now();
{ const j = { ok: true, configured: true, bucket: 'tsumugi-backup-e2e', region: 'ap-northeast-3', totalFiles: 1234, manifestUpdatedAt: new Date(now - 3 * 3600e3).toISOString(),
    lastRun: { startedAt: new Date(now - 3.2 * 3600e3).toISOString(), finishedAt: new Date(now - 3 * 3600e3).toISOString(), elapsedMs: 212000, trigger: 'cron', ok: true, copied: 12, skipped: 1200, remaining: 0, errorCount: 0, errors: [], appState: { copied: 9 }, totalFiles: 1234, totalStores: 9 },
    stores: [ { store: 'store_a', date: '2026-11-23' }, { store: 'store_b', date: '2026-11-23' } ] };
  const o = await run({ json: j }, '①正常');
  r.okView = o.has === 1 && o.calls.some(c => c[0] === 'status' && c[1] === 'e2e-secret' && c[2] === 'secret') && (await (async () => true)()) && /tsumugi-backup-e2e/.test(o.t) && /1,234 件/.test(o.t) && /正常に終わりました/.test(o.t) && /新しく控えた 12 件/.test(o.t) && /9 店舗を控えました/.test(o.t) && /store_a（2026-11-23）/.test(o.t) && !/注意: 最後の実行から/.test(o.t); }
{ const j = { ok: true, configured: true, bucket: 'tsumugi-backup-e2e', region: 'ap-northeast-3', totalFiles: 10, manifestUpdatedAt: new Date(now - 50 * 3600e3).toISOString(),
    lastRun: { startedAt: new Date(now - 50.1 * 3600e3).toISOString(), finishedAt: new Date(now - 50 * 3600e3).toISOString(), elapsedMs: 5000, trigger: 'cron', ok: false, copied: 0, skipped: 10, remaining: 3, errorCount: 2, errors: ['pf/1/a.jpg: timeout', 'pf/2/b.jpg: 403'], appState: { copied: 0 } }, stores: [] };
  const o = await run({ json: j }, '②古い・エラー');
  r.oldNg = /注意: 最後の実行から 1 日以上/.test(o.t) && /エラー 2 件/.test(o.t) && /timeout/.test(o.t); }
{ const o = await run({ json: { ok: true, configured: false, message: 'AWS の設定がまだありません' } }, '③未設定'); r.none = /設定がまだありません/.test(o.t); }
{ const o = await run({ http: 401, json: { error: '本部だけが見られます' } }, '④合言葉違い'); r.err = /本部だけが見られます/.test(o.t); }
await b.close();
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'ALL PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
