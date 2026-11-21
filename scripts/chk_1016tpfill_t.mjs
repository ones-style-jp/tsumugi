import { chromium } from 'playwright';
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
const dialogs = []; page.on('dialog', d => { dialogs.push(d.message().replace(/\n/g, ' | ')); d.accept(); }); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.route('**/api/route-plan', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ configured: false }) }));
const today = new Date(); const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; const iso = ymd(today);
await page.goto('http://localhost:4185/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const info = await page.evaluate((iso) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3'));
  d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), serviceTimeAM: '9:00～12:05', serviceTimePM: '13:20～16:25' };
  d.diarySettings.cars = [{ id: 'cS', name: 'シエンタ', type: '', cap: '5' }, { id: 'cK', name: 'タント', type: '', cap: '3' }, { id: 'cT', name: 'ステップ', type: '', cap: '7' }];
  const act = d.patients.filter(p => p.status === '利用中').slice(0, 6); act.forEach((p, i) => { p.scheduleAmPm = ['', 'AM', 'AM', 'AM', 'AM', 'AM', 'AM']; p.scheduleChangeHistory = []; p.pickupTimes = ['', '', '', '', '', '', '']; });
  d.patients.forEach(p => { if (!act.includes(p)) p.scheduleAmPm = ['', '', '', '', '', '', '']; });
  const base = new Date(iso); const dow = base.getDay(); const mon = new Date(base); mon.setDate(base.getDate() - ((dow + 6) % 7));
  const y = (dd) => `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, '0')}-${String(dd.getDate()).padStart(2, '0')}`;
  d.transportPlans = {};
  // 前の週: シエンタ 2名・タント 2名・ステップ 2名
  for (let k = 0; k < 6; k++) { const pd = new Date(mon); pd.setDate(mon.getDate() - 7 + k); d.transportPlans[`${y(pd)}_AM`] = { cars: { cS: [{ pid: act[0].id, t: '8:30' }, { pid: act[1].id, t: '8:40' }], cK: [{ pid: act[2].id, t: '8:35' }, { pid: act[3].id, t: '8:45' }], cT: [{ pid: act[4].id, t: '8:20' }, { pid: act[5].id, t: '8:50' }] }, walkers: [], others: [], un: [], driver: { cS: '見本 運転一', cK: '見本 運転二', cT: '見本 運転一' }, arrive: { cS: '8:58', cK: '9:05', cT: '8:59' }, _savedAt: Date.now() }; }
  // この週の今日: シエンタだけ作成中で変えてある(前の週と違う: act[0] と act[2] を乗せて時間も違う)。タント・ステップは空。act[1] は徒歩にした
  d.transportPlans[`${iso}_AM`] = { cars: { cS: [{ pid: act[2].id, t: '8:20' }, { pid: act[0].id, t: '8:33' }], cK: [], cT: [] }, walkers: [{ pid: act[1].id }], others: [], un: [{ pid: act[3].id }, { pid: act[4].id }, { pid: act[5].id }], driver: { cS: '見本 運転二' }, _savedAt: Date.now() };
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, t: Date.now() }));
  return { ids: act.map(p => p.id) }; }, iso);
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 400 }).catch(() => {});
const plan = (k) => page.evaluate((k) => { const pl = JSON.parse(localStorage.getItem('daycareAppData_v3')).transportPlans[k]; const f = (a) => (a || []).map(m => `${m.pid}@${m.t || ''}`).join(','); return pl ? { cS: f(pl.cars.cS), cK: f(pl.cars.cK), cT: f(pl.cars.cT), walk: f(pl.walkers), un: f(pl.un), drv: pl.driver, arrive: pl.arrive, auto: pl.arriveAuto } : null; }, k);
const ids = info.ids; const nm = (s) => ids.reduce((acc, id, i) => acc.split(id).join(`P${i}`), s);
console.log('before', nm(JSON.stringify(await plan(`${iso}_AM`))));
await page.getByTestId('tp-copy-prev').click(); await page.waitForTimeout(400);
console.log('ask text', (await page.getByTestId('tp-copy-ask').innerText()).replace(/\n/g, ' / ').slice(230, 420));
await page.getByTestId('tp-copy-fill').click(); await page.waitForTimeout(1200);
console.log('alert', (dialogs.at(-1) || '').slice(0, 160));
console.log('after ', nm(JSON.stringify(await plan(`${iso}_AM`))));
// 遅れの赤: タントの到着 9:05 (開始 9:00) → 赤、シエンタ 8:58 → 黄
const late = await page.evaluate((iso) => ({ cK: document.querySelector(`[data-testid="tp-arrive-${iso}-AM-cK"]`)?.getAttribute('data-late'), cKcls: /border-red-500/.test(document.querySelector(`[data-testid="tp-arrive-${iso}-AM-cK"]`)?.className || ''), cT: document.querySelector(`[data-testid="tp-arrive-${iso}-AM-cT"]`)?.getAttribute('data-late') }), iso);
console.log('late', JSON.stringify(late));
await page.locator(`[data-tpdrop="cK"][data-tpiso="${iso}"][data-tpslot="AM"]`).screenshot({ path: '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad/tplate.png' });
await b.close();
