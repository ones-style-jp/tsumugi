// 送りの「家に着く時間」: 座席表の席に「着」→ テンキーで入れる／「着く時間の目安」で 出発＋移動時間＋降りる時間 から入る(手で決めた方はそのまま)／スマホの送りの順番に出る
// 連絡帳: 送迎表を使う店舗は「各種入力」に次回予定のカードを出さない
import { chromium } from 'playwright';
const OUT = '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad';
const b = await chromium.launch(); const r = {};
const today = new Date(); const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
async function open(opt) { const page = await (await b.newContext({ locale: 'ja-JP', timezoneId: 'Asia/Tokyo', ...opt })).newPage(); page.on('dialog', d => { console.log('DIALOG', d.message().slice(0, 80)); d.accept(); }); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.route('**/api/route-plan', async (route) => { if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ configured: true }) }); const body = JSON.parse(route.request().postData() || '{}'); const n = (body.stops || []).length; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ order: [...Array(n).keys()], legSeconds: [600, 300, 420, 900].slice(0, n + 1) }) }); });
  await page.goto('http://localhost:4185/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  return page; }
const seed = (page) => page.evaluate((iso) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.diarySettings.cars = [{ id: 'c1', name: '1号車', type: '', cap: '6' }];
  const act = d.patients.filter(p => p.status === '利用中' && p.address).slice(0, 3); const dow = new Date(iso + 'T00:00:00').getDay(); act.forEach((p, i) => { p.scheduleAmPm = ['', '', '', '', '', '', '']; p.scheduleAmPm[dow] = 'AM'; p.pickupMinutes = i === 0 ? 3 : 2; });
  d.transportPlans = { [`${iso}_AM`]: { cars: { c1: act.map((p, i) => ({ pid: p.id, t: `8:${30 + i * 5}` })) }, walkers: [], others: [], un: [], dropMode: 'custom', drop: { cars: { c1: act.map((p, i) => ({ pid: p.id, seat: i })) }, walkers: [], others: [], depart: { c1: '12:10' } }, _savedAt: Date.now() } };
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); return act.map(p => p.id); }, iso);
const plan = (page) => page.evaluate((iso) => JSON.parse(localStorage.getItem('daycareAppData_v3')).transportPlans[`${iso}_AM`], iso);
{ const page = await open({ viewport: { width: 1366, height: 900 } }); const ids = await seed(page);
  await page.evaluate((iso) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, date: iso, ampm: 'AM', t: Date.now() })), iso); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
  await page.getByTestId(`tp-seatbtn-${iso}-AM`).first().click().catch(async () => { await page.getByTestId(`tp-fb-seatbtn-${iso}-AM`).first().click(); }); await page.waitForTimeout(800);
  r.atButtons = (await page.locator('[data-testid^="tp-seat-at-"]').count()) >= 3;
  // 2人目は手で 12:30
  await page.getByTestId(`tp-seat-at-${ids[1]}`).click(); await page.waitForTimeout(300);
  for (const k of ['1', '2', '3', '0']) { await page.locator('button', { hasText: new RegExp('^' + k + '$') }).last().click(); await page.waitForTimeout(60); }
  await page.locator('button', { hasText: /^(決定|確定)$/ }).last().click(); await page.waitForTimeout(800);
  // 目安: 出発 12:10 → 1人目 12:10+10分=12:20 ／ 2人目(手で 12:30・そのまま) ／ 3人目 = 2人目の目安(12:20+1人目の降り3分+5分=12:28)+2人目の降り2分+7分 = 12:37
  await page.getByTestId('tp-seat-at-est').first().click(); await page.waitForTimeout(1500);
  const pl = await plan(page); const L = (pl.drop.cars.c1 || []); const at = (i) => ({ at: (pl.dropAt || {})[String(ids[i])], atAuto: !!(pl.dropAtAuto || {})[String(ids[i])] }); void L;
  r.manualKept = at(1).at === '12:30' && !at(1).atAuto;
  r.estFirst = at(0).at === '12:20' && at(0).atAuto === true;
  r.estThird = at(2).at === '12:37' && at(2).atAuto === true; if (!r.estFirst || !r.estThird || !r.manualKept) console.log(JSON.stringify(L));
  r.seatShows = /着 ?12:20/.test(await page.getByTestId(`tp-seat-at-${ids[0]}`).innerText()) && /目安/.test(await page.getByTestId(`tp-seat-at-${ids[0]}`).innerText());
  await page.screenshot({ path: `${OUT}/dropat_seat.png` });
  await page.context().close(); }
{ const page = await open({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const ids = await seed(page);
  await page.evaluate(([iso, id]) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const P = d.transportPlans[`${iso}_AM`]; P.dropAt = { [String(id)]: '12:20' }; P.dropAtAuto = { [String(id)]: true }; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); }, [iso, ids[0]]);
  await page.evaluate((iso) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, date: iso, ampm: 'AM', t: Date.now() })), iso); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
  const sv = page.locator(`[data-testid="tp-dl-seat-${iso}-AM-c1"], [data-testid="tp-fb-seatview-${iso}-AM"]`).first(); await sv.scrollIntoViewIfNeeded().catch(() => {}); await sv.click({ timeout: 8000 }).catch(e => console.log('sv', e.message.slice(0, 80))); await page.waitForTimeout(800);
  const t = page.getByTestId(`tp-sv-at-${ids[0]}`); r.phoneShows = (await t.count()) === 1 && /12:20/.test(await t.innerText());
  await page.screenshot({ path: `${OUT}/dropat_phone.png` });
  // 連絡帳: 各種入力に次回予定のカードが無い
  await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'print', pid: null, t: Date.now() }))); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800);
  await page.context().close(); }
{ const page = await open({ viewport: { width: 1366, height: 900 } });
  await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'print', pid: null, t: Date.now() }))); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800);
  await page.locator('button:visible', { hasText: /^各種入力/ }).first().click().catch(() => {}); await page.waitForTimeout(600);
  r.cbNoNextCard = (await page.getByTestId('cb-hub-renraku').count()) === 1 && (await page.getByTestId('cb-hub-next').count()) === 0;
  await page.screenshot({ path: `${OUT}/cb_hub.png` });
  await page.context().close(); }
console.log(r, Object.values(r).every(v => v === true || v === 'skip') ? 'PASS' : 'FAIL'); await b.close();
