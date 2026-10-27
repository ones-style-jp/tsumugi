// 送りの時間(迎えと同じ日): 自動計算(時間)で送りの時間の目安も入る(迎えの逆順・出発=終了＋乗車時間)→ 作成中の運行表に「送12:22」→ 確定後の一覧 → ダウンロードの運行表の「送り」の列
import { chromium } from 'playwright';
const OUT = '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad';
const b = await chromium.launch(); const r = {};
const today = new Date(); const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
const page = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
page.on('dialog', d => { console.log('DIALOG', d.message().slice(0, 90).replace(/\n/g, ' ')); d.accept(); }); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.route('**/api/route-plan', async (route) => { if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ configured: true }) }); const body = JSON.parse(route.request().postData() || '{}'); const n = (body.stops || []).length; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ order: [...Array(n).keys()], legSeconds: [600, 300, 420, 900, 300].slice(0, n + 1) }) }); });
await page.goto('http://localhost:4185/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const ids = await page.evaluate((iso) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.diarySettings.cars = [{ id: 'c1', name: '1号車', type: '', cap: '6' }];
  const fi = d.systemSettings.facilityInfo = d.systemSettings.facilityInfo || {}; fi.serviceTimeAM = fi.serviceTimeAM || '9:00～12:05';
  const act = d.patients.filter(p => p.status === '利用中' && p.address).slice(0, 3); const dow = new Date(iso + 'T00:00:00').getDay(); act.forEach((p, i) => { p.scheduleAmPm = ['', '', '', '', '', '', '']; p.scheduleAmPm[dow] = 'AM'; p.pickupMinutes = i === 0 ? 3 : 2; });
  d.transportPlans = { [`${iso}_AM`]: { cars: { c1: act.map((p, i) => ({ pid: p.id, t: `8:${30 + i * 5}` })) }, walkers: [], others: [], un: [], _savedAt: Date.now() } };
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); return { ids: act.map(p => p.id), am: fi.serviceTimeAM }; }, iso);
console.log('svc', ids.am);
await page.evaluate((iso) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, date: iso, ampm: 'AM', t: Date.now() })), iso); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
await page.locator('button:visible', { hasText: /^自動計算/ }).first().click(); await page.waitForTimeout(500);
await page.locator('button:visible', { hasText: /^計算する$/ }).first().click(); await page.waitForTimeout(3500);
const pl = await page.evaluate((iso) => JSON.parse(localStorage.getItem('daycareAppData_v3')).transportPlans[`${iso}_AM`], iso);
const da = (i) => (pl.dropAt || {})[String(ids.ids[i])]; console.log('dropAt', JSON.stringify(pl.dropAt), JSON.stringify(pl.dropAtAuto));
// 出発 = 終了(12:05)＋乗車時間(3+2+2=7分) = 12:12。送りは迎えの逆順(3人目→2人目→1人目)。3人目 12:12+10=12:22 → 2人目 +2(3人目の降り)+5=12:29 → 1人目 +2+7=12:38
r.autoSame = da(2) === '12:22' && da(1) === '12:29' && da(0) === '12:38' && Object.values(pl.dropAtAuto || {}).every(Boolean);
const g = page.getByTestId(`tp-dat-${ids.ids[2]}`); r.gridShows = (await g.count()) === 1 && /送12:22/.test(await g.innerText());
await page.screenshot({ path: `${OUT}/dropat2_grid.png` });
// 乗っていない方(9999)の送りの時間を入れておく → 運行表で1か所直したら消えている
await page.evaluate((iso) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const P = d.transportPlans[`${iso}_AM`]; P.dropAt = { ...(P.dropAt || {}), '9999': '12:00' }; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); }, iso);
await page.evaluate((iso) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, date: iso, ampm: 'AM', t: Date.now() })), iso); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
// 迎えと同じ日でも、運行表の「送」を押して手で直せる(2人目を 12:40 に)
await page.getByTestId(`tp-dat-${ids.ids[1]}`).click(); await page.waitForTimeout(300);
for (const k of ['1', '2', '4', '0']) { await page.locator('button:visible', { hasText: new RegExp('^' + k + '$') }).last().click(); await page.waitForTimeout(60); }
await page.locator('button:visible', { hasText: /^(決定|確定)$/ }).last().click(); await page.waitForTimeout(800);
{ const p2 = await page.evaluate((iso) => JSON.parse(localStorage.getItem('daycareAppData_v3')).transportPlans[`${iso}_AM`], iso); r.pruned = !('9999' in (p2.dropAt || {})); r.editSame = (p2.dropAt || {})[String(ids.ids[1])] === '12:40' && !(p2.dropAtAuto || {})[String(ids.ids[1])] && /送12:40/.test(await page.getByTestId(`tp-dat-${ids.ids[1]}`).innerText()); }
// ダウンロードの運行表: setPrintHtml の中身を受け取る
await page.evaluate(() => { window.__ph = ''; window.addEventListener('setPrintHtml', e => { window.__ph = (e.detail && e.detail.html) || ''; }); });
await page.locator('button:visible', { hasText: /^ダウンロード$/ }).first().click(); await page.waitForTimeout(500);
await page.getByTestId('tp-print-drop-col').check().catch(() => {}); // 2026-10-21: 最初は「入れない」なので「名前の右に時間」を選ぶ
await page.locator('button:visible', { hasText: /^ダウンロード$/ }).last().click(); await page.waitForTimeout(1500);
const ph = await page.evaluate(() => window.__ph); { const fs = await import('fs'); fs.writeFileSync(`${OUT}/dropat2_sheet.html`, `<!doctype html><meta charset=utf-8><body style="margin:0;background:#fff">${ph}</body>`); } r.sheetShows = /12:22/.test(ph) && />送り</.test(ph); if (!r.sheetShows) console.log('sheet len', ph.length, /送り/.test(ph));
await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(500);
// 確定 → 確定後の一覧
await page.evaluate((iso) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, date: iso, ampm: 'AM', t: Date.now() })), iso); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
await page.locator('button:visible', { hasText: /^確定$/ }).first().click().catch(e => console.log('kakutei', e.message.slice(0, 60))); await page.waitForTimeout(1500);
const fb = page.getByTestId(`tp-fb-dat-${iso}-AM-${ids.ids[2]}`); r.listShows = (await fb.count()) === 1 && /12:22/.test(await fb.innerText()) && /12:40/.test(await page.getByTestId(`tp-fb-dat-${iso}-AM-${ids.ids[1]}`).innerText());
await page.screenshot({ path: `${OUT}/dropat2_list.png` });
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
