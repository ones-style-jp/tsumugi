// 2026-10-25 試験版 trial400: 送迎表 ①確定ボタン・次週分未確定が無い ②「送り 表示/非表示」で送りの欄が隠れる ③到着の目安は黒字 ④スマホは「運転中は見ない」の注意(OKで消え、再読込でも30分は出ない)
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4173'; })();
const b = await chromium.launch(); const r = {};
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const now = new Date(); const mon = new Date(now); mon.setDate(now.getDate() + (now.getDay() === 0 ? -6 : 1 - now.getDay())); /* 表示中の週(月曜始まり) */ mon.setHours(0, 0, 0, 0); const key = `${iso(mon)}_AM`;
async function start(vw, prep) {
  const ctx = await b.newContext({ viewport: vw, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', hasTouch: vw.width < 700 }); const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
  const ids = await page.evaluate(([key, prep]) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.systemSettings = d.systemSettings || {}; const ps = (d.patients || []).filter(p => p.status === '利用中').slice(0, 3); ps.forEach(p => { p.scheduleAmPm = ['', 'AM', '', '', '', '', '']; p.pickupTimes = ['', '08:30', '', '', '', '', '']; p.startDate = '2020-01-01'; p.endDate = ''; });
    d.diarySettings = d.diarySettings || {}; d.diarySettings.cars = [{ id: 'car1', name: '1号車', type: '' }, { id: 'car2', name: '2号車', type: '' }]; d.transportPlans = d.transportPlans || {};
    d.transportPlans[key] = { cars: { car1: [{ pid: ps[0].id, t: '8:30', mark: false }, { pid: ps[1].id, t: '8:40', mark: false }], car2: [{ pid: ps[2].id, t: '8:40', mark: false }] }, walkers: [], others: [], un: [], memo: '', arrive: { car1: '8:50' }, arriveAuto: { car1: true }, _final: { cars: {} }, _finalAt: '2026-10-20 10:00', _savedAt: Date.now() };
    (new Function('d', prep || ''))(d); localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, t: Date.now() })); return ps.map(p => p.id); }, [key, prep]);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {}); return { page, ids }; }
// ① ② ③ パソコン
{ const { page, ids } = await start({ width: 1366, height: 900 }, "localStorage.removeItem('tsumugiTpDriveAck');");
  r.noFinalize = (await page.getByTestId('tp-finalize').count()) === 0 && (await page.getByTestId('tp-next-reminder').count()) === 0 && (await page.getByTestId('tp-chg-btn').count()) === 0;
  const ar = page.getByTestId(`tp-arrive-${iso(mon)}-AM-car1`); r.arriveBlack = (await ar.count()) === 1 && /text-slate-800/.test(await ar.getAttribute('class')) && (await ar.getAttribute('data-auto')) === '1';
  r.dropShownDefault = (await page.getByTestId(`tp-dropsame-${iso(mon)}-AM`).count()) === 1 && (await page.getByTestId(`tp-dat-${ids[0]}`).count()) >= 1;
  await page.getByTestId('tp-drop-toggle').click(); await page.waitForTimeout(900);
  r.dropHidden = (await page.getByTestId(`tp-dropsame-${iso(mon)}-AM`).count()) === 1 && (await page.getByTestId(`tp-dat-${ids[0]}`).count()) === 0 && /非表示/.test(await page.getByTestId('tp-drop-toggle').innerText()); /* trial401: 座席表(迎えと同じ)は残り、各人の「送」だけ消える */
  r.dropSaved = await page.evaluate(() => JSON.parse(localStorage.getItem('daycareAppData_v3')).systemSettings.tpDropShown === false);
  await page.getByTestId('tp-drop-toggle').click(); await page.waitForTimeout(600); r.dropBack = (await page.getByTestId(`tp-dat-${ids[0]}`).count()) >= 1;
  r.noNoticePc = (await page.getByTestId('tp-drive-notice').count()) === 0;
  await page.context().close(); }
// ④ スマホ
{ const { page } = await start({ width: 390, height: 844 }, "localStorage.removeItem('tsumugiTpDriveAck');");
  r.noticeShown = (await page.getByTestId('tp-drive-notice').count()) === 1; await page.getByTestId('tp-drive-ok').click(); await page.waitForTimeout(400);
  r.noticeGone = (await page.getByTestId('tp-drive-notice').count()) === 0;
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000); r.noticeSuppressed = (await page.getByTestId('tp-drive-notice').count()) === 0;
  await page.evaluate(() => localStorage.setItem('tsumugiTpDriveAck', String(Date.now() - 31 * 60 * 1000))); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000); r.noticeAgainAfter30 = (await page.getByTestId('tp-drive-notice').count()) === 1;
  await page.context().close(); }
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
