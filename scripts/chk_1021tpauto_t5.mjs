// 2026-10-21 送迎表の自動計算(試験版): 計算するもの = 配車・お迎えの時間・到着の時間・送りの時間 の4つ(最初は お迎え・到着・送り)
//  到着だけ → 到着の目安が入る・お迎えの時間は変わらない・手で決めた到着はそのまま・送りは入らない
//  送りだけ → 送りの時間(目安)が入る・お迎えの時間と到着は変わらない
//  ダウンロード「名前の右に時間」: 送りの時間がまだ無い週でも送りの欄が出る(不具合修正)
import { chromium } from 'playwright';
const b = await chromium.launch(); const r = {};
const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage();
const alerts = []; page.on('dialog', d => { alerts.push(d.message().replace(/\n/g, ' | ')); d.accept(); }); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.route('**/api/route-plan', async (route) => { if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ configured: true }) }); const body = JSON.parse(route.request().postData() || '{}'); const n = (body.stops || []).length; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ order: [...Array(n).keys()], legSeconds: Array.from({ length: n + 1 }, (_, i) => [600, 300, 420, 900, 300, 360][i % 6]) }) }); });
await page.goto('http://localhost:4175/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const mon = new Date(); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7)); const iso = `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`;
const seed = () => page.evaluate((iso) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.systemSettings = d.systemSettings || {}; d.systemSettings.transportEnabled = true;
  const fi = d.systemSettings.facilityInfo = d.systemSettings.facilityInfo || {}; fi.serviceTimeAM = fi.serviceTimeAM || '9:00～12:05'; fi.address = fi.address || '東京都江東区見本町1-1-1';
  d.diarySettings.cars = [{ id: 'c1', name: '1号車', type: '', cap: '6' }, { id: 'c2', name: '2号車', type: '', cap: '6' }];
  const act = d.patients.filter(p => p.status === '利用中' && p.address).slice(0, 5); act.forEach(p => { p.pickupMinutes = 2; });
  const P = { cars: { c1: act.slice(0, 3).map((p, i) => ({ pid: p.id, t: `8:${20 + i * 8}` })), c2: act.slice(3, 5).map((p, i) => ({ pid: p.id, t: `8:${30 + i * 9}` })) }, walkers: [], others: [], un: [], driver: {}, arrive: { c2: '8:58' }, arriveAuto: {}, _savedAt: Date.now() };
  d.transportPlans = { [`${iso}_AM`]: P }; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); return act.map(p => p.id); }, iso);
const plan = () => page.evaluate((iso) => JSON.parse(localStorage.getItem('daycareAppData_v3')).transportPlans[`${iso}_AM`], iso);
const goTp = async () => { await page.evaluate((iso) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, date: iso, ampm: 'AM', t: Date.now() })), iso); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 600 }).catch(() => {}); };
const ids = await seed(); await goTp();
// ダウンロード「名前の右に時間」: 送りの時間が無い週でも「送り」の欄
{ await page.evaluate(() => { window.__ph = ''; window.addEventListener('setPrintHtml', e => { window.__ph = (e.detail && e.detail.html) || ''; }, { once: true }); });
  await page.locator('button:visible', { hasText: /^ダウンロード$/ }).first().click(); await page.waitForTimeout(400); await page.getByTestId('tp-print-drop-col').check(); await page.locator('button:visible', { hasText: /^ダウンロード$/ }).last().click(); await page.waitForTimeout(1500);
  const ph = await page.evaluate(() => window.__ph); r.colHasSend = ph.includes('>送り</td>'); await page.keyboard.press('Escape').catch(() => {}); await page.locator('button:visible', { hasText: /^(閉じる|×|✕)$/ }).last().click().catch(() => {}); await page.waitForTimeout(400); }
// 自動計算の画面: 4つの項目と最初の選び方
const openAc = async () => { await page.getByTestId('tp-autocalc').click(); await page.waitForTimeout(400); const days = page.locator('[data-testid="ac-days"] button'); const n = await days.count(); for (let i = 0; i < n; i++) { const t = await days.nth(i).innerText(); if (!t.includes(`${mon.getMonth() + 1}/${mon.getDate()}（`)) await days.nth(i).click(); } await page.locator('button:visible', { hasText: /^午後$/ }).first().click(); };
const setCk = async (tid, on) => { const c = page.getByTestId(tid); if ((await c.isChecked()) !== on) await c.click(); };
await openAc();
r.defaults = !(await page.getByTestId('ac-haisha').isChecked()) && await page.getByTestId('ac-jikan').isChecked() && await page.getByTestId('ac-arrivecalc').isChecked() && await page.getByTestId('ac-drop').isChecked();
await setCk('ac-jikan', false); await setCk('ac-drop', false); await setCk('ac-arrivecalc', true);
const before = await plan(); const tBefore = JSON.stringify(before.cars);
await page.locator('button:visible', { hasText: /^計算する$/ }).click(); await page.waitForTimeout(3000);
{ const p1 = await plan(); console.log('arrive only', JSON.stringify({ arrive: p1.arrive, au: p1.arriveAuto, drop: p1.dropAt }), alerts.at(-1));
  r.arriveSet = !!(p1.arrive && p1.arrive.c1) && !!(p1.arriveAuto && p1.arriveAuto.c1); r.manualKept = p1.arrive && p1.arrive.c2 === '8:58' && !(p1.arriveAuto || {}).c2;
  r.pickupSame1 = JSON.stringify(p1.cars) === tBefore; r.noDrop1 = !p1.dropAt || !Object.keys(p1.dropAt).length; r.alert1 = /到着の自動計算が終わりました/.test(alerts.at(-1) || ''); }
const arr1 = JSON.stringify((await plan()).arrive);
await openAc(); await setCk('ac-jikan', false); await setCk('ac-arrivecalc', false); await setCk('ac-drop', true);
await page.locator('button:visible', { hasText: /^計算する$/ }).click(); await page.waitForTimeout(3000);
{ const p2 = await plan(); console.log('drop only', JSON.stringify({ drop: p2.dropAt, au: p2.dropAtAuto }), alerts.at(-1));
  r.dropSet = !!p2.dropAt && ids.every(id => p2.dropAt[String(id)]) && ids.every(id => (p2.dropAtAuto || {})[String(id)]); r.pickupSame2 = JSON.stringify(p2.cars) === tBefore; r.arriveSame2 = JSON.stringify(p2.arrive) === arr1; r.alert2 = /送りの自動計算が終わりました/.test(alerts.at(-1) || '') && /送りの時間 5名/.test(alerts.at(-1) || ''); }
// 何も選ばないと計算しない
await openAc(); await setCk('ac-jikan', false); await setCk('ac-arrivecalc', false); await setCk('ac-drop', false); await page.locator('button:visible', { hasText: /^計算する$/ }).click(); await page.waitForTimeout(500);
r.noneAlert = /計算するものを1つ以上選んでください/.test(alerts.at(-1) || ''); await page.locator('button:visible', { hasText: /^やめる$/ }).click().catch(() => {});
console.log(r, Object.values(r).every(v => v === true) ? 'PASS' : 'FAIL'); await b.close();
