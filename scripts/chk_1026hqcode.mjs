// 2026-10-26 試験版 trial409: 本部の確認コード ①送れたら「送信済み」(宛先・時刻) ②「もう一度送る」で再送(login を再度呼ぶ) ③送れなかったら赤で理由 ④端末の印が無ければ no_mail を付けず、パスキーの問いかけも取りに行かない
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4173'; })();
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 420, height: 860 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 160)));
await page.addInitScript(() => { window.__tsumugiE2E = { loginMock: true }; try { localStorage.removeItem('tsumugiHqPasskeyDev'); } catch {} });
const calls = []; let mode = 'ok';
await page.route('**/api/staff-auth', async (route) => { const body = JSON.parse(route.request().postData() || '{}'); calls.push(body);
  if (body.action === 'login' && !body.code) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mode === 'ok' ? { need_code: true, hint: 'hq***@example.com', sent: true, sent_at: '2026-10-26T05:07:00.000Z' } : { need_code: true, hint: 'hq***@example.com', sent: false, mail_err: 'メールのサーバーが拒否しました（401 Key not found）' }) });
  return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); });
await page.goto(`http://localhost:${PORT}/#stafflogin`, { waitUntil: 'networkidle' }); await page.waitForTimeout(600);
const r = {};
await page.locator('input').nth(0).fill('hq'); await page.locator('input[type=password]').first().fill('Testpass1234');
await page.locator('button[type=submit]').click(); await page.waitForTimeout(800);
const sent = page.getByTestId('hq-code-sent'); r.sentShown = (await sent.count()) === 1 && /送信済み/.test(await sent.innerText()) && /hq\*\*\*@example\.com/.test(await sent.innerText()) && /14:07/.test(await sent.innerText());
r.noNoMail = calls.length === 1 && calls[0].action === 'login' && calls[0].no_mail === undefined; /* 端末の印が無い → メールを先に */
r.noPasskeyAuto = !calls.some(c => c.action === 'passkey_login_options');
await page.getByTestId('hq-code-resend').click(); await page.waitForTimeout(700);
r.resent = calls.filter(c => c.action === 'login' && !c.code).length === 2 && (await page.getByTestId('hq-code-sent').count()) === 1;
mode = 'ng'; await page.getByTestId('hq-code-resend').click(); await page.waitForTimeout(700);
const un = page.getByTestId('hq-code-unsent'); r.unsentShown = (await un.count()) === 1 && /送れませんでした/.test(await un.innerText()) && /401 Key not found/.test(await un.innerText()) && (await page.getByTestId('hq-code-sent').count()) === 0;
r.resendLabel = /送り直す/.test(await page.getByTestId('hq-code-resend').innerText());
mode = 'ok'; await page.getByTestId('hq-code-resend').click(); await page.waitForTimeout(700); r.backToSent = (await page.getByTestId('hq-code-sent').count()) === 1;
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
