import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--lang=ja-JP'] }); const page = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
const dialogs = []; page.on('dialog', d => { dialogs.push(d.message().replace(/\n/g, ' | ')); d.accept(); }); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
let routeCalls = 0;
await page.route('**/api/route-plan', async (route) => { const rq = route.request(); if (rq.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ configured: true }) }); routeCalls++; const bd = JSON.parse(rq.postData() || '{}'); const n = (bd.stops || []).length; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ order: [...Array(n).keys()], legSeconds: Array(n + 1).fill(420), stopCoords: (bd.stops || []).map(() => ({ lat: 35.6, lng: 139.7 })), originCoord: { lat: 35.6, lng: 139.7 } }) }); });
const today = new Date(); const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; const iso = ymd(today);
await page.goto('http://localhost:4185/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const info = await page.evaluate((iso) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3'));
  d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), address: '東京都江東区見本町9-9', serviceTimeAM: '9:00～12:05', serviceTimePM: '13:20～16:25' };
  d.diarySettings.cars = [{ id: 'cS', name: 'シエンタ', type: '', cap: '5' }, { id: 'cK', name: 'タント', type: '', cap: '3' }];
  const act = d.patients.filter(p => p.status === '利用中').slice(0, 4); act.forEach((p, i) => { p.scheduleAmPm = ['', 'AM', 'AM', 'AM', 'AM', 'AM', 'AM']; p.scheduleChangeHistory = []; p.pickupTimes = ['', '', '', '', '', '', '']; p.address = `東京都江東区見本町1-${i + 1}`; p.pickupMinutes = i === 2 ? '3' : ''; });
  d.patients.forEach(p => { if (!act.includes(p)) p.scheduleAmPm = ['', '', '', '', '', '', '']; });
  const base = new Date(iso); const dow = base.getDay(); const mon = new Date(base); mon.setDate(base.getDate() - ((dow + 6) % 7));
  const y = (dd) => `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, '0')}-${String(dd.getDate()).padStart(2, '0')}`;
  d.transportPlans = {};
  for (let k = 0; k < 6; k++) { const pd = new Date(mon); pd.setDate(mon.getDate() - 7 + k); d.transportPlans[`${y(pd)}_AM`] = { cars: { cS: [{ pid: act[0].id, t: '8:30' }, { pid: act[1].id, t: '8:40' }], cK: [{ pid: act[2].id, t: '8:35' }] }, walkers: [], others: [], un: [], driver: { cS: '見本 運転一' }, _savedAt: Date.now() }; }
  // この週の「今日」の午前はすでに直してある(順番を入れ替え・時間も変えた)
  d.transportPlans[`${iso}_AM`] = { cars: { cS: [{ pid: act[1].id, t: '8:25' }, { pid: act[0].id, t: '8:33' }], cK: [{ pid: act[2].id, t: '8:35' }, { pid: act[3].id, t: '8時　分' }] }, walkers: [], others: [], un: [], driver: { cS: '見本 運転二' }, _savedAt: Date.now() };
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, t: Date.now() }));
  return { ids: act.map(p => p.id), names: act.map(p => p.name) }; }, iso);
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 400 }).catch(() => {});
const plan = (k) => page.evaluate((k) => { const pl = JSON.parse(localStorage.getItem('daycareAppData_v3')).transportPlans[k]; return pl ? { cS: (pl.cars.cS || []).map(m => `${m.pid}@${m.t}`).join(','), cK: (pl.cars.cK || []).map(m => `${m.pid}@${m.t}`).join(','), drv: (pl.driver || {}).cS, arrive: pl.arrive, auto: pl.arriveAuto, facLeg: pl.facLeg } : null; }, k);
// ① 前週コピー
await page.getByTestId('tp-copy-prev').click(); await page.waitForTimeout(400);
console.log('ask', (await page.getByTestId('tp-copy-ask').innerText()).replace(/\n/g, ' / ').slice(0, 220));
await page.getByTestId('tp-copy-fill').click(); await page.waitForTimeout(1200);
console.log('alert', (dialogs.at(-1) || '').slice(0, 120));
console.log('today AM kept', JSON.stringify(await plan(`${iso}_AM`)));
const other = await page.evaluate((iso) => Object.keys(JSON.parse(localStorage.getItem('daycareAppData_v3')).transportPlans).filter(k => k >= iso.slice(0, 8) && k !== `${iso}_AM`).length, iso);
console.log('slots now', other);
// ② 到着の目安: 今日の午前、シエンタの最後(8:33)の時間を 8:41 に
const tin = page.locator(`[data-tpdrop="cS"][data-tpiso="${iso}"][data-tpslot="AM"]`).getByTestId(`tp-time-${info.ids[0]}`);
await tin.fill('841'); await tin.press('Tab'); await page.waitForTimeout(1500);
console.log('after time edit', JSON.stringify(await plan(`${iso}_AM`)), '| route calls', routeCalls);
console.log('arrive btn', await page.getByTestId(`tp-arrive-${iso}-AM-cS`).innerText().catch(() => '-'), 'auto', await page.getByTestId(`tp-arrive-${iso}-AM-cS`).getAttribute('data-auto').catch(() => '-'));
// 手で到着を決める → 時間を変えても到着はそのまま
await page.getByTestId(`tp-arrive-${iso}-AM-cS`).click(); await page.waitForTimeout(300); await page.keyboard.type('855'); await page.keyboard.press('Enter'); await page.waitForTimeout(600);
await tin.fill('843'); await tin.press('Tab'); await page.waitForTimeout(1000);
console.log('manual kept', JSON.stringify((await plan(`${iso}_AM`)).arrive), JSON.stringify((await plan(`${iso}_AM`)).auto));
// ③ 未割当(8:--)の方をタントへ入れて時間を打つ
const t4 = page.locator(`[data-tpdrop="cK"][data-tpiso="${iso}"][data-tpslot="AM"]`).getByTestId(`tp-time-${info.ids[3]}`);
console.log('dash value before focus', await t4.inputValue());
await t4.focus(); await page.waitForTimeout(200);
console.log('on focus value', JSON.stringify(await t4.inputValue()), 'placeholder', await t4.getAttribute('placeholder'));
await t4.blur(); await page.waitForTimeout(400); console.log('blur without typing →', await t4.inputValue());
await t4.focus(); await page.keyboard.type('845'); await t4.blur(); await page.waitForTimeout(1200);
console.log('typed 845 →', await t4.inputValue(), '| plan cK', (await plan(`${iso}_AM`)).cK);
await b.close();
