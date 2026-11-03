// 2026-11-03 trial505 ユーザー報告「退所した方がスマホの送迎表で休みに出る」: 送迎表は利用終了日だけで判定していたため、状態=退所でも終了日が空だと出ていた
//   A: 状態=退所・利用終了日なし → 今日の送迎表(週の表・スマホの1日)に名前が出ない(休み・未割当・車のどこにも)
//   B: 状態=退所・利用終了日=昨日 → 出ない   E(trial506・スマホの写真): 配布の控え(_base)に乗っていた方が終了日=昨日で退所 → 打ち消し線の「休み」の行にも「運行表を出した後の変更」にも出ない   C: 状態=退所・利用終了日=明後日 → 今日は出る(未割当か休み)   D: 状態=利用中 → 出る
//   実行: node scripts/chk_1103tpresign.mjs [port]
import { chromium } from 'playwright';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
const r = {};
const b = await chromium.launch();
const run = async (phone) => {
  const page = await (await b.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1366, height: 900 }, isMobile: !!phone, hasTouch: !!phone, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
  page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  const S = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const t = new Date(); const dow = t.getDay(); const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    d.systemSettings = d.systemSettings || {}; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [] }; d.holidays = []; d.ticketRecords = (d.ticketRecords || []).filter(x => !(x && x.year === t.getFullYear())); d.transportPlans = {}; d.monthlyShifts = {};
    const act = d.patients.filter(p => p.status === '利用中' && !p.endDate); const names = {};
    const set = (k, i, st, end) => { const p = act[i]; p.status = st; p.endDate = end; p.pauseHistory = []; p.scheduleAmPm = ['', '', '', '', '', '', '']; p.scheduleAmPm[dow] = 'AM'; p.scheduleChangeHistory = []; p.startDate = '2025-01-01'; p.name = `検${k}太郎`; names[k] = p.name; };
    const y = new Date(t); y.setDate(y.getDate() - 1); const n2 = new Date(t); n2.setDate(n2.getDate() + 2);
    set('A', 0, '退所', ''); set('B', 1, '退所', iso(y)); set('C', 2, '退所', iso(n2)); set('D', 3, '利用中', ''); set('E', 4, '退所', iso(y));
    act.slice(5).forEach(p => { p.scheduleAmPm = ['', '', '', '', '', '', '']; });
    // E: 配布の控え(_base)に D と E が乗っていて、いまの配置は D だけ(E は退所で外れた) → E は「外れた方」に出ないこと
    const carId = ((d.diarySettings || {}).cars || [])[0]?.id || 'car1';
    d.transportPlans[`${iso(t)}_AM`] = { cars: { [carId]: [{ pid: act[3].id, t: '8:30', mark: false }] }, walkers: [], others: [], un: [], driver: {}, _savedAt: Date.now(), _base: { cars: { [carId]: [{ pid: act[3].id, t: '8:30' }, { pid: act[4].id, t: '8:50' }] }, walkers: [], others: [], driver: {} }, _baseAt: Date.now() - 86400000 * 3, _baseId: 'chk' };
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiTpDriveAck', String(Date.now())); /* スマホの「運転中は見ないで」を出さない */ sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, t: Date.now(), ampm: 'AM' })); return { names, today: iso(t) }; });
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
  if (phone) { const am = page.locator('button', { hasText: /^AM$/ }).first(); if (await am.count()) { await am.click().catch(() => {}); await page.waitForTimeout(800); } } // スマホは午後に実行すると PM が選ばれる
  const txt = await page.evaluate(() => document.body.innerText);
  const has = (k) => txt.includes(S.names[k]);
  const tag = phone ? 'phone' : 'pc';
  r[`${tag}_A_hidden`] = !has('A'); r[`${tag}_B_hidden`] = !has('B'); r[`${tag}_C_shown`] = has('C'); r[`${tag}_D_shown`] = has('D'); r[`${tag}_E_hidden`] = !has('E'); r[`${tag}_noChg`] = !/運行表を出した後の変更|確定後の変更/.test(txt);
  await page.screenshot({ path: `/tmp/chk_1103tpresign_${tag}.png`, fullPage: true }).catch(() => {});
  if (!(has('C') && has('D'))) console.log(tag, '画面の文字(先頭):', txt.replace(/\s+/g, ' ').slice(0, 500));
  await page.context().close();
};
await run(false); await run(true);
await b.close();
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
