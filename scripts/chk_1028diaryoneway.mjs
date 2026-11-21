// 2026-10-28(試験版) ユーザー決定「送迎表から日誌の一方通行。日誌を変更したらそれが記録になるので、送迎表は変えなくていい」
//   今日の午前: 送迎表=1号車に A(到着 8:57)。日誌=手で変えた日(_tpManual)で 1号車の到着 09:05・2号車に A の印
//   日誌で「保存」→ 送迎表の到着・乗る車・運転者は変わらない(前は日誌の値で送迎表を書き換えていた)
//   実行: node scripts/chk_1028diaryoneway.mjs [--port 4175]
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4175'; })();
const b = await chromium.launch(); const r = {};
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage();
page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => d.accept());
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const info = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const t = new Date(); const iso = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; const dow = t.getDay();
  d.systemSettings = d.systemSettings || {}; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [] }; d.holidays = []; d.systemSettings.transportEnabled = true;
  d.diarySettings = d.diarySettings || {}; d.diarySettings.cars = [{ id: 'c1', name: '1号車', type: '', cap: '8' }, { id: 'c2', name: '2号車', type: '', cap: '8' }];
  const A = d.patients.find(p => p.status === '利用中' && !p.endDate); A.scheduleAmPm = ['', '', '', '', '', '', '']; A.scheduleAmPm[dow] = 'AM'; A.pauseHistory = []; A.scheduleChangeHistory = [];
  const staff = (d.diarySettings.staff || []).find(s => s && s.name); const drvKey = staff ? `a_c1_${staff.id}` : null;
  d.transportPlans = { [`${iso}_AM`]: { cars: { c1: [{ pid: A.id, t: '8:30' }] }, walkers: [], others: [], un: [], arrive: { c1: '8:57' }, arriveAuto: {}, driver: {}, _savedAt: Date.now() - 60000 } };
  d.diaryLogs = d.diaryLogs || {}; d.diaryLogs[`${iso}_AM`] = { pick: { [`${A.id}_c2`]: true }, drop: { [`${A.id}_c2`]: true }, carTimes: { c1: { arrive: '09:05' } }, driver: drvKey ? { [drvKey]: true } : {}, _tpManual: true, _tpSrc: 'tp', _tpAt: Date.now(), _savedAt: Date.now() };
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0');
  sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'diary', pid: null, date: iso, ampm: 'AM', t: Date.now() })); return { iso, A: A.id, staff: staff ? staff.name : '' }; });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2200); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
await page.locator('button:visible', { hasText: /^保存$/ }).first().click({ noWaitAfter: true }); await page.waitForTimeout(1500); // 保存の知らせ(alert)で待たないように
const pl = await page.evaluate((iso) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const p = (d.transportPlans || {})[`${iso}_AM`] || {}; const lg = (d.diaryLogs || {})[`${iso}_AM`] || {}; return { arrive: p.arrive, cars: Object.fromEntries(Object.entries(p.cars || {}).map(([k, v]) => [k, (v || []).map(m => m.pid)])), driver: p.driver, diaryArrive: ((lg.carTimes || {}).c1 || {}).arrive }; }, info.iso);
console.log('保存後', JSON.stringify(pl));
r.diarySaved = pl.diaryArrive === '09:05';
r.arriveKept = (pl.arrive || {}).c1 === '8:57'; r.carKept = JSON.stringify(pl.cars) === JSON.stringify({ c1: [info.A] }); r.driverKept = !Object.keys(pl.driver || {}).length;
await b.close();
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
