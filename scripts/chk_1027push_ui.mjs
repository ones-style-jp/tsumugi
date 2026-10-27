// 2026-10-27 通知の画面: 各種設定→システム「この端末の通知」(許可→登録→テスト→止める)・「予定のお知らせ（店舗の設定）」・通知を押して開く(?tsugo=schedule)
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4173'; })();
const b = await chromium.launch(); const r = {};
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ja-JP' }); await ctx.grantPermissions(['notifications'], { origin: `http://localhost:${PORT}` });
const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
const calls = []; let registered = false;
await page.route('**/api/push', async (route) => { const body = JSON.parse(route.request().postData() || '{}'); calls.push(body);
  if (body.action === 'subscribe') registered = true; if (body.action === 'unsubscribe') registered = false;
  const j = body.action === 'key' ? { publicKey: 'BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' } : body.action === 'status' ? { count: registered ? 1 : 0, registered: body.endpoint ? registered : null } : body.action === 'unsubscribe' ? { ok: true, remaining: 0 } : { ok: true, count: 1 };
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(j) }); });
await page.addInitScript(() => {
  // 自動テストのブラウザには通知の送り先が無いので、登録だけ偽物にする(サーバーとのやり取り・画面の流れを確かめる)
  const mk = () => ({ endpoint: 'https://push.example.test/abc', toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'p', auth: 'a' } }; }, async unsubscribe() { sessionStorage.removeItem('__fakeSub'); return true; } });
  try { Object.defineProperty(Notification, 'permission', { get: () => 'granted' }); Notification.requestPermission = async () => 'granted'; } catch {} /* ヘッドレスは許可しても denied と返るため */
  if (window.PushManager) { PushManager.prototype.subscribe = async function () { sessionStorage.setItem('__fakeSub', '1'); return mk(); }; PushManager.prototype.getSubscription = async function () { return sessionStorage.getItem('__fakeSub') ? mk() : null; }; }
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
// trial432: サーバー側で登録が外れていたら、開いたときに自動で戻る
registered = false; const nSub0 = calls.filter(c => c.action === 'subscribe').length;
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
await page.getByTestId('settings-search-input').fill('通知'); await page.waitForTimeout(300); await page.locator('[data-testid^="settings-search-hit-"]', { hasText: /この端末の通知/ }).first().click(); await page.waitForTimeout(1500);
r.autoReRegister = calls.filter(c => c.action === 'subscribe').length > nSub0 && /この端末に届きます/.test(await page.getByTestId('push-state').innerText());
await page.getByTestId('push-test').click(); await page.waitForTimeout(600); r.testCall = calls.some(c => c.action === 'test' && c.endpoint === 'https://push.example.test/abc') && /テスト通知を送りました/.test(await page.getByTestId('push-msg').innerText());
// trial433: テスト通知が端末(sw-push.js)に届いたら、画面に「届きました」と出る(本物の通知の仕組みへ CDP で届ける)
{ const cdp = await ctx.newCDPSession(page); const regs = []; cdp.on('ServiceWorker.workerRegistrationUpdated', ev => { for (const g of ev.registrations || []) regs.push(g); });
  await cdp.send('ServiceWorker.enable'); await page.waitForTimeout(500);
  const g = regs.find(x => String(x.scopeURL || '').startsWith(`http://localhost:${PORT}/`) && !x.isDeleted);
  if (g) await cdp.send('ServiceWorker.deliverPushMessage', { origin: `http://localhost:${PORT}`, registrationId: g.registrationId, data: JSON.stringify({ title: 'つむぎ 通知のテスト', body: 'テスト', tag: 'tsumugi-test-1' }) });
  await page.getByTestId('push-test-result').waitFor({ timeout: 8000 }).catch(() => {});
  const res = await page.getByTestId('push-test-result').getAttribute('data-res').catch(() => null);
  const txt = res ? await page.getByTestId('push-test-result').innerText() : '';
  r.arriveShown = !!g && (res === 'shown' || res === 'blocked') && /出ないとき/.test(txt); if (!r.arriveShown) console.log('ARRIVE', !!g, res, txt.slice(0, 80)); }
// 届いた知らせが無いときは、15秒待ったあとで「知らせがありません」と案内が出る
await page.getByTestId('push-test').click(); await page.waitForTimeout(16500);
r.arriveNone = (await page.getByTestId('push-test-result').getAttribute('data-res').catch(() => null)) === 'none' && /知らせがありません/.test(await page.getByTestId('push-test-result').innerText());
// 店舗の設定: 担当者会議のラベルを外す → systemSettings.pushNotify.offColors に入る
await page.getByTestId('push-cfg-label-3b82f6').click(); await page.waitForTimeout(600);
r.labelOff = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); return ((d.systemSettings.pushNotify || {}).offColors || []).includes('#3b82f6'); });
await page.getByTestId('push-cfg-before-min').selectOption('60'); await page.waitForTimeout(500);
r.beforeMin = await page.evaluate(() => (JSON.parse(localStorage.getItem('daycareAppData_v3')).systemSettings.pushNotify || {}).beforeMin === 60);
await page.getByTestId('push-disable').click(); await page.waitForTimeout(800); r.disabled = calls.some(c => c.action === 'unsubscribe') && /この端末には届きません/.test(await page.getByTestId('push-state').innerText());
// 通知を押して開く → カレンダー・URL の印は消える
await page.goto(`http://localhost:${PORT}/?tsugo=schedule`, { waitUntil: 'networkidle' }); await page.waitForTimeout(2000); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
r.opensSchedule = (await page.getByText('スケジュール', { exact: true }).count()) > 0 && !page.url().includes('tsugo');
// Android(Chrome)として開く: 案内ではなく「この端末に通知を届ける」が出る
{ const c2 = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'ja-JP', hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36' }); const p2 = await c2.newPage();
  await p2.route('**/api/push', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 0, registered: null }) }));
  await p2.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await p2.waitForTimeout(700);
  if (await p2.getByText('担当者を選択', { exact: false }).count()) { await p2.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await p2.waitForTimeout(700); }
  await p2.evaluate(() => { sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'settings', pid: null, t: Date.now() })); }); await p2.reload({ waitUntil: 'networkidle' }); await p2.waitForTimeout(1800); await p2.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
  await p2.getByTestId('settings-search-input').fill('通知'); await p2.waitForTimeout(300); await p2.locator('[data-testid^="settings-search-hit-"]', { hasText: /この端末の通知/ }).first().click(); await p2.waitForTimeout(1200);
  r.android = (await p2.getByTestId('push-enable').count()) === 1 && (await p2.getByTestId('push-unsupported').count()) === 0;
  await p2.evaluate(() => { sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'dashboard', pid: null, t: Date.now() })); }); await p2.reload({ waitUntil: 'networkidle' }); await p2.waitForTimeout(1800); await p2.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
  const tops = []; for (const id of ['home-today-am', 'home-today-pm', 'home-today-rate']) { const bb = await p2.getByTestId(id).boundingBox(); tops.push(bb ? Math.round(bb.y) : -1); }
  const wide = await p2.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  r.phoneOneRow = tops[0] > 0 && tops[0] === tops[1] && tops[1] === tops[2] && wide; if (!r.phoneOneRow) console.log('TOPS', tops, wide);
  await p2.screenshot({ path: '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad/shot_home_phone.png', clip: { x: 0, y: 0, width: 390, height: 420 } });
  await c2.close(); }
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
