// 2026-11-01 段階4(従業員ごとのログイン)の残り: 本人登録の画面 — PIN の入力欄がなく、登録のあとにサーバーが作った PIN が一度だけ表示される(10/23 ユーザー決定)
//   ①招待の照合(店舗名・名前) ②ID/パスワードの入力チェック ③ID 重複(409)の表示 ④登録 → 「登録できました」と PIN(サーバーの返事)が出る・invite_accept に pin_hash を送らない
//   ⑤「控えました」を押すと(確認ダイアログの後) セッションでアプリへ(hasPin=true)
//   実行: node scripts/chk_1101staff4pin.mjs [--port 4175]   (API は模擬・見本ビルド)
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4175'; })();
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 420, height: 860 }, locale: 'ja-JP' })).newPage();
page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 160))); page.on('dialog', d => d.accept());
const calls = [];
await page.route('**/api/staff-auth', async (route) => { const body = JSON.parse(route.request().postData() || '{}'); calls.push(body);
  if (body.action === 'invite_lookup') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ invite: { store_id: 's1', store_name: 'テスト店', name: '見本 花子', role: 'member', member_id: 'm1' } }) });
  if (body.action === 'invite_accept') { if (body.username === 'taken') return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'このログインIDは既に使われています' }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ staff: { id: 'st1', username: body.username, role: 'member', store_id: 's1', stores: { name: 'テスト店', short_name: 'テスト' }, display_name: '見本 花子', kind: 'person', member_id: 'm1', has_pin: true }, token: 'tok', pin: '4728' }) }); }
  return route.fulfill({ status: 400, contentType: 'application/json', body: '{}' }); });
await page.goto(`http://localhost:${PORT}/#staffinvite=1234-5678`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
const r = {};
const view = () => page.getByTestId('staff-invite-view').innerText();
r.lookup = /テスト店/.test(await view()) && /見本 花子/.test(await view());
r.noPinInput = (await page.locator('input[inputmode="numeric"]').count()) === 0 && /4桁の PIN/.test(await view());
const inp = (ph) => page.locator(`input[placeholder="${ph}"]`).first();
await inp('例: hanako_m（4文字以上の半角英数字）').fill('ab'); await page.locator('button[type=submit]').click(); await page.waitForTimeout(200);
r.vUser = /4文字以上/.test(await view());
await inp('例: hanako_m（4文字以上の半角英数字）').fill('hanako'); await inp('パスワード').fill('short'); await page.locator('button[type=submit]').click(); await page.waitForTimeout(200);
r.vPass = /8文字以上/.test(await view());
await inp('パスワード').fill('Testpass1234'); await inp('パスワード（確認）').fill('Testpass1234');
await inp('例: hanako_m（4文字以上の半角英数字）').fill('taken'); await page.locator('button[type=submit]').click(); await page.waitForTimeout(500);
r.dup409 = /既に使われています/.test(await view());
await inp('例: hanako_m（4文字以上の半角英数字）').fill('hanako'); await page.locator('button[type=submit]').click(); await page.waitForTimeout(800);
const pinShown = (await page.getByTestId('staff-invite-pin').count()) === 1 ? (await page.getByTestId('staff-invite-pin-value').innerText()).trim() : '';
console.log('PIN の表示', pinShown);
r.pinScreen = pinShown === '4728' && /二度と表示されません/.test(await view());
const acc = calls.filter(c => c.action === 'invite_accept'); r.noPinSent = acc.length === 2 && acc.every(c => c.pin_hash === undefined) && acc.every(c => /^[0-9a-f]{64}$/.test(c.password_hash));
const sessBefore = await page.evaluate(() => window.__tsumugiE2E && window.__tsumugiE2E.staffSession);
r.notYet = !sessBefore;
await page.getByTestId('staff-invite-pin-ok').click(); await page.waitForTimeout(500);
const sess = await page.evaluate(() => window.__tsumugiE2E && window.__tsumugiE2E.staffSession);
r.accepted = !!(sess && sess.kind === 'person' && sess.memberId === 'm1' && sess.hasPin === true && sess.token === 'tok' && sess.storeId === 's1');
await b.close();
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
