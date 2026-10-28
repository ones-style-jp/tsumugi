// 2026-10-28 ユーザー報告「休みなどで変更するを押したら、送迎表の施設に到着の時間が空欄になったような気がする」
//   今日の午前の送迎表(運行表を出した後): 1号車=A・B(到着 8:57 手で決めた) / 2号車=C・D(到着 8:58 目安) / 3号車=E だけ(到着 8:59 手で決めた)
//   A と E を月間スケジュールで欠席にして、送迎表を開く → 「休み・休止になった方」→「送迎表に反映する」
//   ①1号車の到着 8:57 がそのまま ②2号車の目安 8:58 がそのまま ③3号車(誰も乗らなくなった)の手で決めた到着は消えない(データに残る)
//   実行: node scripts/chk_1028tparrive.mjs [--port 4175]
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4175'; })();
const b = await chromium.launch(); const r = {};
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage();
page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => d.accept());
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const info = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const t = new Date(); const iso = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; const dow = t.getDay(); const mk = iso.slice(0, 7);
  d.systemSettings = d.systemSettings || {}; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [] }; d.holidays = [];
  d.diarySettings = d.diarySettings || {}; d.diarySettings.cars = [{ id: 'c1', name: '1号車', type: '', cap: '8' }, { id: 'c2', name: '2号車', type: '', cap: '8' }, { id: 'c3', name: '3号車', type: '', cap: '8' }];
  const ps = d.patients.filter(p => p.status === '利用中' && !p.endDate).slice(0, 5); if (ps.length < 5) return null;
  ps.forEach(p => { p.scheduleAmPm = ['', '', '', '', '', '', '']; p.scheduleAmPm[dow] = 'AM'; p.scheduleChangeHistory = []; p.pauseHistory = []; });
  const [A, B, C, D, E] = ps; d.monthlyShifts = d.monthlyShifts || {}; d.monthlyShifts[mk] = d.monthlyShifts[mk] || {}; ps.forEach(p => { d.monthlyShifts[mk][p.id] = {}; });
  d.ticketRecords = (d.ticketRecords || []).filter(x => !ps.some(p => p.id === x.patientId));
  const cars = { c1: [{ pid: A.id, t: '8:30' }, { pid: B.id, t: '8:40' }], c2: [{ pid: C.id, t: '8:35' }, { pid: D.id, t: '8:45' }], c3: [{ pid: E.id, t: '8:50' }] };
  d.transportPlans = { [`${iso}_AM`]: { cars, walkers: [], others: [], un: [], memo: '', arrive: { c1: '8:57', c2: '8:58', c3: '8:59' }, arriveAuto: { c2: true }, _base: { cars, walkers: [], others: [] }, _baseAt: Date.now() - 86400000, _baseId: 'b1', _savedAt: Date.now() } };
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0');
  // A と E を欠席に(月間スケジュール)
  d.monthlyShifts[mk][A.id] = { [`${t.getDate()}_AM`]: '欠席' }; d.monthlyShifts[mk][E.id] = { [`${t.getDate()}_AM`]: '欠席' }; localStorage.setItem('daycareAppData_v3', JSON.stringify(d));
  sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, t: Date.now() }));
  return { iso, A: A.name, E: E.name }; });
r.seed = !!info; if (!info) { console.log('NO SEED'); process.exit(1); }
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
const st = page.getByTestId('tp-stale-modal'); const txt = (await st.count()) ? await st.innerText() : ''; console.log('小窓:', JSON.stringify(txt.slice(0, 160)));
r.staleShown = txt.includes(info.A) && txt.includes(info.E);
await page.getByTestId('tp-stale-apply').click().catch(() => {}); await page.waitForTimeout(1200);
const pl = await page.evaluate((iso) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const p = (d.transportPlans || {})[`${iso}_AM`] || {}; return { arrive: p.arrive, arriveAuto: p.arriveAuto, cars: Object.fromEntries(Object.entries(p.cars || {}).map(([k, v]) => [k, v.length])) }; }, info.iso);
console.log('反映後', JSON.stringify(pl));
r.car1Kept = (pl.arrive || {}).c1 === '8:57'; r.car2EstKept = (pl.arrive || {}).c2 === '8:58'; r.car3Kept = (pl.arrive || {}).c3 === '8:59'; r.removed = pl.cars.c1 === 1 && pl.cars.c3 === 0;
await b.close();
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
