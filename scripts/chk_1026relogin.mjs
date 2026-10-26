// 2026-10-26 試験版 trial411: ①本部: 確認コードで入れると hq_trust が端末に残り、次のログインは hq_trust を送ってコードなしで入れる ②事業所: ログアウト10分以内は「○○さんとして続ける／別の人」 ③同じ名前で役職が複数 → PIN のあとに役職を選ぶ
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4173'; })();
const b = await chromium.launch(); const r = {};
const ctx = async () => { const c = await b.newContext({ viewport: { width: 420, height: 860 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await c.newPage(); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 160))); await page.addInitScript(() => { window.__tsumugiE2E = { loginMock: true, multiRole: true }; }); return page; };
// ① 本部の信頼の印
{ const page = await ctx(); const calls = [];
  await page.route('**/api/staff-auth', async (route) => { const body = JSON.parse(route.request().postData() || '{}'); calls.push(body);
    if (body.action === 'login' && body.hq_trust === 'TRUST1') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ staff: { id: 'hq1', username: 'hq', role: 'super_admin', display_name: '管理局' }, token: 'tok2' }) });
    if (body.action === 'login' && !body.code) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ need_code: true, hint: 'hq***@example.com', sent: true, sent_at: new Date().toISOString() }) });
    if (body.action === 'login' && body.code === '123456') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ staff: { id: 'hq1', username: 'hq', role: 'super_admin', display_name: '管理局' }, token: 'tok', hq_trust: 'TRUST1', hq_trust_exp: Date.now() + 30 * 60 * 1000 }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); });
  await page.goto(`http://localhost:${PORT}/#stafflogin`, { waitUntil: 'networkidle' }); await page.waitForTimeout(500);
  await page.locator('input').nth(0).fill('hq'); await page.locator('input[type=password]').first().fill('Testpass1234'); await page.locator('button[type=submit]').click(); await page.waitForTimeout(600);
  await page.getByTestId('hq-code').locator('input').fill('123456'); await page.locator('button[type=submit]').click(); await page.waitForTimeout(800);
  r.trustSaved = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('tsumugiHqTrust') || 'null').t === 'TRUST1'; } catch { return false; } });
  r.firstNoTrust = calls.filter(c => c.action === 'login').every(c => c.hq_trust === undefined);
  // 2回目: 印を送ってコードなし
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(500); calls.length = 0;
  await page.locator('input').nth(0).fill('hq'); await page.locator('input[type=password]').first().fill('Testpass1234'); await page.locator('button[type=submit]').click(); await page.waitForTimeout(800);
  r.secondTrustSent = calls.length === 1 && calls[0].hq_trust === 'TRUST1';
  const sess = await page.evaluate(() => window.__tsumugiE2E && window.__tsumugiE2E.staffSession); r.secondNoCode = !!(sess && sess.token === 'tok2') && (await page.getByTestId('hq-code').count()) === 0;
  await page.context().close(); }
// ② 事業所の「続ける」
{ const page = await ctx(); await page.goto(`http://localhost:${PORT}/#stafflogin`, { waitUntil: 'networkidle' });
  const ticket = { at: Date.now() - 3 * 60 * 1000, session: { staffId: 's1', username: 'store1', role: 'staff', storeId: 'st1', storeName: 'テスト店', displayName: 'テスト店', token: 'tokS', kind: 'store', memberId: null, hasPin: false }, recorder: { id: 'm1', name: '見本 花子', roleLabel: '介護職員' } };
  await page.evaluate((t) => localStorage.setItem('tsumugiRelogin', JSON.stringify(t)), ticket); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(500);
  const box = page.getByTestId('relogin-box'); r.boxShown = (await box.count()) === 1 && /見本 花子 さんとして続ける/.test(await box.innerText());
  await page.getByTestId('relogin-continue').click(); await page.waitForTimeout(400);
  const st = await page.evaluate(() => ({ sess: window.__tsumugiE2E && window.__tsumugiE2E.staffSession, rec: sessionStorage.getItem('tsumugiActiveRecorder'), left: localStorage.getItem('tsumugiRelogin') }));
  r.continued = !!(st.sess && st.sess.token === 'tokS') && /見本 花子/.test(st.rec || '') && !st.left;
  // 別の人: 担当者は復元しない
  await page.evaluate((t) => localStorage.setItem('tsumugiRelogin', JSON.stringify(t)), ticket); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(500);
  await page.getByTestId('relogin-other').click(); await page.waitForTimeout(400);
  const st2 = await page.evaluate(() => ({ sess: window.__tsumugiE2E && window.__tsumugiE2E.staffSession, rec: sessionStorage.getItem('tsumugiActiveRecorder') }));
  r.other = !!(st2.sess && st2.sess.token === 'tokS') && !st2.rec;
  // 11分前の控えは出ない
  await page.evaluate((t) => localStorage.setItem('tsumugiRelogin', JSON.stringify({ ...t, at: Date.now() - 11 * 60 * 1000 })), ticket); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(500);
  r.expiredHidden = (await page.getByTestId('relogin-box').count()) === 0;
  // 本人ログインの「別の人」はふつうのログイン画面のまま
  await page.evaluate((t) => localStorage.setItem('tsumugiRelogin', JSON.stringify({ ...t, at: Date.now(), recorder: null, session: { ...t.session, kind: 'person', memberId: 'm1', displayName: '見本 花子', hasPin: true } })), ticket); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(500);
  r.personBox = /見本 花子 さんとして続ける/.test(await page.getByTestId('relogin-box').innerText()); await page.evaluate(() => { window.__tsumugiE2E.staffSession = null; }); await page.getByTestId('relogin-other').click(); await page.waitForTimeout(300);
  r.personOther = (await page.getByTestId('relogin-box').count()) === 0 && (await page.locator('button[type=submit]').count()) === 1 && !(await page.evaluate(() => window.__tsumugiE2E.staffSession));
  await page.context().close(); }
// ③ 役職の選択
{ const page = await ctx(); await page.goto(`http://localhost:${PORT}/#picker`, { waitUntil: 'networkidle' }); await page.waitForTimeout(500);
  for (const d of ['1', '2', '3', '4']) { await page.getByTestId('quick-pin').locator('button', { hasText: new RegExp('^' + d + '$') }).click(); await page.waitForTimeout(80); } await page.waitForTimeout(500);
  const rc = page.getByTestId('role-choice'); r.roleChoiceShown = (await rc.count()) === 1 && /介護職員/.test(await rc.innerText()) && /生活相談員/.test(await rc.innerText());
  await page.getByTestId('role-choice-m3').click(); await page.waitForTimeout(300);
  r.rolePicked = (await page.evaluate(() => window.__tsumugiE2E.picked)) === 'm3' && (await page.getByTestId('role-choice').count()) === 0;
  // 名前を押して PIN → 役職の選択
  await page.evaluate(() => { window.__tsumugiE2E.picked = null; }); await page.locator('button', { hasText: /見本 花子/ }).first().click(); await page.waitForTimeout(300);
  for (const d of ['1', '2', '3', '4']) { await page.locator('button', { hasText: new RegExp('^' + d + '$') }).last().click(); await page.waitForTimeout(80); } await page.locator('button', { hasText: /^(決定|確定|入る)$/ }).last().click().catch(() => {}); await page.waitForTimeout(500);
  r.roleChoiceAfterName = (await page.getByTestId('role-choice').count()) === 1; await page.getByTestId('role-choice-m1').click(); await page.waitForTimeout(200); r.rolePicked2 = (await page.evaluate(() => window.__tsumugiE2E.picked)) === 'm1';
  await page.context().close(); }
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
