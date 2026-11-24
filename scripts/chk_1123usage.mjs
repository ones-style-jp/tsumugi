// 2026-11-23 trial621 ユーザー「従量課金のところは個数と料金が表示されるといい」「控えの失敗 1 件がどれか」
//   ① 管理局 → 外部サービス設定 → 合言葉 → 「利用量と概算の料金を見る」→ /api/usage-summary に合言葉で問い合わせ、AWS の容量と概算・InterFAX の残高と今月・Brevo の今月・取れないものが出る
//   ② API の error はそのまま出る
//   ③ 「控えの最後の実行を見る」に失敗しているファイルの一覧(道筋・回数・理由)が出る
//   実行: node scripts/chk_1123usage.mjs [port]   (VITE_E2E_DEMO=1 のビルド・#hqservices)
import { chromium } from 'playwright';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
const b = await chromium.launch(); const r = {};
const SERVICES = { services: [ { id: 'aws_backup', name: 'AWS S3（写真の控え）', vendor: 'Amazon', status: 'active', configured: true, required: false, test: 'aws', desc: '控え', fields: [] } ] };
const USAGE = { ok: true, at: new Date().toISOString(), rates: { s3UsdPerGbMonth: 0.025, usdJpy: 150, brevoFreePerDay: 300 },
  aws: { configured: true, bucket: 'tsumugi-backup-e2e', region: 'ap-northeast-3', objects: 1480, bytes: 2.5 * 1073741824, gb: 2.5, by: { photos: { n: 478, bytes: 1.8 * 1073741824 }, appState: { n: 330, bytes: 0.4 * 1073741824 }, records: { n: 300, bytes: 0.2 * 1073741824 }, tables: { n: 270, bytes: 0.1 * 1073741824 }, other: { n: 2, bytes: 1000 } }, estUsdMonth: 0.063, estJpyMonth: 9, failedCount: 1, failed: [] },
  interfax: { configured: true, balance: '1234.5', month: { count: 7, pages: 12, units: 12, cost: 290.4, failed: 1 }, note: '' },
  brevo: { configured: true, from: '2026-11-01', to: '2026-11-23', requests: 42, delivered: 40, hardBounces: 1, softBounces: 1, blocked: 0, spamReports: 0, freePerDay: 300 },
  anthropic: { configured: true, ym: '2026-11', month: { calls: 23, input: 45000, output: 12000, estUsd: 0.105, estJpy: 16 }, byStore: { store_ogibashi: { calls: 20, input: 40000, output: 10000 }, store_test: { calls: 3, input: 5000, output: 2000 } }, byFam: { haiku: 23 }, since: '2026-11-24',
    months: [ { ym: '2026-11', calls: 23, input: 45000, output: 12000, estUsd: 0.105, estJpy: 16, byStore: { store_ogibashi: { calls: 20 }, store_test: { calls: 3 } } }, { ym: '2026-10', calls: 310, input: 600000, output: 150000, estUsd: 1.35, estJpy: 203, byStore: { store_ogibashi: { calls: 310 } } } ] },
  unavailable: [ { id: 'supabase', name: 'Supabase（データベース・写真の置き場）', why: '管理画面(Usage)でだけ' } ] };
const STATUS = { ok: true, configured: true, bucket: 'tsumugi-backup-e2e', region: 'ap-northeast-3', totalFiles: 478, manifestUpdatedAt: new Date().toISOString(),
  lastRun: { startedAt: new Date(Date.now() - 3600e3).toISOString(), finishedAt: new Date().toISOString(), elapsedMs: 1000, trigger: 'cron', ok: true, copied: 0, skipped: 478, remaining: 0, errorCount: 0, errors: [], appState: { copied: 11 } },
  stores: [], failed: [ { path: 'pf/12/photo_abc.jpg', count: 7, error: 'HTTP 404 Object not found', at: new Date().toISOString() } ] };
const open = async (usageResp) => {
  const ctx = await b.newContext({ viewport: { width: 1000, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  const calls = [];
  await page.route('**/api/admin-secrets', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SERVICES) }); });
  await page.route('**/api/usage-summary', async (route) => { const body = JSON.parse(route.request().postData() || '{}'); calls.push([body.secret, Object.keys(body).join(',')]); await route.fulfill({ status: usageResp.http || 200, contentType: 'application/json', body: JSON.stringify(usageResp.json) }); });
  await page.route('**/api/backup-status', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STATUS) }); });
  await page.goto(`http://localhost:${PORT}/#hqservices`, { waitUntil: 'networkidle' }); await page.waitForTimeout(600);
  await page.getByText('外部サービス設定（全店共通').first().click(); await page.waitForTimeout(400);
  const pw = page.getByTestId('hq-secret'); await pw.fill('e2e-secret'); await pw.press('Enter'); await page.waitForTimeout(600);
  return { ctx, page, calls };
};
{ const { ctx, page, calls } = await open({ json: USAGE });
  const btn = page.getByTestId('usage-btn'); r.cardBtn = (await page.getByTestId('usage-card').count()) === 1 && (await btn.count()) === 1;
  await btn.click(); await page.waitForTimeout(600); const t = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  console.log('①', JSON.stringify(calls), '|', t.slice(t.indexOf('AWS S3（写真・店舗データ'), t.indexOf('AWS S3（写真・店舗データ') + 420));
  r.usageView = calls.length === 1 && calls[0][0] === 'e2e-secret' && calls[0][1] === 'secret' && /置いてある数 1,480 件・容量 2\.50 GB/.test(t) && /写真・PDF 1\.80 GB/.test(t) && /約 9 円／月/.test(t) && /残高 1234\.5/.test(t) && /7 通・12 枚・料金 290\.4/.test(t) && /失敗 1 通/.test(t) && /送信 42 通・届いた 40・不達 2/.test(t) && /Supabase（データベース/.test(t) && /控えに失敗しているファイル: 1 件/.test(t)
    && (await page.getByTestId('usage-ai').count()) === 1 && /今月（2026-11）23 回・入力 45,000 トークン・出力 12,000 トークン/.test(t) && /約 16 円/.test(t) && /store_ogibashi 20 回・store_test 3 回/.test(t)
    && (await page.getByTestId('usage-ai-months').count()) === 1 && /2026年11月（今月） 23 45,000 12,000 約 16/.test(t) && /2026年10月 310 600,000 150,000 約 203 store_ogibashi 310/.test(t);
  // ③ 失敗の一覧
  await page.getByTestId('aws-backup-status-btn').click(); await page.waitForTimeout(600); const t2 = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  r.failedList = (await page.getByTestId('aws-backup-failed').count()) === 1 && /控えに失敗しているファイル 1 件/.test(t2) && /pf\/12\/photo_abc\.jpg 7 回 HTTP 404 Object not found 最後/.test(t2);
  console.log('③', t2.slice(t2.indexOf('控えに失敗しているファイル 1 件'), t2.indexOf('控えに失敗しているファイル 1 件') + 120));
  await ctx.close(); }
{ const { ctx, page } = await open({ http: 401, json: { error: '本部だけが見られます' } }); await page.getByTestId('usage-btn').click(); await page.waitForTimeout(500);
  r.err = (await page.getByTestId('usage-err').innerText().catch(() => '')).includes('本部だけが見られます'); console.log('②', r.err); await ctx.close(); }
await b.close();
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'ALL PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
