// 2026-10-27 試験版 trial431: 座席表の送りの出発 ①「出発の目安を入れる」が無い ②人を外すと(保存のたびに)目安の出発が人数に合わせて変わる ③手で決めた出発は変わらない
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4173'; })();
const b = await chromium.launch(); const r = {};
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const day = new Date(); day.setDate(day.getDate() + 1); if (day.getDay() === 0) day.setDate(day.getDate() + 1); const iso = isoOf(day);
const page = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.addInitScript(() => { try { localStorage.setItem('tsumugiTpDriveAck', String(Date.now())); } catch {} });
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
const ids = await page.evaluate((iso) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.systemSettings = d.systemSettings || {}; d.systemSettings.tpDropShown = true; d.diarySettings.cars = [{ id: 'c1', name: '1号車', type: '', cap: '6' }, { id: 'c2', name: '2号車', type: '', cap: '6' }];
  const act = d.patients.filter(p => p.status === '利用中' && p.address).slice(0, 4); const dow = new Date(iso + 'T00:00:00').getDay(); act.forEach((p, i) => { p.scheduleAmPm = ['', '', '', '', '', '', '']; p.scheduleAmPm[dow] = 'AM'; p.pickupMinutes = 5; });
  d.transportPlans = { [`${iso}_AM`]: { cars: { c1: act.slice(0, 3).map((p, i) => ({ pid: p.id, t: `8:${30 + i * 5}` })), c2: [{ pid: act[3].id, t: '8:50' }] }, walkers: [], others: [], un: [], dropMode: 'custom',
    drop: { cars: { c1: act.slice(0, 3).map((p, i) => ({ pid: p.id, seat: i })), c2: [{ pid: act[3].id, seat: 0 }] }, walkers: [], others: [], depart: { c2: '12:45' }, departAuto: {} }, _savedAt: Date.now() } };
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0');
  sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, date: iso, ampm: 'AM', t: Date.now() })); return act.map(p => p.id); }, iso);
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2200); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
const plan = () => page.evaluate((iso) => JSON.parse(localStorage.getItem('daycareAppData_v3')).transportPlans[`${iso}_AM`], iso);
await page.getByTestId(`tp-seatbtn-${iso}-AM`).first().click(); await page.waitForTimeout(800);
r.noEstButton = (await page.getByTestId('tp-seat-depart-est').count()) === 0;
const shown0 = await page.getByTestId('tp-seat-depart-c1').innerText();
// 名前を長押しして「徒歩」へ運ぶ(1号車の人数が減る) → 保存 → 目安が入れ直される
const dragOut = async () => { const src = page.locator('[data-testid="tp-seatcar-c1"] [data-tpdrag="1"]').first();
  const sb = await src.boundingBox(); const tb = await page.locator('[data-tpdrop="d:walk"]').first().boundingBox();
  await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2); await page.mouse.down(); await page.waitForTimeout(500);
  await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, { steps: 12 }); await page.waitForTimeout(200); await page.mouse.up(); await page.waitForTimeout(900); };
await dragOut();
const p1 = await plan(); const dep1 = (p1.drop.depart || {}).c1; const au1 = !!(p1.drop.departAuto || {}).c1; const n1 = (p1.drop.cars.c1 || []).length;
const shown1 = await page.getByTestId('tp-seat-depart-c1').innerText();
r.moved = n1 === 2; r.autoSaved = !!dep1 && au1; r.shownFollows = shown1.replace('頃', '') === dep1 && shown0 !== shown1; if (!r.moved || !r.autoSaved || !r.shownFollows) console.log('C1', n1, shown0, shown1, dep1, au1);
await dragOut();
const p2 = await plan(); const dep2 = (p2.drop.depart || {}).c1; const mm = (v) => { const m = String(v || '').match(/(\d+):(\d+)/); return m ? (+m[1]) * 60 + (+m[2]) : NaN; };
r.earlierWithFewer = (p2.drop.cars.c1 || []).length === 1 && mm(dep2) < mm(dep1); if (!r.earlierWithFewer) console.log('DEP', dep1, dep2, (p2.drop.cars.c1 || []).length);
// 手で決めた 2号車(12:45)はそのまま
r.manualKept = ((await plan()).drop.depart || {}).c2 === '12:45' && !((await plan()).drop.departAuto || {}).c2;
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close(); void ids;
