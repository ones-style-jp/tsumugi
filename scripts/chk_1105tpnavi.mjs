// 2026-11-05 trial522(ユーザー要望・送迎表): ①車の見出しの横にナビのボタン(車の名前のメニューからはナビを外す) ②「その他」の「送りの時間を表示する」はチェックの形・説明の2行目なし
//   ③送りの時間を表示しない店舗は、自動計算の「送りの時間」のチェックが最初から外れている ④まだ作っていない基本の送迎表の曜日は、今週の同じ曜日の並びを写した下書き
//   ⑤お迎え時間を入れていない方(提供時間からの目安「8時」)は 8:-- と出す(8:00 と出していた)
//   実行: node scripts/chk_1105tpnavi.mjs [port]
import { chromium } from 'playwright';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
const b = await chromium.launch(); const r = {};
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const now = new Date(); const mon = new Date(now); mon.setDate(now.getDate() + (now.getDay() === 0 ? -6 : 1 - now.getDay())); mon.setHours(0, 0, 0, 0); const key = `${iso(mon)}_AM`;
async function start(prep, date) {
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
  const ids = await page.evaluate(([key, prep, date]) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.systemSettings = d.systemSettings || {}; d.holidays = []; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [] };
    const ps = (d.patients || []).filter(p => p.status === '利用中' && p.address).slice(0, 4);
    d.diarySettings = d.diarySettings || {}; d.diarySettings.cars = [{ id: 'car1', name: '1号車', type: '' }, { id: 'car2', name: '2号車', type: '' }]; d.transportPlans = {};
    const dow = new Date(key.slice(0, 10) + 'T00:00:00').getDay(); ps.forEach((p) => { p.schedule = undefined; p.scheduleHistory = undefined; p.scheduleAmPm = ['', '', '', '', '', '', '']; p.scheduleAmPm[dow] = 'AM'; p.pickupMinutes = 2; p.pickupType = 'fixed'; p.pickupTimes = ['', '', '', '', '', '', '']; p.pickupTimes[dow] = '8:30'; });
    ps[3].pickupType = ''; ps[3].pickupTimes = []; // お迎え時間を入れていない方
    d.transportPlans[key] = { cars: { car1: [{ pid: ps[0].id, t: '8:30', mark: false }, { pid: ps[1].id, t: '8:40', mark: false }], car2: [{ pid: ps[2].id, t: '8:45', mark: false }, { pid: ps[3].id, t: '8時', mark: false }] }, walkers: [], others: [], un: [], memo: '', driver: { car1: '', car2: '' }, _savedAt: Date.now() };
    (new Function('d', prep || ''))(d); localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); localStorage.setItem('tsumugiTpDriveAck', String(Date.now())); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, date: date || key.slice(0, 10), ampm: 'AM', t: Date.now() })); return ps.map(p => p.id); }, [key, prep, date]);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
  return { page, ids }; }
{ const { page, ids } = await start("d.systemSettings.tpDropShown = false;");
  // ① ナビ
  const navi = page.getByTestId(`tp-navi-${iso(mon)}-AM-car1`); r.navi_on_head = (await navi.count()) === 1 && await navi.isVisible() && /ナビ/.test(await navi.innerText());
  await page.getByTestId(`tp-carhead-${iso(mon)}-AM-car1`).click(); await page.waitForTimeout(300);
  const menu = page.getByTestId(`tp-carmenu-${iso(mon)}-AM-car1`); r.menu_no_navi = (await menu.count()) === 1 && !/経路案内|ナビ/.test(await menu.innerText());
  await page.mouse.click(5, 890); await page.waitForTimeout(300);
  // ⑤ 8時 → 8:--
  const t4 = page.locator(`[data-tprow][data-tppid="${ids[3]}"][data-tpiso="${iso(mon)}"] input`).first(); r.notime_dash = (await t4.count()) === 1 && (await t4.inputValue()) === '8:--';
  const t1 = page.locator(`[data-tprow][data-tppid="${ids[0]}"][data-tpiso="${iso(mon)}"] input`).first(); r.time_kept = (await t1.inputValue()) === '8:30';
  // ② その他
  await page.getByTestId('tp-more').click(); await page.waitForTimeout(300);
  const mm = page.getByTestId('tp-more-menu'); const mtx = await mm.innerText();
  r.more_check = (await page.getByTestId('tp-drop-check').count()) === 1 && !(await page.getByTestId('tp-drop-check').isChecked()) && /送りの時間を表示する/.test(mtx) && !/いま:|曜日ごとの|表示しない/.test(mtx);
  await page.getByTestId('tp-drop-check').click(); await page.waitForTimeout(700);
  r.more_stays_open = (await page.getByTestId('tp-more-menu').count()) === 1 && await page.getByTestId('tp-drop-check').isChecked() && (await page.getByTestId('tp-drop-toggle').getAttribute('data-shown')) === '1';
  r.saved_shown = await page.evaluate(() => JSON.parse(localStorage.getItem('daycareAppData_v3')).systemSettings.tpDropShown === true);
  await page.getByTestId('tp-drop-check').click(); await page.waitForTimeout(700);
  r.saved_hidden = await page.evaluate(() => JSON.parse(localStorage.getItem('daycareAppData_v3')).systemSettings.tpDropShown === false);
  await page.mouse.click(5, 890); await page.waitForTimeout(300);
  // ③ 自動計算: 表示しない店舗 → 送りの時間のチェックは外れている
  await page.getByTestId('tp-autocalc').click(); await page.waitForTimeout(400);
  r.ac_drop_off = (await page.getByTestId('ac-drop').count()) === 1 && !(await page.getByTestId('ac-drop').isChecked()) && await page.getByTestId('ac-jikan').isChecked();
  await page.context().close(); }
{ const { page } = await start("d.systemSettings.tpDropShown = true;");
  await page.getByTestId('tp-autocalc').click(); await page.waitForTimeout(400);
  r.ac_drop_on_when_shown = await page.getByTestId('ac-drop').isChecked();
  await page.context().close(); }
// ④ 基本の送迎表(まだ作っていない月曜)= 今週の月曜の並び
{ const { page, ids } = await start('', '2099-01-05');
  const carOf = async (pid) => { const row = page.locator(`[data-tprow][data-tppid="${pid}"][data-tpiso="2099-01-05"]`).first(); return (await row.count()) ? await row.getAttribute('data-tpcid') : ''; };
  const c = [await carOf(ids[0]), await carOf(ids[1]), await carOf(ids[2]), await carOf(ids[3])];
  r.base_from_current = c[0] === 'car1' && c[1] === 'car1' && c[2] === 'car2' && c[3] === 'car2';
  const tb = page.locator(`[data-tprow][data-tppid="${ids[2]}"][data-tpiso="2099-01-05"] input`).first(); r.base_time_from_current = (await tb.count()) === 1 && (await tb.inputValue()) === '8:45';
  r.base_banner = /今の送迎表の並び/.test(await page.getByTestId('tp-base-banner').innerText().catch(() => ''));
  await page.screenshot({ path: '/tmp/chk_1105tpnavi_base.png' }).catch(() => {});
  await page.context().close(); }
// ⑥ 座席表の下の「この日の午後の迎え」を大きく(名前 16px)・説明はⓘ
{ const { page, ids } = await start("const ps=(d.patients||[]).filter(p=>p.status==='利用中'&&p.address).slice(0,4); const k=Object.keys(d.transportPlans)[0]; const pl=d.transportPlans[k]; pl.dropMode='custom'; pl.drop={cars:{car1:[{pid:ps[0].id,seat:0}],car2:[{pid:ps[2].id,seat:0}]},walkers:[],others:[],depart:{}}; d.transportPlans[k.replace('_AM','_PM')]={cars:{car1:[{pid:ps[1].id,t:'13:15',mark:false}]},walkers:[],others:[],un:[],memo:'',driver:{},_savedAt:Date.now()};");
  await page.getByTestId(`tp-seatbtn-${iso(mon)}-AM`).first().click().catch(async () => { await page.getByTestId(`tp-fb-seatbtn-${iso(mon)}-AM`).first().click(); }); await page.waitForTimeout(900);
  const box = page.getByTestId('tp-seat-pm'); r.seat_pm_shown = (await box.count()) === 1;
  r.seat_pm_big = r.seat_pm_shown && await page.getByTestId('tp-seat-pm-car1').evaluate((el) => { const row = [...el.querySelectorAll('div')].find(x => /13:15/.test(x.textContent) && x.children.length === 2); return !!row && parseFloat(getComputedStyle(row).fontSize) >= 16; });
  r.seat_pm_hint = r.seat_pm_shown && (await box.getByTestId('tsu-hint').count()) === 1 && !/確認用/.test(await box.innerText());
  await page.screenshot({ path: '/tmp/chk_1105tpnavi_seatpm.png' }).catch(() => {}); void ids;
  await page.context().close(); }
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close(); process.exit(Object.values(r).every(Boolean) ? 0 : 1);
