// 2026-11-27 trial645 通知に予定の中身(画面): 予定のお知らせ(店舗の設定)に「通知に予定の中身を出す」(既定 on)・「N日開いていない端末は伏せる」(既定 7日)・例の文、
//   この端末の通知にロック中に隠す設定の案内。設定は systemSettings.pushNotify.detail / detailDays に保存
//   使い方: node chk/chk_1127pushdetail_ui.mjs --port 4175
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
const ok = (n, c, d) => { r[n] = !!c; console.log((c ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? ' ' + JSON.stringify(d) : '')); };
const pn = () => page.evaluate(() => { try { return (JSON.parse(localStorage.getItem('daycareAppData_v3')).systemSettings || {}).pushNotify || {}; } catch { return {}; } });
ok('1 中身を出すが既定でオン', await page.getByTestId('push-cfg-detail').isChecked());
ok('2 既定は7日', (await page.getByTestId('push-cfg-detail-days').inputValue()) === '7');
ok('3 例の文に題名と利用者名', /担当者会議：ご自宅で（○○様）/.test(await page.getByTestId('push-cfg-detail-example').innerText()));
await page.getByTestId('push-enable').click(); await page.waitForTimeout(2500);
ok('4 届く端末にロック中の案内', /ロック中は中身を隠すには/.test(await page.getByTestId('push-lock-help').innerText().catch(() => '')));
await page.getByTestId('push-cfg-detail-days').selectOption('14'); await page.waitForTimeout(800);
ok('5 日数を14日にすると保存される', (await pn()).detailDays === 14, await pn());
await page.getByTestId('push-cfg-detail').uncheck(); await page.waitForTimeout(800);
ok('6 オフにすると保存され、例はラベルと時刻だけ', (await pn()).detail === false && /「10:00 担当者会議」/.test(await page.getByTestId('push-cfg-detail-example').innerText()), await pn());
ok('7 オフのとき日数は選べない', await page.getByTestId('push-cfg-detail-days').evaluate(el => getComputedStyle(el.parentElement).pointerEvents === 'none'));
await page.getByTestId('push-cfg-detail').check(); await page.waitForTimeout(600);
await page.getByTestId('push-cfg-detail-box').scrollIntoViewIfNeeded(); await page.screenshot({ path: process.env.SHOT || '/dev/null' }).catch(() => {});
await b.close();
const bad = Object.entries(r).filter(([, v]) => !v); console.log(bad.length ? `FAIL ${bad.length}: ${bad.map(x => x[0]).join(' / ')}` : 'ALL PASS'); process.exit(bad.length ? 1 : 0);
