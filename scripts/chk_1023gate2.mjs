// 2026-10-23 試験版 trial384: ①本部(super_admin)で店舗に入り、管理者でない職員を選ぶ → データ管理の「一括削除」が見えない(管理局として入る→見える)
//   ②個人ファイルの削除: 設定が切=確認だけで消える／入=管理者でない方は関所 ③振替の取り消しは関所なし(月間スケジュールの「取り消し」が通る)
import { chromium } from 'playwright';
import crypto from 'crypto';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4173'; })();
const HASH = crypto.createHash('sha256').update('9999').digest('hex'); const b = await chromium.launch(); const r = {};
const NON = { id: 'na1', name: '見本 職員', roleLabel: '介護職員' }, HQ = { id: 'hq_viewer', name: '管理局', roleLabel: '管理者', isAdmin: true };
async function open(rec, opt = {}) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
  await ctx.addInitScript(() => { window.__tsumugiE2E = { ...(window.__tsumugiE2E || {}), adminGateTest: true }; });
  const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  await page.evaluate(([rec, opt, hash]) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.systemSettings = d.systemSettings || {}; d.systemSettings.adminAuth = { passwordHash: hash, setAt: Date.now() }; d.systemSettings.personalFileDeletePw = !!opt.pfPw;
    d.storeMembers = [{ id: 'ad1', name: '見本 管理', roleLabel: '管理者', isAdmin: true }, { id: 'na1', name: '見本 職員', roleLabel: '介護職員' }];
    const p = (d.patients || []).find(x => x.status === '利用中'); p.personalFile = { ...(p.personalFile || {}), meetings: [{ id: 'mt1', date: '2026-10-01', dateLabel: '10月1日', location: '見本の会議室', reason: '見本' }] }; if (opt.view === 'master') sessionStorage.setItem('tsumugiReopenPF', JSON.stringify({ patientId: p.id, tab: 'cat_3' }));
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); sessionStorage.setItem('tsumugiActiveRecorder', JSON.stringify(rec)); sessionStorage.removeItem('tsumugiAdminVerified');
    if (opt.hq) { const ss = JSON.parse(sessionStorage.getItem('tsumugiStaffSession') || '{}'); ss.role = 'super_admin'; sessionStorage.setItem('tsumugiStaffSession', JSON.stringify(ss)); }
    sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: opt.view || 'settings', pid: opt.view === 'master' ? p.id : null, t: Date.now() })); return p.id; }, [rec, opt, HASH]);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); return page; }
const tab = (page, label) => page.evaluate((label) => { const bs = [...document.querySelectorAll('button')].filter(x => x.textContent.trim() === label && [...x.parentElement.querySelectorAll('button')].some(y => y.textContent.trim() === '体力測定')); if (bs[0]) bs[0].click(); }, label).then(() => page.waitForTimeout(800));
// ① 本部で職員を選ぶ
{ const page = await open(NON, { hq: true }); await tab(page, 'データ管理'); r.hqStaffNoBulk = await page.getByText('管理者のみ表示・操作できます').count() >= 1 && await page.locator('text=選択した').count() === 0; await page.context().close(); }
{ const page = await open(HQ, { hq: true }); await tab(page, 'データ管理'); r.hqViewerBulk = await page.getByText('管理者のみ表示・操作できます').count() === 0; await page.context().close(); }
// ② 個人ファイルの会議記録の削除(利用者マスタ → 個人ファイル)
async function pfDelete(page) { await page.waitForTimeout(1500);
  const cnt0 = await page.getByText('見本の会議室').count();
  const del = page.locator('button:visible', { hasText: /^削除$/ }); let found = false;
  for (let i = 0; i < await del.count(); i++) { const t = await del.nth(i).evaluate(e => (e.closest('.bg-white.border')?.innerText || '')); if (/見本の会議室/.test(t)) { await del.nth(i).click(); found = true; break; } }
  await page.waitForTimeout(700); return { found, cnt0, gate: await page.getByTestId('admin-gate').count(), cnt1: await page.getByText('見本の会議室').count() }; }
{ const page = await open(NON, { view: 'master', pfPw: false }); const x = await pfDelete(page); console.log('pf off', JSON.stringify(x)); r.pfOffDeletes = x.found && x.gate === 0 && x.cnt1 < x.cnt0; await page.context().close(); }
{ const page = await open(NON, { view: 'master', pfPw: true }); const x = await pfDelete(page); console.log('pf on', JSON.stringify(x)); r.pfOnGated = x.found && x.gate === 1 && x.cnt1 === x.cnt0; await page.context().close(); }
// ③ 設定の切り替えの欄
{ const page = await open({ id: 'ad1', name: '見本 管理', roleLabel: '管理者', isAdmin: true }); await tab(page, 'ログイン・管理者'); r.pfSettingShown = await page.getByTestId('pf-delete-pw').count() === 1; await page.context().close(); }
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
