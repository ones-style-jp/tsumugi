// 2026-10-27 通知の画面: 各種設定→システム「この端末の通知」(許可→登録→テスト→止める)・「予定のお知らせ（店舗の設定）」・通知を押して開く(?tsugo=schedule)
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4173'; })();
const b = await chromium.launch(); const r = {};
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ja-JP' }); await ctx.grantPermissions(['notifications'], { origin: `http://localhost:${PORT}` });
const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
const calls = [];
await page.route('**/api/push', async (route) => { const body = JSON.parse(route.request().postData() || '{}'); calls.push(body);
  const j = body.action === 'key' ? { publicKey: 'BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' } : body.action === 'status' ? { count: calls.filter(c => c.action === 'subscribe').length - calls.filter(c => c.action === 'unsubscribe').length } : { ok: true, count: 1 };
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(j) }); });
await page.addInitScript(() => {
  // 自動テストのブラウザには通知の送り先が無いので、登録だけ偽物にする(サーバーとのやり取り・画面の流れを確かめる)
  let sub = null; const mk = () => ({ endpoint: 'https://push.example.test/abc', toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'p', auth: 'a' } }; }, async unsubscribe() { sub = null; return true; } });
  try { Object.defineProperty(Notification, 'permission', { get: () => 'granted' }); Notification.requestPermission = async () => 'granted'; } catch {} /* ヘッドレスは許可しても denied と返るため */
  if (window.PushManager) { PushManager.prototype.subscribe = async function () { sub = mk(); return sub; }; PushManager.prototype.getSubscription = async function () { return sub; }; }
});
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
await page.evaluate(() => { localStorage.setItem('tsumugiSidebarOpen', '0'); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'settings', pid: null, t: Date.now() })); });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
await page.getByTestId('settings-search-input').fill('通知'); await page.waitForTimeout(300);
await page.locator('[data-testid^="settings-search-hit-"]', { hasText: /この端末の通知/ }).first().click(); await page.waitForTimeout(900);
r.cards = (await page.getByTestId('push-device-card').count()) === 1 && (await page.getByTestId('push-store-card').count()) === 1;
r.offAtStart = /この端末には届きません/.test(await page.getByTestId('push-state').innerText());
await page.getByTestId('push-enable').click(); await page.waitForTimeout(2500);
const sub = calls.find(c => c.action === 'subscribe');
r.subscribed = !!sub && sub.sub && sub.sub.endpoint === 'https://push.example.test/abc' && sub.origin === `http://localhost:${PORT}` && /この端末に届きます/.test(await page.getByTestId('push-state').innerText());
r.swRegistered = await page.evaluate(async () => { const reg = await navigator.serviceWorker.getRegistration('/'); return !!reg && String((reg.active || reg.waiting || reg.installing || {}).scriptURL || '').includes('sw-push.js'); });
await page.getByTestId('push-test').click(); await page.waitForTimeout(600); r.testCall = calls.some(c => c.action === 'test' && c.endpoint === 'https://push.example.test/abc') && /テスト通知を送りました/.test(await page.getByTestId('push-msg').innerText());
// 店舗の設定: 担当者会議のラベルを外す → systemSettings.pushNotify.offColors に入る
await page.getByTestId('push-cfg-label-3b82f6').click(); await page.waitForTimeout(600);
r.labelOff = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); return ((d.systemSettings.pushNotify || {}).offColors || []).includes('#3b82f6'); });
await page.getByTestId('push-cfg-before-min').selectOption('60'); await page.waitForTimeout(500);
r.beforeMin = await page.evaluate(() => (JSON.parse(localStorage.getItem('daycareAppData_v3')).systemSettings.pushNotify || {}).beforeMin === 60);
await page.getByTestId('push-disable').click(); await page.waitForTimeout(800); r.disabled = calls.some(c => c.action === 'unsubscribe') && /この端末には届きません/.test(await page.getByTestId('push-state').innerText());
// 通知を押して開く → カレンダー・URL の印は消える
await page.goto(`http://localhost:${PORT}/?tsugo=schedule`, { waitUntil: 'networkidle' }); await page.waitForTimeout(2000); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
r.opensSchedule = (await page.getByText('スケジュール', { exact: true }).count()) > 0 && !page.url().includes('tsugo');
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
