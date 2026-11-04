// 2026-11-04 trial514 ホームの「送迎の時間が変わった方(連絡が要る)」: 今日の午前=A(8:30→8:45 変更)・B(変わらない)、午後=C(配布後に追加)
//   ①ホームに A が午前・C が午後に出て B は出ない ②A にチェック→ 連絡済になり未連絡の数が減る・送迎表の A の赤枠が消え(連絡済) 要連絡の数も減る ③スマホでも1列で出る
//   実行: node scripts/chk_1104hometel.mjs [port]
import { chromium } from 'playwright';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
const r = {};
const b = await chromium.launch();
const seed = async (page, view) => {
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  const S = await page.evaluate((view) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const t = new Date(); const dow = t.getDay(); const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    d.systemSettings = d.systemSettings || {}; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [] }; delete d.systemSettings.transportEnabled; d.holidays = []; d.ticketRecords = (d.ticketRecords || []).filter(x => !(x && x.year === t.getFullYear())); d.transportPlans = {}; d.monthlyShifts = {};
    const act = d.patients.filter(p => p.status === '利用中' && !p.endDate); const ids = {}, names = {};
    const set = (k, i, sl) => { const p = act[i]; p.pauseHistory = []; p.scheduleAmPm = ['', '', '', '', '', '', '']; p.scheduleAmPm[dow] = sl; p.scheduleChangeHistory = []; p.startDate = '2025-01-01'; p.name = `検${k}四郎`; p.dropTimeOn = false; ids[k] = p.id; names[k] = p.name; };
    set('A', 0, 'AM'); set('B', 1, 'AM'); set('C', 2, 'PM'); act.slice(3).forEach(p => { p.scheduleAmPm = ['', '', '', '', '', '', '']; });
    const carId = ((d.diarySettings || {}).cars || [])[0]?.id || 'car1'; const today = iso(t); const now = Date.now();
    d.transportPlans[`${today}_AM`] = { cars: { [carId]: [{ pid: ids.A, t: '8:45', mark: false }, { pid: ids.B, t: '8:40', mark: false }] }, walkers: [], others: [], un: [], driver: {}, _savedAt: now - 60000, _base: { cars: { [carId]: [{ pid: ids.A, t: '8:30' }, { pid: ids.B, t: '8:40' }] }, walkers: [], others: [], driver: {} }, _baseAt: now - 86400000 * 2, _baseId: 'chk', _chgAt: { [ids.A]: now - 60000 } };
    d.transportPlans[`${today}_PM`] = { cars: { [carId]: [{ pid: ids.C, t: '13:10', mark: false }] }, walkers: [], others: [], un: [], driver: {}, _savedAt: now - 60000, _base: { cars: { [carId]: [] }, walkers: [], others: [], driver: {} }, _baseAt: now - 86400000 * 2, _baseId: 'chk', _chgAt: { [ids.C]: now - 60000 } };
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiTpDriveAck', String(now));
    sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view, pid: null, t: Date.now(), ampm: 'AM' })); return { ids, names, today, carId }; }, view);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); return S;
};
{ const page = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  const S = await seed(page, 'dashboard');
  const card = page.getByTestId('home-tp-notice');
  r.card = (await card.count()) === 1 && (await card.getAttribute('data-pending')) === '2';
  r.A_am = (await page.getByTestId(`home-tp-row-${S.today}-AM-${S.ids.A}`).count()) === 1 && /8:30→8:45/.test(await page.getByTestId(`home-tp-row-${S.today}-AM-${S.ids.A}`).innerText());
  r.C_pm = (await page.getByTestId(`home-tp-row-${S.today}-PM-${S.ids.C}`).count()) === 1 && /配布後に追加/.test(await page.getByTestId(`home-tp-row-${S.today}-PM-${S.ids.C}`).innerText());
  r.B_none = (await page.locator(`[data-testid^="home-tp-row-"][data-testid$="-${S.ids.B}"]`).count()) === 0;
  await page.screenshot({ path: '/tmp/chk_1104hometel_pc.png', fullPage: false }).catch(() => {});
  await page.getByTestId(`home-tp-row-${S.today}-AM-${S.ids.A}`).locator('input').check(); await page.waitForTimeout(900);
  r.A_done = (await page.getByTestId(`home-tp-row-${S.today}-AM-${S.ids.A}`).getAttribute('data-done')) === '1' && (await card.getAttribute('data-pending')) === '1';
  const saved = await page.evaluate((k) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); return (d.transportPlans[k] || {})._telDone || null; }, `${S.today}_AM`);
  r.saved = !!(saved && saved[S.ids.A] && saved[S.ids.A].on);
  // 送迎表側: A は連絡済(赤枠なし)・C は赤枠・要連絡 1件
  await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, t: Date.now(), ampm: 'AM' }))); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
  const dotA = page.getByTestId(`tp-dot-${S.today}-AM-${S.ids.A}`), dotC = page.getByTestId(`tp-dot-${S.today}-PM-${S.ids.C}`);
  r.tp_A_done = (await dotA.getAttribute('data-done')) === '1' && (await page.getByTestId(`tp-time-${S.ids.A}`).getAttribute('data-tel')) === '0';
  r.tp_C_red = (await dotC.getAttribute('data-on')) === '1' && (await dotC.getAttribute('data-done')) === '0';
  r.tp_count_1 = /要連絡\s*1件/.test(await page.getByTestId('tp-chg-btn').innerText().catch(() => ''));
  await page.context().close(); }
{ const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage(); page.on('dialog', d => d.accept());
  const S = await seed(page, 'dashboard');
  r.phone_card = (await page.getByTestId('home-tp-notice').count()) === 1 && (await page.getByTestId(`home-tp-row-${S.today}-AM-${S.ids.A}`).count()) === 1;
  const box = await page.getByTestId('home-tp-notice').boundingBox(); r.phone_fits = !!box && box.width <= 390;
  await page.screenshot({ path: '/tmp/chk_1104hometel_phone.png', fullPage: false }).catch(() => {});
  await page.context().close(); }
await b.close();
const ok = Object.values(r).every(v => v === true); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
