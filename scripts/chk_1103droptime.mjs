// 2026-11-03 trial507 利用者マスタの「基本の送り時間」(利用者ごとのチェック) → 送迎表の送りの時間の初期値
//   P1: 設定する＋今日の曜日 12:30 → 送迎表(PC の週の表・スマホの1日)に「送12:30」が出る
//   P2: 設定しない(チェックなし)＋12:45 が入っている → 出ない   P3: 設定する＋時だけ(13:--) → 出ない
//   利用者マスタ: 基本のお迎え時間の下に「基本の送り時間も設定する」のチェックがあり、チェックすると曜日の欄が出る
//   実行: node scripts/chk_1103droptime.mjs [port]
import { chromium } from 'playwright';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
const r = {};
const b = await chromium.launch();
const seed = async (page, view, extra) => {
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  const S = await page.evaluate(([view, extra]) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const t = new Date(); const dow = t.getDay(); const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    d.systemSettings = d.systemSettings || {}; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [] }; delete d.systemSettings.tpDropShown; d.holidays = []; d.ticketRecords = (d.ticketRecords || []).filter(x => !(x && x.year === t.getFullYear())); d.transportPlans = {}; d.monthlyShifts = {};
    const act = d.patients.filter(p => p.status === '利用中' && !p.endDate); const names = {};
    const set = (k, i, on, tm) => { const p = act[i]; p.pauseHistory = []; p.scheduleAmPm = ['', '', '', '', '', '', '']; p.scheduleAmPm[dow] = 'AM'; p.scheduleChangeHistory = []; p.startDate = '2025-01-01'; p.name = `検${k}次郎`; p.dropTimeOn = on; p.dropTimes = ['', '', '', '', '', '', '']; p.dropTimes[dow] = tm; p.pickupMinutes = ''; names[k] = p.name; return p.id; };
    const ids = { P1: set('P1', 0, true, '12:30'), P2: set('P2', 1, false, '12:45'), P3: set('P3', 2, true, '13:--') };
    act.slice(3).forEach(p => { p.scheduleAmPm = ['', '', '', '', '', '', '']; });
    // 先週の送迎表に3人を同じ車に乗せておく(今週の下書きで同じ車に入る)
    const carId = ((d.diarySettings || {}).cars || [])[0]?.id || 'car1'; const w = new Date(t); w.setDate(w.getDate() - 7);
    d.transportPlans[`${iso(w)}_AM`] = { cars: { [carId]: [{ pid: ids.P1, t: '8:30', mark: false }, { pid: ids.P2, t: '8:40', mark: false }, { pid: ids.P3, t: '8:50', mark: false }] }, walkers: [], others: [], un: [], driver: {}, _savedAt: Date.now() - 86400000 * 7 };
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiTpDriveAck', String(Date.now()));
    sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view, pid: null, t: Date.now(), ampm: 'AM', ...(extra || {}) })); return { names, ids, today: iso(t) }; }, [view, extra]);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); return S;
};
// 1) PC の送迎表
{ const page = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  const S = await seed(page, 'transport');
  const txt = await page.evaluate(() => document.body.innerText);
  r.pc_P1_12_30 = /送\s*12:30/.test(txt) || (await page.getByTestId(`tp-fb-dat-${S.today}-AM-${S.ids.P1}`).count()) > 0;
  r.pc_P2_none = !/12:45/.test(txt); r.pc_P3_none = !/13:--|送\s*13/.test(txt);
  await page.screenshot({ path: '/tmp/chk_1103droptime_pc.png', fullPage: true }).catch(() => {});
  // 2) 利用者マスタ(P1 を開く)
  await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'master', pid: null, t: Date.now() }))); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800);
  await page.locator('button:visible', { hasText: new RegExp('^' + S.names.P2) }).first().click(); await page.waitForTimeout(1500);
  await page.locator('button:visible', { hasText: /^サービス提供内容$/ }).first().click(); await page.waitForTimeout(1000); // 基本のお迎え時間はこのタブ
  const cb = page.getByTestId('pm-droptime-on'); r.master_checkbox = (await cb.count()) > 0;
  if (r.master_checkbox) { r.master_unchecked_hint = (await page.getByText('帰りの時間を決めている方だけ', { exact: false }).count()) > 0; await cb.scrollIntoViewIfNeeded(); await cb.click(); await page.waitForTimeout(600); r.master_grid_after_check = (await page.getByText('送迎表の「送りの時間」の初期値になります', { exact: false }).count()) > 0; }
  await page.screenshot({ path: '/tmp/chk_1103droptime_master.png', fullPage: false }).catch(() => {});
  await page.context().close(); }
// 3) スマホの送迎表
{ const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage(); page.on('dialog', d => d.accept());
  await seed(page, 'transport');
  const am = page.locator('button', { hasText: /^AM$/ }).first(); if (await am.count()) { await am.click().catch(() => {}); await page.waitForTimeout(800); }
  const txt = await page.evaluate(() => document.body.innerText);
  r.phone_P1_12_30 = /送\s*12:30/.test(txt); r.phone_P2_none = !/12:45/.test(txt);
  await page.screenshot({ path: '/tmp/chk_1103droptime_phone.png', fullPage: true }).catch(() => {});
  await page.context().close(); }
await b.close();
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
