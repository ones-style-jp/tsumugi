// 2026-10-27 従業員向け「予定の通知」のご案内の画面写真(見本データ・通知の送り先は偽物)。安定版の見本ビルドを 4173 で配信してから
//   node scripts/push_staff_shots.mjs --port 4173 --out <dir>
import { chromium } from 'playwright';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const PORT = arg('--port', '4173'); const OUT = arg('--out', 'public/manual/img');
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'ja-JP', hasTouch: true, isMobile: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36' });
await ctx.grantPermissions(['notifications'], { origin: `http://localhost:${PORT}` });
const page = await ctx.newPage(); page.on('dialog', d => d.accept());
let registered = false;
await page.route('**/api/push', async (route) => { const body = JSON.parse(route.request().postData() || '{}');
  if (body.action === 'subscribe') registered = true; if (body.action === 'unsubscribe') registered = false;
  const j = body.action === 'key' ? { publicKey: 'BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' } : body.action === 'status' ? { count: registered ? 3 : 2, registered: body.endpoint ? registered : null } : { ok: true, count: 3 };
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(j) }); });
await page.addInitScript(() => {
  const mk = () => ({ endpoint: 'https://push.example.test/abc', toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'p', auth: 'a' } }; }, async unsubscribe() { sessionStorage.removeItem('__fakeSub'); return true; } });
  try { Object.defineProperty(Notification, 'permission', { get: () => 'granted' }); Notification.requestPermission = async () => 'granted'; } catch {}
  if (window.PushManager) { PushManager.prototype.subscribe = async function () { sessionStorage.setItem('__fakeSub', '1'); return mk(); }; PushManager.prototype.getSubscription = async function () { return sessionStorage.getItem('__fakeSub') ? mk() : null; }; }
});
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
await page.evaluate(() => { sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'settings', pid: null, t: Date.now() })); });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2200); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
// 1) 各種設定の検索に「通知」
await page.getByTestId('settings-search-input').fill('通知'); await page.waitForTimeout(400);
{ const box = await page.getByTestId('settings-search-input').evaluate(el => { let p = el.parentElement; for (let i = 0; i < 2 && p.parentElement; i++) p = p.parentElement; const r = p.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width }; });
  const hits = page.locator('[data-testid^="settings-search-hit-"]'); const last = await hits.last().boundingBox();
  await page.screenshot({ path: `${OUT}/push_search.png`, clip: { x: 0, y: Math.max(0, box.y - 8), width: 390, height: Math.min(844, last.y + last.height - box.y + 20) } }); }
await page.locator('[data-testid^="settings-search-hit-"]', { hasText: /この端末の通知/ }).first().click(); await page.waitForTimeout(1200);
const card = (t) => page.locator(`[data-sec-title="${t}"]`);
// 上に貼り付く帯(タブ・保存)に重ならないよう、欄を画面の真ん中へ動かしてから撮る
const shot = async (t, name) => { await card(t).evaluate(el => el.scrollIntoView({ block: 'center' })); await page.waitForTimeout(400); await card(t).screenshot({ path: `${OUT}/${name}.png` }); };
// 2) はじめ(この端末には届きません)
await shot('この端末の通知', 'push_card_off');
// 3) 「この端末に通知を届ける」のあと
await page.getByTestId('push-enable').click(); await page.waitForTimeout(2500); await shot('この端末の通知', 'push_card_on');
// 4) テスト通知 → 届きました(通知の仕組みからの知らせを画面へ送る)
await page.getByTestId('push-test').click(); await page.waitForTimeout(500);
await page.evaluate(() => navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { type: 'tsu-push', tag: 'tsumugi-test-1', shown: true } })));
await page.getByTestId('push-test-result').waitFor({ timeout: 5000 }); await page.waitForTimeout(300); await shot('この端末の通知', 'push_card_test');
// 5) 店舗の設定
await shot('予定のお知らせ（店舗の設定）', 'push_store');
console.log('shots ok'); await b.close();
