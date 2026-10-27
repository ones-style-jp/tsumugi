import { chromium } from 'playwright';
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
const dialogs = []; page.on('dialog', d => { dialogs.push(d.message().replace(/\n/g, ' | ')); d.accept(); }); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.route('**/api/route-plan', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ configured: false }) }));
const today = new Date(); const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; const iso = ymd(today);
await page.goto('http://localhost:4185/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const info = await page.evaluate((iso) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3'));
  d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), serviceTimeAM: '9:00～12:05', serviceTimePM: '13:20～16:25' };
  d.diarySettings.cars = [{ id: 'cS', name: 'シエンタ', type: '', cap: '5' }, { id: 'cK', name: 'タント', type: '', cap: '3' }];
  const act = d.patients.filter(p => p.status === '利用中').slice(0, 5); act.forEach((p, i) => { p.scheduleAmPm = ['', 'AM', 'AM', 'AM', 'AM', 'AM', 'AM']; p.scheduleChangeHistory = []; p.pickupTimes = ['', '', '', '', '', '', '']; });
  d.patients.forEach(p => { if (!act.includes(p)) p.scheduleAmPm = ['', '', '', '', '', '', '']; });
  const base = new Date(iso); const dow = base.getDay(); const mon = new Date(base); mon.setDate(base.getDate() - ((dow + 6) % 7));
  const y = (dd) => `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, '0')}-${String(dd.getDate()).padStart(2, '0')}`;
  d.transportPlans = {};
  // 前の週: act3・act4 は休みで乗っていない(前の週は act0〜2 だけ)
  for (let k = 0; k < 6; k++) { const pd = new Date(mon); pd.setDate(mon.getDate() - 7 + k); d.transportPlans[`${y(pd)}_AM`] = { cars: { cS: [{ pid: act[0].id, t: '8:30' }, { pid: act[1].id, t: '8:40' }], cK: [{ pid: act[2].id, t: '8:35' }] }, walkers: [], others: [], un: [], driver: { cS: '見本 運転一' }, _savedAt: Date.now() }; }
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, t: Date.now() }));
  return { ids: act.map(p => p.id) }; }, iso);
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 400 }).catch(() => {});
const ids = info.ids; const nm = (s) => { let o = s; ids.forEach((id, i) => { o = o.split(String(id)).join(`P${i}`); }); return o; };
const plan = () => page.evaluate((k) => { const pl = JSON.parse(localStorage.getItem('daycareAppData_v3')).transportPlans[k]; const f = (a) => (a || []).map(m => `${m.pid}@${m.t || ''}`).join(','); return pl ? { cS: f(pl.cars.cS), cK: f(pl.cars.cK), un: f(pl.un), drv: pl.driver } : null; }, `${iso}_AM`);
// ① 前週コピー(全部) → 今日は act3・act4 が未割当
await page.getByTestId('tp-copy-prev').click(); await page.waitForTimeout(400); await page.getByTestId('tp-copy-all').click(); await page.waitForTimeout(1200);
console.log('1 copied', nm(JSON.stringify(await plan())));
// ② 未割当の act3 をシエンタへ・act4 をタントへ(保存データを直接・画面操作のドラッグの代わり) → 画面を更新
await page.evaluate(([iso, ids]) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const pl = d.transportPlans[`${iso}_AM`]; pl.cars.cS.push({ pid: ids[3], t: '8:50' }); pl.cars.cK.push({ pid: ids[4], t: '8:45' }); pl.un = []; pl._savedAt = Date.now(); localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, t: Date.now() })); }, [iso, ids]);
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 400 }).catch(() => {});
console.log('2 placed', nm(JSON.stringify(await plan())));
// ③ もう一度 前週コピー(見比べて写す) → act3・act4 は車のまま
await page.getByTestId('tp-copy-prev').click(); await page.waitForTimeout(400);
console.log('ask', (await page.getByTestId('tp-copy-fill').innerText()).replace(/\n/g, ' / ').slice(0, 120));
await page.getByTestId('tp-copy-fill').click(); await page.waitForTimeout(1200);
console.log('alert', (dialogs.at(-1) || '').slice(0, 140));
console.log('3 after ', nm(JSON.stringify(await plan())));
// ④ act1 を未割当に戻してから 見比べて写す → act1 だけ前の週の車(シエンタ 8:40)へ戻る・ほかはそのまま
await page.evaluate(([iso, ids]) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const pl = d.transportPlans[`${iso}_AM`]; pl.cars.cS = pl.cars.cS.filter(m => m.pid !== ids[1]); pl.un = [{ pid: ids[1] }]; pl._savedAt = Date.now(); localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, t: Date.now() })); }, [iso, ids]);
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 400 }).catch(() => {});
await page.getByTestId('tp-copy-prev').click(); await page.waitForTimeout(400); await page.getByTestId('tp-copy-fill').click(); await page.waitForTimeout(1200);
console.log('4 refill', nm(JSON.stringify(await plan())), '|', (dialogs.at(-1) || '').slice(14, 110));
await b.close();
