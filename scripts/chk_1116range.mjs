// 2026-11-16 trial583 ホーム: 「送迎時間の変更」の範囲(本日だけ/本日と明日/すべて)・「休み未連絡」の範囲(本日だけ/すべて)・「なし→時間」の「なし」を 臨時/休止/欠席(分からなければ なし)
//   今日 午前: A 8:30→8:45  今日 午後: C 臨時(基本の曜日に無し+提供記録 臨時)・D 休止から再開(履歴 30日前〜昨日)・E 欠席(配布の控え abs)・G 理由不明→なし
//   明日 午前: F 9:00→9:10  3日後 午前: B 8:40→8:50  休み未連絡: H 今日(提供記録 欠席)・I 2日後(月間表 欠席)
//   実行: node scripts/chk_1116range.mjs [port]
import { chromium } from 'playwright';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
const r = {}; const b = await chromium.launch();
const seed = async (page, cfg, view) => {
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  const S = await page.evaluate(([cfg, view]) => {
    const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const t = new Date(); t.setHours(0, 0, 0, 0);
    const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; const add = (n) => { const x = new Date(t); x.setDate(x.getDate() + n); return x; }; const jp = (x) => `${x.getMonth() + 1}月${x.getDate()}日`;
    d.systemSettings = d.systemSettings || {}; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [] }; delete d.systemSettings.transportEnabled; d.systemSettings.homeTasks = { ...(d.systemSettings.homeTasks || {}), ...cfg };
    d.holidays = []; d.ticketRecords = (d.ticketRecords || []).filter(x => !(x && x.year >= t.getFullYear() - 1)); d.transportPlans = {}; d.monthlyShifts = {}; d.faxDataStore = {}; d.scheduleEvents = [];
    const act = d.patients.filter(p => p.status === '利用中' && !p.endDate); const ids = {}, names = {};
    const set = (k, i, dayN, sl) => { const p = act[i]; p.pauseHistory = []; p.scheduleAmPm = ['', '', '', '', '', '', '']; if (sl) p.scheduleAmPm[add(dayN).getDay()] = sl; p.scheduleChangeHistory = []; p.startDate = '2025-01-01'; p.status = '利用中'; p.name = `検${k}四郎`; p.dropTimeOn = false; ids[k] = p.id; names[k] = p.name; return p; };
    set('A', 0, 0, 'AM'); set('C', 1, 0, ''); const D = set('D', 2, 0, 'PM'); set('E', 3, 0, 'PM'); set('G', 4, 0, 'PM'); set('F', 5, 1, 'AM'); set('B', 6, 3, 'AM'); set('H', 7, 0, 'AM'); set('I', 8, 2, 'AM'); act.slice(9).forEach(p => { p.scheduleAmPm = ['', '', '', '', '', '', '']; });
    const carId = ((d.diarySettings || {}).cars || [])[0]?.id || 'car1'; const now = Date.now(); const today = iso(t), tmr = iso(add(1)), d2 = iso(add(2)), d3 = iso(add(3));
    D.pauseHistory = [{ reason: '入院', fromDate: iso(add(-30)), toDate: iso(add(-1)) }];
    d.ticketRecords.push({ id: 'chkC_rinji', patientId: ids.C, year: t.getFullYear(), date: jp(t), status: '臨時', tokki: '午後' });
    d.ticketRecords.push({ id: 'chkH_abs', patientId: ids.H, year: t.getFullYear(), date: jp(t), status: '欠席' });
    d.monthlyShifts[d2.slice(0, 7)] = { [ids.I]: { [`${add(2).getDate()}_AM`]: '欠席' } };
    const mkPl = (members, baseMembers, chg, extra) => ({ cars: { [carId]: members.map(m => ({ ...m, mark: false })) }, walkers: [], others: [], un: [], driver: {}, _savedAt: now - 60000, _base: { cars: { [carId]: baseMembers }, walkers: [], walkT: {}, others: [], driver: {}, ...(extra || {}) }, _baseAt: now - 86400000 * 2, _baseId: 'chk', _chgAt: Object.fromEntries(chg.map(p => [p, now - 60000])) });
    d.transportPlans[`${today}_AM`] = mkPl([{ pid: ids.A, t: '8:45' }], [{ pid: ids.A, t: '8:30' }], [ids.A]);
    d.transportPlans[`${today}_PM`] = mkPl([{ pid: ids.C, t: '13:10' }, { pid: ids.D, t: '13:20' }, { pid: ids.E, t: '13:30' }, { pid: ids.G, t: '13:40' }], [], [ids.C, ids.D, ids.E, ids.G], { abs: { [ids.E]: '欠席' } });
    d.transportPlans[`${tmr}_AM`] = mkPl([{ pid: ids.F, t: '9:10' }], [{ pid: ids.F, t: '9:00' }], [ids.F]);
    d.transportPlans[`${d3}_AM`] = mkPl([{ pid: ids.B, t: '8:50' }], [{ pid: ids.B, t: '8:40' }], [ids.B]);
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiTpDriveAck', String(now));
    sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: view || 'dashboard', pid: null, t: Date.now(), ampm: 'AM' })); return { ids, names, today, tmr, d2, d3, carId }; }, [cfg, view]);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); return S;
};
const ctx = () => b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
const rowOf = (page, S, iso, sl, k) => page.getByTestId(`home-tp-row-${iso}-${sl}-${S.ids[k]}`);
const acOf = async (page, S, iso, sl, k) => (await page.getByTestId(`home-tp-ac-${iso}-${sl}-${S.ids[k]}`).innerText().catch(() => '')).replace(/\s/g, '');
{ // 既定(本日と明日)
  const page = await (await ctx()).newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  const S = await seed(page, {});
  r.def_today_A = (await rowOf(page, S, S.today, 'AM', 'A').count()) === 1;
  r.def_tmr_F = (await rowOf(page, S, S.tmr, 'AM', 'F').count()) === 1;
  r.def_d3_none = (await rowOf(page, S, S.d3, 'AM', 'B').count()) === 0;
  r.reason_C_rinji = /^臨時→13:10$/.test(await acOf(page, S, S.today, 'PM', 'C'));
  r.reason_D_kyushi = /^休止→13:20$/.test(await acOf(page, S, S.today, 'PM', 'D'));
  r.reason_E_kesseki = /^欠席→13:30$/.test(await acOf(page, S, S.today, 'PM', 'E'));
  r.reason_G_nashi = /^なし→13:40$/.test(await acOf(page, S, S.today, 'PM', 'G'));
  r.abs_today_H = (await page.getByTestId(`home-absence-row-${S.ids.H}`).count()) === 1;
  r.abs_I_none = (await page.getByTestId(`home-absence-row-${S.d2}-${S.ids.I}`).count()) === 0;
  // 表示設定: 送迎時間の変更の範囲 select(既定 two)→ today で明日が消える → all で3日後が出る／休み未連絡の範囲 all で2日後の I が日の見出し付きで出る
  await page.getByTestId('home-tasks-cfg').click(); await page.waitForTimeout(400);
  const selTp = page.getByTestId('home-tasks-cfg-tpNotice-range'); r.sel_tp = (await selTp.count()) === 1 && (await selTp.inputValue()) === 'two';
  await selTp.selectOption('today'); await page.waitForTimeout(800);
  r.today_only = (await rowOf(page, S, S.today, 'AM', 'A').count()) === 1 && (await rowOf(page, S, S.tmr, 'AM', 'F').count()) === 0 && (await page.evaluate(() => { const c = JSON.parse(localStorage.getItem('daycareAppData_v3')).systemSettings.homeTasks.tpNotice; return c.range === 'today' && c.todayOnly === true; }));
  await selTp.selectOption('all'); await page.waitForTimeout(800);
  r.all_days = (await rowOf(page, S, S.tmr, 'AM', 'F').count()) === 1 && (await rowOf(page, S, S.d3, 'AM', 'B').count()) === 1 && /8:40→8:50/.test(await acOf(page, S, S.d3, 'AM', 'B'));
  r.all_pending_7 = (await page.getByTestId('home-tp-notice').getAttribute('data-pending')) === '7';
  const selAb = page.getByTestId('home-tasks-cfg-absence-range'); r.sel_abs = (await selAb.count()) === 1 && (await selAb.inputValue()) === 'today';
  await selAb.selectOption('all'); await page.waitForTimeout(800);
  r.abs_all = (await page.getByTestId(`home-absence-row-${S.ids.H}`).count()) === 1 && (await page.getByTestId(`home-absence-row-${S.d2}-${S.ids.I}`).count()) === 1 && (await page.getByTestId(`home-absence-day-${S.d2}`).count()) === 1 && /今日/.test(await page.getByTestId(`home-absence-day-${S.today}`).innerText());
  r.abs_pending_2 = (await page.getByTestId('home-absence').getAttribute('data-pending')) === '2';
  await selAb.selectOption('today'); await page.waitForTimeout(800); r.abs_back = (await page.getByTestId(`home-absence-row-${S.d2}-${S.ids.I}`).count()) === 0 && (await page.getByTestId('home-absence').getAttribute('data-pending')) === '1';
  await page.screenshot({ path: '/tmp/chk_1116range_pc.png', fullPage: false }).catch(() => {});
  await page.context().close(); }
{ // 古い設定 todayOnly:true は「本日だけ」として引き継ぐ
  const page = await (await ctx()).newPage(); page.on('dialog', d => d.accept());
  const S = await seed(page, { tpNotice: { todayOnly: true } });
  r.legacy_todayOnly = (await rowOf(page, S, S.today, 'AM', 'A').count()) === 1 && (await rowOf(page, S, S.tmr, 'AM', 'F').count()) === 0;
  await page.context().close(); }
{ // 送迎表側: 未対応の一覧にも 臨時→13:10・休止→13:20・欠席→13:30
  const page = await (await ctx()).newPage(); page.on('dialog', d => d.accept());
  const S = await seed(page, {}, 'transport');
  await page.getByTestId('tp-chg-btn').click().catch(() => {}); await page.waitForTimeout(700);
  const txt = (await page.locator('body').innerText()).replace(/\s/g, '');
  r.tp_panel_reasons = /臨時→13:10/.test(txt) && /休止→13:20/.test(txt) && /欠席→13:30/.test(txt) && /なし→13:40/.test(txt);
  // 配布(連絡帳を渡した印)で取る控えに abs が入る: E を控えの無い午後のコマから外して「配布」相当 _stampHanded は UI 経由が重いので、確定(_snapPlan(pl, iso, sl))の形を直接は見ず、今の送迎表の _base.abs が読まれていることまで(上で確認済み)
  await page.context().close(); }
await b.close();
const ok = Object.values(r).every(v => v === true); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
