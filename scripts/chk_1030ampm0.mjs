// 2026-10-30(試験版) ユーザー要望「ホームの本日の業務で、体力測定・計画書などが午後0名・午前0名なら書かなくてよい」
//   ①午前だけの方しかいない → 「午前 n名」だけ(「午後 0名」を出さない) ②午後だけ → 「午後 n名」だけ ③両方いれば「午前 a名・午後 p名」
//   実行: node scripts/chk_1030ampm0.mjs [--port 4175]
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4175'; })();
const r = {};
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const labels = async (mode) => {
  await page.evaluate((mode) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const dow = new Date().getDay();
    d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [] }; d.holidays = [];
    d.patients.forEach((p, i) => { p.scheduleAmPm = ['', '', '', '', '', '', '']; p.pauseHistory = []; if (p.status === '利用中' && !p.endDate) p.scheduleAmPm[dow] = mode === 'AM' ? 'AM' : mode === 'PM' ? 'PM' : (i % 2 ? 'AM' : 'PM'); });
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0');
    sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'dashboard', pid: null, t: Date.now() })); }, mode);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2200); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 400 }).catch(() => {});
  await page.locator('[data-testid^="home-tasks-more-"]').evaluateAll(bs => bs.forEach(x => x.click())).catch(() => {}); await page.waitForTimeout(300);
  return page.evaluate(() => [...document.querySelectorAll('button, a, div')].map(x => (x.childElementCount <= 3 ? x.innerText : '') || '').filter(t => /^(体力測定|通所介護計画書|個別機能訓練計画書)/.test(t)).map(t => t.split('\n')[0]).filter((t, i, a) => a.indexOf(t) === i)); };
const am = await labels('AM'); const pm = await labels('PM'); const both = await labels('BOTH');
console.log('午前だけ', JSON.stringify(am)); console.log('午後だけ', JSON.stringify(pm)); console.log('両方', JSON.stringify(both));
r.amOnly = am.length > 0 && am.every(t => !/午後/.test(t) && !/(^|[^\d])0名/.test(t)) && am.some(t => /午前 \d+名/.test(t));
r.pmOnly = pm.length > 0 && pm.every(t => !/午前/.test(t) && !/(^|[^\d])0名/.test(t)) && pm.some(t => /午後 \d+名/.test(t));
r.both = both.some(t => /午前 [1-9]\d*名・午後 [1-9]\d*名/.test(t)) && both.every(t => !/(^|[^\d])0名/.test(t));
await b.close();
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
