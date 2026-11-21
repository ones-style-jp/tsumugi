// 送迎表: 運転者の選択に「その他（名前を入力）」→ 名前を入れて決定 → 保存され、選択肢に「○○（その他）」と出る
import { chromium } from 'playwright';
const OUT = '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad';
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.route('**/api/route-plan', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ configured: false }) }));
const today = new Date(); const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
await page.goto('http://localhost:4185/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
await page.evaluate((iso) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3'));
  d.diarySettings.cars = [{ id: 'cS', name: 'シエンタ', type: '', cap: '5' }];
  const act = d.patients.filter(p => p.status === '利用中').slice(0, 2); const dow = new Date(iso).getDay(); act.forEach(p => { p.scheduleAmPm = ['', '', '', '', '', '', '']; p.scheduleAmPm[dow] = 'AM'; });
  d.transportPlans = { [`${iso}_AM`]: { cars: { cS: [{ pid: act[0].id, t: '8:30' }] }, walkers: [], others: [], un: [{ pid: act[1].id }], driver: {}, _savedAt: Date.now() } };
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, date: iso, ampm: 'AM', t: Date.now() })); }, iso);
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
const r = {};
const sel = page.getByTestId('tp-driver-cS').first(); r.hasSelect = (await sel.count()) > 0;
if (!r.hasSelect) { await page.screenshot({ path: `${OUT}/driverother_dbg.png`, fullPage: true }); console.log(r, 'FAIL'); await b.close(); process.exit(0); }
r.hasOtherOpt = (await sel.locator('option', { hasText: 'その他（名前を入力）' }).count()) === 1;
await sel.selectOption('__other__'); await page.waitForTimeout(200);
const box = page.getByTestId('tp-driver-cS-other').first(); r.inputShown = (await box.count()) === 1;
await box.locator('input').fill('応援 山本たろう花子様です'); await box.locator('button', { hasText: '決定' }).click(); await page.waitForTimeout(600);
const saveBtn = page.locator('button', { hasText: /^保存$/ }).first(); if (await saveBtn.count()) { await saveBtn.click().catch(() => {}); }
await page.waitForTimeout(2500);
const saved = await page.evaluate((iso) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const pl = d.transportPlans[`${iso}_AM`] || {}; return (pl.driver || {}).cS || JSON.stringify(pl.driver || null); }, iso);
console.log('saved=', saved);
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
r.saved = (await page.getByTestId('tp-driver-cS').first().inputValue()) === '応援 山本たろう花子'; // 再読み込み後も残る
const sel2 = page.getByTestId('tp-driver-cS').first();
r.shownAsOther = (await sel2.inputValue()) === '応援 山本たろう花子' && (await sel2.locator('option', { hasText: '応援 山本たろう花子（その他）' }).count()) === 1;
// 戻るで取り消し
await sel2.selectOption('__other__'); await page.waitForTimeout(150); await page.getByTestId('tp-driver-cS-other').first().locator('button', { hasText: 'やめる' }).click(); await page.waitForTimeout(200);
r.cancelKeeps = (await page.getByTestId('tp-driver-cS').first().inputValue()) === '応援 山本たろう花子';
await page.screenshot({ path: `${OUT}/driverother.png` });
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
