// 各種設定→システム「導入時の書類整理」: 初回報告の未完了が人数つきで出て、まとめて「別の場所で保管」にできる。利用者マスタには帯が無い
import { chromium } from 'playwright';
const OUT = '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad';
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1200, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 160)));
await page.goto('http://localhost:4185/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
// 利用中の利用者3名に「昨日の通所」記録を作り、initialReports を空に
await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const act = d.patients.filter(p => p.status === '利用中').slice(0, 3); const y = new Date(Date.now() - 86400000); const iso = y.toISOString().slice(0, 10);
  d.initialReports = []; d.ticketRecords = (d.ticketRecords || []).filter(t => !act.some(p => p.id === t.patientId));
  act.forEach((p, i) => d.ticketRecords.push({ id: `tr_${p.id}_${y.getFullYear()}_${y.getMonth() + 1}_${y.getDate()}`, patientId: p.id, year: y.getFullYear(), date: `${y.getMonth() + 1}月${y.getDate()}日`, status: '通所' }));
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); window.__ids = act.map(p => p.id); });
await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'master', pid: null, t: Date.now() }))); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1200);
const r = {};
r.noBarInMaster = (await page.getByTestId('ir-bulk-bar').count()) === 0;
await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'settings', pid: null, t: Date.now() }))); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1200);
await page.locator('button', { hasText: /^システム$/ }).first().click().catch(() => {}); await page.waitForTimeout(600);
const panel = page.getByTestId('onboard-ir'); r.bar = (await panel.count()) === 1 && /未完了 3名/.test(await panel.innerText());
await panel.locator('button').first().click(); await page.waitForTimeout(300);
r.modal = (await panel.locator('input[type=checkbox]').count()) === 3 && /3 \/ 3名/.test(await panel.innerText());
await panel.locator('input[type=checkbox]').nth(2).uncheck(); await page.waitForTimeout(100);
r.partial = /2 \/ 3名/.test(await panel.innerText());
await panel.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${OUT}/irbulk.png` });
await panel.locator('button', { hasText: /名を「別の場所で保管」として完了にする/ }).click(); await page.waitForTimeout(1200);
const after = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); return { n: (d.initialReports || []).length, ext: (d.initialReports || []).every(x => x.byExternal) }; });
r.saved = after.n === 2 && after.ext;
r.barAfter = /未完了 1名/.test(await page.getByTestId('onboard-ir').innerText());
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
