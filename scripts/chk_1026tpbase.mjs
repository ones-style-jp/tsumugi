// 2026-10-26 試験版 trial415: 送迎表 ①運行表を出すと配布の控え(_base)が残る ②その後に時間を変えると「変更 1件」と赤枠(運行表)・一覧に出る ③出す前は赤枠なし
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4173'; })();
const b = await chromium.launch(); const r = {};
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const now = new Date(); const mon = new Date(now); mon.setDate(now.getDate() + (now.getDay() === 0 ? -6 : 1 - now.getDay())); mon.setHours(0, 0, 0, 0); const key = `${iso(mon)}_AM`;
async function start(prep) {
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
  const ids = await page.evaluate(([key, prep]) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.systemSettings = d.systemSettings || {}; const ps = (d.patients || []).filter(p => p.status === '利用中' && p.address).slice(0, 3); ps.forEach(p => { p.schedule = p.schedule || {}; });
    d.diarySettings = d.diarySettings || {}; d.diarySettings.cars = [{ id: 'car1', name: '1号車', type: '' }, { id: 'car2', name: '2号車', type: '' }]; d.transportPlans = d.transportPlans || {};
    const dow = new Date(key.slice(0, 10) + 'T00:00:00').getDay(); ps.forEach((p) => { p.scheduleAmPm = ['', '', '', '', '', '', '']; p.scheduleAmPm[dow] = 'AM'; p.pickupMinutes = 2; });
    d.transportPlans[key] = { cars: { car1: [{ pid: ps[0].id, t: '8:30', mark: false }, { pid: ps[1].id, t: '8:40', mark: false }], car2: [{ pid: ps[2].id, t: '8:40', mark: false }] }, walkers: [], others: [], un: [], memo: '', arrive: { car1: '8:50' }, driver: { car1: '', car2: '' },
      dropMode: 'custom', drop: { cars: { car1: [{ pid: ps[0].id, seat: 0 }, { pid: ps[1].id, seat: 1 }], car2: [{ pid: ps[2].id, seat: 0 }] }, walkers: [], others: [], depart: { car1: '12:10' } }, dropAt: { [ps[0].id]: '12:20' }, dropAtAuto: { [ps[0].id]: true }, _savedAt: Date.now() };
    (new Function('d', prep || ''))(d); localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); localStorage.setItem('tsumugiTpDriveAck', String(Date.now())); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, date: key.slice(0, 10), ampm: 'AM', t: Date.now() })); return ps.map(p => p.id); }, [key, prep]);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
  await page.evaluate(() => { window.__ph = []; window.addEventListener('setPrintHtml', e => { window.__ph.push(e.detail); }); });
  return { page, ids }; }
const openSeat = async (page) => { await page.getByTestId(`tp-seatbtn-${iso(mon)}-AM`).first().click().catch(async () => { await page.getByTestId(`tp-fb-seatbtn-${iso(mon)}-AM`).first().click(); }); await page.waitForTimeout(900); };
const dailyHtml = async (page) => { await page.locator('button:visible', { hasText: /^ダウンロード$/ }).first().click(); await page.waitForTimeout(500); await page.locator('button', { hasText: /日ごと（A4横/ }).click(); await page.waitForTimeout(300); await page.locator('button:visible', { hasText: /^ダウンロード$/ }).last().click(); await page.waitForTimeout(1500); const ph = await page.evaluate(() => window.__ph); const d0 = ph.find(x => /運行表_/.test(x.title)); return d0 ? d0.html : ''; };
{ const { page, ids } = await start("d.systemSettings.tpDropShown = true;");
  r.noChgBefore = (await page.getByTestId('tp-chg-btn').count()) === 0;
  const h0 = await dailyHtml(page); r.noRedBefore = !/outline:2px solid #c82c35/.test(h0);
  await page.waitForTimeout(800);
  const pl = await page.evaluate((key) => JSON.parse(localStorage.getItem('daycareAppData_v3')).transportPlans[key], key);
  r.baseStamped = !!(pl && pl._base && pl._baseAt && pl._base.cars && pl._base.cars.car1);
  // 配布後に 1人目の時間を変える(控えを直接書き換えて読み直す)
  await page.evaluate((key) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.transportPlans[key].cars.car1[0].t = '8:45'; d.transportPlans[key]._savedAt = Date.now(); localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); }, key);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
  await page.evaluate(() => { window.__ph = []; window.addEventListener('setPrintHtml', e => { window.__ph.push(e.detail); }); });
  const btn = page.getByTestId('tp-chg-btn'); r.chgBtn = (await btn.count()) === 1 && /変更 1件/.test(await btn.innerText());
  await btn.click(); await page.waitForTimeout(400); const panel = page.getByTestId('tp-chg-panel'); r.panel = (await panel.count()) === 1 && /運行表を出した後の変更/.test(await panel.innerText()) && /時間/.test(await panel.innerText()); await page.keyboard.press('Escape'); await page.locator('.fixed.inset-0').last().click({ position: { x: 5, y: 5 } }).catch(() => {}); await page.waitForTimeout(300);
  const h1 = await dailyHtml(page); r.redAfter = /outline:2px solid #c82c35/.test(h1) && />8:45</.test(h1);
  await page.context().close(); void ids; }
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
