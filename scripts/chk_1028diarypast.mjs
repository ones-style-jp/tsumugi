// 2026-10-28 ユーザー報告「10月22日の午前と午後の送迎が日誌に反映されていない。送迎表には入っている」
//   自動の反映は 10/26 以降の日誌だけ(10/26 の事故の対策)。それより前の日誌に「送迎表から入れる」を付けた
//   10/22 午前: 送迎表=1号車に A・B(到着 8:57)。日誌=2号車に X の印(手で付けた・送迎表にいない方)
//   ①開いただけでは入らない(過去の日誌に触れない) ②「送迎表から入れる」がある ③押す→保存: A・B が1号車・到着 08:57・X の印は残る
//   ④10/26 以降の日誌(自動の日)には「送迎表から入れる」は出ない
//   実行: node scripts/chk_1028diarypast.mjs [--port 4175]
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4175'; })();
const D = '2026-10-22', D2 = '2026-10-27';
const b = await chromium.launch(); const r = {};
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage();
const dialogs = []; page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const info = await page.evaluate(([D, D2]) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3'));
  d.systemSettings = d.systemSettings || {}; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [0] }; d.holidays = []; d.systemSettings.transportEnabled = true;
  d.diarySettings = d.diarySettings || {}; d.diarySettings.cars = [{ id: 'c1', name: '1号車', type: '', cap: '8' }, { id: 'c2', name: '2号車', type: '', cap: '8' }];
  const ps = d.patients.filter(p => p.status === '利用中' && !p.endDate).slice(0, 3); if (ps.length < 3) return null; const [A, B, X] = ps;
  ps.forEach(p => { p.scheduleAmPm = ['', 'AM', 'AM', 'AM', 'AM', 'AM', 'AM']; p.scheduleChangeHistory = []; p.pauseHistory = []; if (p.startDate && p.startDate > '2026-10-01') p.startDate = '2026-10-01'; });
  const plan = { cars: { c1: [{ pid: A.id, t: '8:30' }, { pid: B.id, t: '8:40' }] }, walkers: [], others: [], un: [], arrive: { c1: '8:57' }, arriveAuto: {}, _savedAt: Date.now() };
  d.transportPlans = { [`${D}_AM`]: plan, [`${D2}_AM`]: { ...plan, _savedAt: Date.now() } };
  d.diaryLogs = d.diaryLogs || {}; d.diaryLogs[`${D}_AM`] = { pick: { [`${X.id}_c2`]: true }, drop: { [`${X.id}_c2`]: true }, carTimes: {}, _savedAt: Date.now() - 86400000 };
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0');
  sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'diary', pid: null, date: D, ampm: 'AM', t: Date.now() }));
  return { A: A.id, B: B.id, X: X.id }; }, [D, D2]);
r.seed = !!info; if (!info) { console.log('NO SEED'); process.exit(1); }
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2200); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
const src0 = await page.getByTestId('diary-tp-src').innerText().catch(() => ''); console.log('印(開いたとき):', JSON.stringify(src0));
const btn = page.getByTestId('diary-tp-resync'); r.btnShown = (await btn.count()) > 0 && (await btn.innerText()).trim() === '送迎表から入れる';
r.notAuto = !/送迎表から自動/.test(src0);
if (r.btnShown) { await btn.click(); await page.waitForTimeout(600); await page.locator('button:visible', { hasText: /^保存$/ }).first().click(); await page.waitForTimeout(1500); }
console.log('確認:', dialogs.map(x => x.slice(0, 40)));
const lg = await page.evaluate((D) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); return (d.diaryLogs || {})[`${D}_AM`] || {}; }, D);
console.log('保存後', JSON.stringify({ pick: lg.pick, carTimes: lg.carTimes, src: lg._tpSrc }));
r.imported = !!(lg.pick || {})[`${info.A}_c1`] && !!(lg.pick || {})[`${info.B}_c1`] && ((lg.carTimes || {}).c1 || {}).arrive === '08:57';
r.keptManual = !!(lg.pick || {})[`${info.X}_c2`];
// ④ 10/26 以降(自動の日)
await page.evaluate((D2) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'diary', pid: null, date: D2, ampm: 'AM', t: Date.now() })), D2);
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2200);
const src2 = await page.getByTestId('diary-tp-src').innerText().catch(() => ''); console.log('印(10/27):', JSON.stringify(src2));
r.autoDayNoBtn = (await page.getByTestId('diary-tp-resync').count()) === 0 && /送迎表から自動/.test(src2);
await b.close();
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
