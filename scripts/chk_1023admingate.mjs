// 2026-10-23 試験版: スタッフ・記録の削除は管理者だけ(関所)。各種設定 → 日誌 の職員の × で確かめる
//   ①管理者でない記録者+管理者パスワードあり → 関所(パスワード)が出る・違うパスワードでは消えない・正しいパスワードで消える
//   ②管理者でない記録者+パスワードなし → 「管理者だけができる操作です」で止まる(消えない)
//   ③管理者の記録者 → 関所なしで消える
import { chromium } from 'playwright';
import crypto from 'crypto';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4173'; })();
const PW = '9999'; const HASH = crypto.createHash('sha256').update(PW).digest('hex');
const b = await chromium.launch(); const r = {};
async function open(rec, withPw) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
  await ctx.addInitScript(() => { window.__tsumugiE2E = { ...(window.__tsumugiE2E || {}), adminGateTest: true }; });
  const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  await page.evaluate(([rec, hash]) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.systemSettings = d.systemSettings || {}; if (hash) d.systemSettings.adminAuth = { passwordHash: hash, setAt: Date.now() }; else delete d.systemSettings.adminAuth;
    d.diarySettings = d.diarySettings || {}; d.diarySettings.staff = [{ id: 'gs1', name: '見本 一号', role: '介護職員' }, { id: 'gs2', name: '見本 二号', role: '介護職員' }, { id: 'gs3', name: '見本 三号', role: '介護職員' }];
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); sessionStorage.setItem('tsumugiActiveRecorder', JSON.stringify(rec)); sessionStorage.removeItem('tsumugiAdminVerified');
    sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'settings', pid: null, t: Date.now() })); }, [rec, withPw ? HASH : null]);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800);
  await page.evaluate(() => { const bs = [...document.querySelectorAll('button')].filter(x => x.textContent.trim() === '日誌' && [...x.parentElement.querySelectorAll('button')].some(y => y.textContent.trim() === 'システム')); if (bs[0]) bs[0].click(); }); await page.waitForTimeout(1000);
  return page; }
const count = (page) => page.locator('.tsu-st-del').count();
const NONADMIN = { id: 'na1', name: '見本 職員', roleLabel: '介護職員' }, ADMIN = { id: 'ad1', name: '見本 管理', roleLabel: '管理者', isAdmin: true };
{ const page = await open(NONADMIN, true); const n0 = await count(page);
  await page.locator('.tsu-st-del').first().click(); await page.waitForTimeout(600);
  r.gateShown = await page.getByTestId('admin-gate').count() > 0; r.notDeletedYet = (await count(page)) === n0;
  const pw = page.locator('[data-testid="admin-gate"] input[type="password"]').first(); await pw.fill('0000'); await pw.press('Enter'); await page.waitForTimeout(600);
  r.wrongKeeps = (await count(page)) === n0 && await page.getByTestId('admin-gate').count() > 0;
  await pw.fill(PW); await pw.press('Enter'); await page.waitForTimeout(1000);
  const n1 = await count(page); console.log('nonadmin+pw', n0, '→', n1); r.rightDeletes = n1 === n0 - 1 && await page.getByTestId('admin-gate').count() === 0;
  await page.context().close(); }
{ const page = await open(NONADMIN, false); const n0 = await count(page);
  await page.locator('.tsu-st-del').first().click(); await page.waitForTimeout(600);
  r.noPwBlocked = await page.getByTestId('admin-gate-close').count() > 0; await page.getByTestId('admin-gate-close').click().catch(() => {}); await page.waitForTimeout(400);
  r.noPwKeeps = (await count(page)) === n0; console.log('nonadmin nopw', n0, '→', await count(page));
  await page.context().close(); }
{ const page = await open(ADMIN, true); const n0 = await count(page);
  await page.locator('.tsu-st-del').first().click(); await page.waitForTimeout(800);
  const n1 = await count(page); console.log('admin', n0, '→', n1); r.adminNoGate = n1 === n0 - 1 && await page.getByTestId('admin-gate').count() === 0;
  await page.context().close(); }
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
