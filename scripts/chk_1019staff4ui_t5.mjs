// 段階4 画面: 本人登録(招待の照合→入力チェック→登録でセッション)・PIN 入力(間違い→正解・戻る)
import { chromium } from 'playwright';
const OUT = '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad';
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 420, height: 860 }, locale: 'ja-JP' })).newPage();
page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 160)));
const calls = [];
await page.route('**/api/staff-auth', async (route) => { const body = JSON.parse(route.request().postData() || '{}'); calls.push(body.action);
  if (body.action === 'invite_lookup') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ invite: { store_id: 's1', store_name: 'テスト店', name: '見本 花子', role: 'member', member_id: 'm1' } }) });
  if (body.action === 'invite_accept') { if (body.username === 'taken') return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'このログインIDは既に使われています' }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ staff: { id: 'st1', username: body.username, role: 'member', store_id: 's1', stores: { name: 'テスト店', short_name: 'テスト' }, display_name: '見本 花子', kind: 'person', member_id: 'm1', has_pin: !!body.pin_hash }, token: 'tok' }) }); }
  return route.fulfill({ status: 400, contentType: 'application/json', body: '{}' }); });
await page.goto('http://localhost:4175/#staffinvite=1234-5678', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
const r = {};
const txt = await page.getByTestId('staff-invite-view').innerText();
r.lookup = /テスト店/.test(txt) && /見本 花子/.test(txt) && /職員/.test(txt);
const inp = (ph) => page.locator(`input[placeholder="${ph}"]`).first();
await inp('例: hanako_m（4文字以上の半角英数字）').fill('ab'); await page.locator('button[type=submit]').click(); await page.waitForTimeout(200);
r.vUser = /4文字以上/.test(await page.getByTestId('staff-invite-view').innerText());
await inp('例: hanako_m（4文字以上の半角英数字）').fill('hanako'); await inp('パスワード').fill('short'); await page.locator('button[type=submit]').click(); await page.waitForTimeout(200);
r.vPass = /8文字以上/.test(await page.getByTestId('staff-invite-view').innerText());
await inp('パスワード').fill('Testpass1234'); await inp('パスワード（確認）').fill('Testpass1234'); await inp('0000').fill('12'); await page.locator('button[type=submit]').click(); await page.waitForTimeout(200);
r.vPin = /数字4桁/.test(await page.getByTestId('staff-invite-view').innerText());
await inp('0000').fill('1234'); await inp('PIN（確認）').fill('1234');
await inp('例: hanako_m（4文字以上の半角英数字）').fill('taken'); await page.locator('button[type=submit]').click(); await page.waitForTimeout(500);
r.dup409 = /既に使われています/.test(await page.getByTestId('staff-invite-view').innerText());
await inp('例: hanako_m（4文字以上の半角英数字）').fill('hanako'); await page.locator('button[type=submit]').click(); await page.waitForTimeout(800);
const sess = await page.evaluate(() => window.__tsumugiE2E && window.__tsumugiE2E.staffSession);
r.accepted = !!(sess && sess.kind === 'person' && sess.memberId === 'm1' && sess.hasPin === true && sess.token === 'tok' && sess.storeId === 's1');
r.calls = calls.includes('invite_lookup') && calls.filter(c => c === 'invite_accept').length === 2;
await page.screenshot({ path: `${OUT}/staff4_invite.png`, fullPage: true });
// PIN
await page.goto('http://localhost:4175/#pinprompt', { waitUntil: 'networkidle' }); await page.waitForTimeout(500);
const K = (d) => page.getByTestId('pin-prompt').locator('button', { hasText: new RegExp('^' + d + '$') }).first();
for (const d of ['9', '9', '9', '9']) await K(d).click(); await page.waitForTimeout(400);
r.pinWrong = /PIN が違います/.test(await page.getByTestId('pin-prompt').innerText());
for (const d of ['1', '2', '3', '4']) await K(d).click(); await page.waitForTimeout(400);
r.pinOk = await page.evaluate(() => !!(window.__tsumugiE2E && window.__tsumugiE2E.pinOk));
await page.screenshot({ path: `${OUT}/staff4_pin.png` });
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
