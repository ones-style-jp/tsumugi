// 2026-10-26 日誌の送迎の印: ①過去(10/25以前)の日誌は開いても送迎表から自動で置き換えない ②付け直し: 「送迎表から自動」で印が消えた過去の日誌に、送迎表の分と1週間前の分を足し戻す(1回だけ・元の値は控え) ③日誌の運転者チェック・到着を入れると送迎表にも反映
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4173'; })();
const b = await chromium.launch(); const r = {};
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = new Date(); today.setHours(0, 0, 0, 0); if (today.getDay() === 0) today.setDate(today.getDate() + 1);
const PAST = '2026-10-20', PAST7 = '2026-10-13';
async function start(view, dateIso, prep, vw) {
  const ctx = await b.newContext({ viewport: vw || { width: 1366, height: 900 }, hasTouch: !!(vw && vw.width < 700), locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
  const ids = await page.evaluate(([view, dateIso, prep, PAST, PAST7, todayIso]) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.systemSettings = d.systemSettings || {}; delete d.systemSettings._diaryTpRepair1026; const ps = (d.patients || []).filter(p => p.status === '利用中').slice(0, 3);
    const dows = [PAST, PAST7, todayIso].map(x => new Date(x + 'T00:00:00').getDay()); ps.forEach(p => { p.scheduleAmPm = ['', '', '', '', '', '', '']; dows.forEach(w => { p.scheduleAmPm[w] = 'AM'; }); });
    d.diarySettings = d.diarySettings || {}; d.diarySettings.cars = [{ id: 'car1', name: '1号車', type: '' }, { id: 'car2', name: '2号車', type: '' }]; d.diarySettings.staff = [{ id: 's1', name: '見本 職員', role: '介護職員' }, { id: 's2', name: '例示 二郎', role: '介護職員' }];
    d.transportPlans = d.transportPlans || {}; d.diaryLogs = d.diaryLogs || {};
    // 過去の日: 送迎表は 1号車に ps[0] だけ・運転者 s1。日誌は手で 2台(1号車 ps[0]/ps[1]・2号車 ps[2])・運転者 s1,s2
    d.transportPlans[`${PAST}_AM`] = { cars: { car1: [{ pid: ps[0].id, t: '8:30' }], car2: [] }, walkers: [], others: [], un: [], memo: '', driver: { car1: '見本 職員' }, _savedAt: Date.now() };
    d.diaryLogs[`${PAST}_AM`] = { pick: { [`${ps[0].id}_car1`]: true, [`${ps[1].id}_car1`]: true, [`${ps[2].id}_car2`]: true }, drop: {}, driver: { a_car1_s1: true, a_car2_s2: true }, carTimes: { car2: { arrive: '09:00' } }, _savedAt: 1 };
    // 付け直しの対象: 10/13 の 1週間後に自動反映で消えた日(1号車の ps[0] と s1 だけ残っている)。1週間前(10/13)は 2台
    d.diaryLogs[`${PAST7}_AM`] = { pick: { [`${ps[0].id}_car1`]: true, [`${ps[2].id}_car2`]: true }, drop: {}, driver: { a_car1_s1: true, a_car2_s2: true }, carTimes: { car2: { arrive: '09:05' } }, _savedAt: 1 };
    d.diaryLogs[`2026-10-20_PM`] = { pick: { [`${ps[0].id}_car1`]: true }, drop: {}, driver: { a_car1_s1: true }, carTimes: {}, _tpSrc: 'tp', _tpAt: 2, _savedAt: 2 };
    d.diaryLogs[`2026-10-13_PM`] = { pick: { [`${ps[0].id}_car1`]: true, [`${ps[2].id}_car2`]: true }, drop: {}, driver: { a_car1_s1: true, a_car2_s2: true }, carTimes: { car2: { arrive: '09:10' } }, _savedAt: 1 };
    // 今日: 送迎表あり(反映の確認用)
    d.transportPlans[`${todayIso}_AM`] = { cars: { car1: [{ pid: ps[0].id, t: '8:30' }], car2: [{ pid: ps[2].id, t: '8:40' }] }, walkers: [], others: [], un: [], memo: '', driver: {}, _savedAt: Date.now() };
    (new Function('d', prep || ''))(d); localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0');
    sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view, pid: null, date: dateIso, ampm: 'AM', t: Date.now() })); return ps.map(p => p.id); }, [view, dateIso, prep, PAST, PAST7, iso(today)]);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
  return { page, ids }; }
const data = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('daycareAppData_v3')));
// ① 過去の日誌は置き換えない ② 付け直し
{ const { page, ids } = await start('diary', PAST, "");
  await page.waitForTimeout(1500); const d = await data(page); const lg = d.diaryLogs[`${PAST}_AM`] || {};
  const src = await page.getByTestId('diary-tp-src').getAttribute('data-src').catch(() => null);
  r.pastUntouched = (src !== 'tp') && !!(lg.pick && lg.pick[`${ids[1]}_car1`] && lg.pick[`${ids[2]}_car2`]) && !!(lg.driver && lg.driver.a_car2_s2); if (!r.pastUntouched) console.log('PAST', src, JSON.stringify(lg).slice(0, 300));
  const rp = d.diaryLogs['2026-10-20_PM'] || {};
  r.repaired = rp._tpRepair === '1026' && !!(rp.pick && rp.pick[`${ids[2]}_car2`]) && !!(rp.driver && rp.driver.a_car2_s2 && rp.driver.a_car1_s1) && ((rp.carTimes || {}).car2 || {}).arrive === '09:10' && !!rp._tpRepairPrev && !!d.systemSettings._diaryTpRepair1026; if (!r.repaired) console.log('REP', JSON.stringify(rp).slice(0, 400), d.systemSettings._diaryTpRepair1026);
  r.repairOnce = d.systemSettings._diaryTpRepairN === 1; if (!r.repairOnce) console.log('N', d.systemSettings._diaryTpRepairN);
  await page.context().close(); }
// ③ 日誌 → 送迎表(運転者・到着)
{ const { page, ids } = await start('diary', iso(today), "d.systemSettings._diaryTpRepair1026 = 1; localStorage.setItem('tsumugiTpDriveAck', String(Date.now()));", { width: 390, height: 844 });
  await page.waitForTimeout(1200);
  // スマホの送迎パネル(dpc)の運転者チップを押す → 自動保存 → 送迎表の運転者に入る
  const chip = page.getByTestId('dpc-drv-a_car1_s1'); if (!(await chip.count())) { await page.locator('button', { hasText: /^送迎/ }).first().click({ timeout: 1500 }).catch(() => {}); await page.waitForTimeout(400); }
  let ok = false; if (await chip.count()) { await chip.scrollIntoViewIfNeeded(); await chip.click(); await page.waitForTimeout(2500); const d0 = await data(page); ok = ((d0.transportPlans[`${iso(today)}_AM`] || {}).driver || {}).car1 === '見本 職員'; if (!ok) console.log('LOGDRV', JSON.stringify((d0.diaryLogs[`${iso(today)}_AM`] || {}).driver || {}), 'PLDRV', JSON.stringify((d0.transportPlans[`${iso(today)}_AM`] || {}).driver || {})); } else console.log('chip not found');
  r.driverToTp = ok;
  await page.context().close(); void ids; }
console.log(r, Object.values(r).every(v => v === true || v === 'skip') ? 'PASS' : 'FAIL'); await b.close();
