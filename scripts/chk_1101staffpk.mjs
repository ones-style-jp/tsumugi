// 2026-11-01 従業員のパスキー(10/23 ユーザー決定②): 画面の確認(見本ビルド・API は模擬・仮想の認証器で実際に登録→ログインまで)
//   ①本人登録の PIN 画面に「この端末に指紋・顔のログインを登録（任意）」が出る → 押すと passkey_reg_options/verify を呼び、成功で「登録しました」・端末に印
//   ②ログイン画面(#stafflogin): 印のある端末だけ「パスキーで入る（指紋・顔）」が出る(印なしでは出ない) → 押すと passkey_login_options/verify → セッション(kind person)
//   実行: node scripts/chk_1101staffpk.mjs [--port 4175]
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4175'; })();
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 420, height: 900 }, locale: 'ja-JP' }); const page = await ctx.newPage();
page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 160))); page.on('dialog', d => d.accept());
// 仮想の認証器(指紋・顔の代わり)
const cdp = await ctx.newCDPSession(page); await cdp.send('WebAuthn.enable'); await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
const calls = []; const b64u = (s) => Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const STAFF = { id: 'st1', username: 'hanako', role: 'staff', store_id: 's1', stores: { name: 'テスト店', short_name: 'テスト' }, display_name: '見本 花子', kind: 'person', member_id: 'm1', has_pin: true };
await page.route('**/api/staff-auth', async (route) => { const body = JSON.parse(route.request().postData() || '{}'); calls.push(body); const ok = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
  if (body.action === 'invite_lookup') return ok({ invite: { store_id: 's1', store_name: 'テスト店', name: '見本 花子', role: 'member', member_id: 'm1' } });
  if (body.action === 'invite_accept') return ok({ staff: STAFF, token: 'tok', pin: '4728' });
  if (body.action === 'passkey_reg_options') return ok({ options: { challenge: b64u('challenge-reg-1'), rp: { name: 'つむぎ', id: 'localhost' }, user: { id: b64u('staff:st1'), name: 'hanako', displayName: '見本 花子' }, pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }], timeout: 60000, attestation: 'none', authenticatorSelection: { residentKey: 'required', userVerification: 'required' }, excludeCredentials: [] } });
  if (body.action === 'passkey_reg_verify') return ok({ ok: true, passkeys: [{ id: body.credential && body.credential.id, rp: 'localhost', device: '', at: new Date().toISOString() }] });
  if (body.action === 'passkey_login_options') return ok({ options: { challenge: b64u('challenge-auth-1'), rpId: 'localhost', timeout: 60000, userVerification: 'required', allowCredentials: [] } });
  if (body.action === 'passkey_login_verify') return ok({ staff: STAFF, token: 'tok2' });
  return route.fulfill({ status: 400, contentType: 'application/json', body: '{}' }); });
const r = {};
// ① 本人登録 → PIN 画面 → パスキー登録
await page.goto(`http://localhost:${PORT}/#staffinvite=1234-5678`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
const inp = (ph) => page.locator(`input[placeholder="${ph}"]`).first();
await inp('例: hanako_m（4文字以上の半角英数字）').fill('hanako'); await inp('パスワード').fill('Testpass1234'); await inp('パスワード（確認）').fill('Testpass1234'); await page.locator('button[type=submit]').click(); await page.waitForTimeout(800);
r.pinScreen = (await page.getByTestId('staff-invite-pin').count()) === 1;
r.pkBox = (await page.getByTestId('staff-invite-passkey').count()) === 1;
if (r.pkBox) { await page.getByTestId('staff-invite-passkey-reg').click(); await page.waitForTimeout(2500); }
const t1 = await page.getByTestId('staff-invite-pin').innerText();
const regCred = calls.find(c => c.action === 'passkey_reg_verify');
r.registered = /登録しました/.test(t1) && !!regCred && !!(regCred.credential && regCred.credential.response && regCred.credential.response.attestationObject);
r.mark = (await page.evaluate(() => localStorage.getItem('tsumugiStaffPasskeyDev'))) === '1';
console.log('① PIN画面', r.pinScreen, '登録欄', r.pkBox, '登録', r.registered, '印', r.mark, (t1.match(/登録しました[^。]*|登録を取り消し[^。]*|登録できません[^。]*/) || [''])[0]);
// ② ログイン画面: 印なし → ボタンなし / 印あり → ボタン → ログイン
await page.evaluate(() => localStorage.removeItem('tsumugiStaffPasskeyDev'));
await page.goto(`http://localhost:${PORT}/#stafflogin`, { waitUntil: 'networkidle' }); await page.waitForTimeout(600);
r.noBtnWithoutMark = (await page.getByTestId('staff-passkey-login').count()) === 0;
await page.evaluate(() => localStorage.setItem('tsumugiStaffPasskeyDev', '1')); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(600);
r.btnWithMark = (await page.getByTestId('staff-passkey-login').count()) === 1;
// ★ 2026-11-01 trial496: 「自動入力」の問いかけ(開いた時点)を Chromium の仮想認証器は自動で選ぶので、ボタンを押す前に入っていることがある(それも合格)
const _auto = await page.evaluate(() => !!(window.__tsumugiE2E && window.__tsumugiE2E.staffSession));
if (r.btnWithMark && !_auto) { await page.getByTestId('staff-passkey-login').click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(2500); }
console.log('   自動入力で先に入った?', _auto);
const sess = await page.evaluate(() => window.__tsumugiE2E && window.__tsumugiE2E.staffSession);
const vc = calls.find(c => c.action === 'passkey_login_verify');
r.loggedIn = !!(sess && sess.kind === 'person' && sess.token === 'tok2') && !!(vc && vc.credential && vc.credential.response && vc.credential.response.signature);
console.log('② 印なし', r.noBtnWithoutMark, '印あり', r.btnWithMark, 'ログイン', r.loggedIn, sess && sess.kind);
await b.close();
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
