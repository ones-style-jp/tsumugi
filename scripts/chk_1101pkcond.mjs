// 2026-11-01 trial496 パスキーの自動入力(ID 欄に触れたとき指紋・顔が出る conditional UI): 画面の確認(見本ビルド・API は模擬・仮想の認証器)
//   Chromium の仮想認証器は「自動入力」の問いかけを、鍵があれば自動で選び、鍵がなければ即座に「候補なし」で返す。それを使って
//   A: 鍵のある端末 … ログイン画面を開くだけで(ID 欄の候補を選んだのと同じ) passkey_login_options(long:true) → 認証 → verify → kind person で入る
//   B: 鍵のない端末 … ID 欄は autocomplete="username webauthn"・「候補なし」で戻っても作り直しは間隔を空けて最大5回(連打しない)・
//      「パスキーで入る」ボタンは押せて、取り消し相当の文が出る・画面は固まらない
//   実行: node scripts/chk_1101pkcond.mjs [--port 4175]
import { chromium } from 'playwright';
import crypto from 'node:crypto';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4175'; })();
const b64u = (s) => Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const STAFF = { id: 'st1', username: 'hanako', role: 'staff', store_id: 's1', stores: { name: 'テスト店', short_name: 'テスト' }, display_name: '見本 花子', kind: 'person', member_id: 'm1', has_pin: true };
const b = await chromium.launch();
async function setup(withCred) {
  const ctx = await b.newContext({ viewport: { width: 420, height: 900 }, locale: 'ja-JP' }); const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 160))); page.on('dialog', d => d.accept());
  const cdp = await ctx.newCDPSession(page); await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  if (withCred) await cdp.send('WebAuthn.addCredential', { authenticatorId, credential: { credentialId: Buffer.from('cred-1').toString('base64'), isResidentCredential: true, rpId: 'localhost', privateKey: crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'), userHandle: Buffer.from('staff:st1').toString('base64'), signCount: 0 } });
  const calls = []; let nChal = 0;
  await page.route('**/api/staff-auth', async (route) => { const body = JSON.parse(route.request().postData() || '{}'); calls.push(body); const ok = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (body.action === 'passkey_login_options') { nChal += 1; return ok({ options: { challenge: b64u('challenge-auth-' + nChal), rpId: 'localhost', timeout: body.long ? 1200000 : 60000, userVerification: 'required', allowCredentials: [] } }); }
    if (body.action === 'passkey_login_verify') return ok({ staff: STAFF, token: 'tok2' });
    return route.fulfill({ status: 400, contentType: 'application/json', body: '{}' }); });
  await page.goto(`http://localhost:${PORT}/#stafflogin`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.setItem('tsumugiStaffPasskeyDev', '1')); await page.reload({ waitUntil: 'domcontentloaded' });
  return { page, ctx, calls };
}
const r = {};
// A: 鍵のある端末 → 開くだけで入る
{ const { page, ctx, calls } = await setup(true);
  await page.waitForFunction(() => !!(window.__tsumugiE2E && window.__tsumugiE2E.staffSession), null, { timeout: 8000 }).catch(() => {});
  const sess = await page.evaluate(() => window.__tsumugiE2E && window.__tsumugiE2E.staffSession);
  const opt = calls.find(c => c.action === 'passkey_login_options'); const vc = calls.find(c => c.action === 'passkey_login_verify');
  r.A_long = !!(opt && opt.long === true);
  r.A_login = !!(sess && sess.kind === 'person' && sess.token === 'tok2') && !!(vc && vc.credential && vc.credential.response && vc.credential.response.signature);
  r.A_mark = (await page.evaluate(() => localStorage.getItem('tsumugiStaffPasskeyDev'))) === '1';
  console.log('A 自動入力の問いかけ long', r.A_long, '入れた', r.A_login, sess && sess.kind, '印', r.A_mark, 'options 回数', calls.filter(c => c.action === 'passkey_login_options').length);
  await ctx.close(); }
// B: 鍵のない端末
{ const { page, ctx, calls } = await setup(false);
  await page.waitForTimeout(1200);
  r.B_autocomplete = (await page.locator('input[autocomplete="username webauthn"]').count()) === 1;
  const condAvail = await page.evaluate(async () => { try { return !!(await PublicKeyCredential.isConditionalMediationAvailable()); } catch { return false; } });
  const n1 = calls.filter(c => c.action === 'passkey_login_options' && c.long === true).length;
  await page.waitForTimeout(4000);
  const n2 = calls.filter(c => c.action === 'passkey_login_options' && c.long === true).length;
  r.B_noStorm = condAvail ? (n1 >= 1 && n1 <= 2 && n2 <= 4) : true; // 1.5秒→3秒→6秒… なので 5.2秒で最大 3〜4回
  console.log('B ID欄 webauthn', r.B_autocomplete, '対応ブラウザ', condAvail, '問いかけ 1.2秒で', n1, '回・5.2秒で', n2, '回', r.B_noStorm);
  r.B_btn = await page.getByTestId('staff-passkey-login').isEnabled().catch(() => false);
  if (r.B_btn) { await page.getByTestId('staff-passkey-login').click(); await page.waitForTimeout(2000); }
  const txt = await page.locator('body').innerText();
  r.B_cancelMsg = /取り消しました|入れませんでした/.test(txt);
  r.B_inputOk = await page.locator('input[autocomplete="username webauthn"]').isEnabled().catch(() => false);
  console.log('B ボタン押せる', r.B_btn, '取り消しの文', r.B_cancelMsg, 'ID 欄は使える', r.B_inputOk, '|', (txt.match(/パスキー[^\n]{0,60}/g) || []).slice(0, 2).join(' / '));
  await ctx.close(); }
await b.close();
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
