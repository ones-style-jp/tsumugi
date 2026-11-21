import { chromium } from 'playwright';
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
const dialogs = []; page.on('dialog', d => { dialogs.push(d.message().replace(/\n/g, ' | ')); d.accept(); }); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.route('**/api/route-plan', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ configured: false }) }));
const today = new Date(); const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; const iso = ymd(today);
const prev = new Date(today); prev.setDate(today.getDate() - 7); const pisoK = `${ymd(prev)}_AM`;
await page.goto('http://localhost:4185/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const info = await page.evaluate((iso) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3'));
  d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), serviceTimeAM: '9:00～12:05', serviceTimePM: '13:20～16:25' };
  d.diarySettings.cars = [{ id: 'cS', name: 'シエンタ', type: '', cap: '5' }, { id: 'cK', name: 'タント', type: '', cap: '3' }];
  const act = d.patients.filter(p => p.status === '利用中').slice(0, 5); act.forEach((p) => { p.scheduleAmPm = ['', 'AM', 'AM', 'AM', 'AM', 'AM', 'AM']; p.scheduleChangeHistory = []; p.pickupTimes = ['', '', '', '', '', '', '']; });
  d.patients.forEach(p => { if (!act.includes(p)) p.scheduleAmPm = ['', '', '', '', '', '', '']; });
  const base = new Date(iso); const dow = base.getDay(); const mon = new Date(base); mon.setDate(base.getDate() - ((dow + 6) % 7));
  const y = (dd) => `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, '0')}-${String(dd.getDate()).padStart(2, '0')}`;
  d.transportPlans = {};
  for (let k = 0; k < 6; k++) { const pd = new Date(mon); pd.setDate(mon.getDate() - 7 + k); d.transportPlans[`${y(pd)}_AM`] = { cars: { cS: [{ pid: act[0].id, t: '8:30' }, { pid: act[1].id, t: '8:40' }], cK: [{ pid: act[2].id, t: '8:35' }] }, walkers: [], others: [], un: [], driver: { cS: '見本 運転一' }, arrive: { cS: '8:50' }, _savedAt: Date.now() }; }
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, t: Date.now() }));
  return { ids: act.map(p => String(p.id)) }; }, iso);
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 400 }).catch(() => {});
const ids = info.ids; const nm = (o) => JSON.stringify(o, (k, v) => typeof v === 'string' ? ids.reduce((acc, id, i) => acc.split(`${id}@`).join(`P${i}@`), v) : v);
const plan = () => page.evaluate((k) => { const pl = JSON.parse(localStorage.getItem('daycareAppData_v3')).transportPlans[k]; const f = (a) => (a || []).map(m => `${m.pid}@${m.t || ''}`).join(','); return pl ? { cS: f(pl.cars.cS), cK: f(pl.cars.cK), un: f(pl.un), drv: pl.driver, arrive: pl.arrive, hasBase: !!pl._copyBase } : null; }, `${iso}_AM`);
const reloadTp = async () => { await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, t: Date.now() }))); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 400 }).catch(() => {}); };
const doCopy = async (which) => { await page.getByTestId('tp-copy-prev').click(); await page.waitForTimeout(400); await page.getByTestId(which).click(); await page.waitForTimeout(1200); return (dialogs.at(-1) || '').slice(0, 170); };
// ① 全部上書き → 控え(_copyBase)付き
console.log('1', await doCopy('tp-copy-all')); console.log('   ', nm(await plan()));
// ② この週で直す: act3 をシエンタへ(8:50)、act4 をタントへ、シエンタの運転者を 運転二、到着を 8:55(手入力)、act1 の時間を 8:42 に
await page.evaluate(([iso, ids]) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const pl = d.transportPlans[`${iso}_AM`]; pl.cars.cS.push({ pid: ids[3], t: '8:50' }); pl.cars.cK.push({ pid: ids[4], t: '8:45' }); pl.cars.cS.find(m => String(m.pid) === ids[1]).t = '8:42'; pl.driver.cS = '見本 運転二'; pl.arrive = { cS: '8:55' }; pl.arriveAuto = {}; pl.un = []; pl._savedAt = Date.now(); localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); }, [iso, ids]);
// ③ 前の週で直す: act0 の時間 8:30→8:32、act2 をタント→シエンタへ、タントの運転者を 運転一 に、到着 8:50→8:52
await page.evaluate(([pk, ids]) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const pl = d.transportPlans[pk]; pl.cars.cS.find(m => String(m.pid) === ids[0]).t = '8:32'; const m2 = pl.cars.cK.shift(); pl.cars.cS.push({ ...m2, t: '8:36' }); pl.driver.cK = '見本 運転一'; pl.arrive.cS = '8:52'; pl._savedAt = Date.now(); localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); }, [pisoK, ids]);
await reloadTp(); console.log('2 edited', nm(await plan()));
// ④ 前の週に合わせる
console.log('3', await doCopy('tp-copy-fill')); console.log('   ', nm(await plan()));
// 期待: act3 シエンタ 8:50 のまま・act4 タントのまま・act1 8:42 のまま・運転者 cS=運転二 のまま・到着 cS=8:55 のまま(この週で直した)
//       act0 8:32 に(前の週で直した)・act2 シエンタ 8:36 へ(前の週で直した)・タント運転者 運転一(この週は空)
// ⑤ もう一度 → 変わるものなし
console.log('4', await doCopy('tp-copy-fill'));
await b.close();
