// スマホの分析(個人)で、体温・血圧・脈拍のグラフが出る記録があってもエラー(React #185)にならない(1・3・6ヶ月)
import { chromium } from 'playwright';
let bad = 0;
const OUT = '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad';
const W = Number(process.env.W || 390); const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: W, height: 844 }, isMobile: true, hasTouch: true, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 300))); page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 300)); });
await page.goto('http://localhost:4185/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
// 今月の記録が多い方を選ぶ(見本データのまま)
const pid = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const c = {}; (d.ticketRecords || []).forEach(r => { if (r.temp_AM || r.bpUpSt_AM) c[r.patientId] = (c[r.patientId] || 0) + 1; }); const best = Object.entries(c).sort((a, b) => b[1] - a[1])[0]; return best ? Number(best[0]) : d.patients[0].id; });
console.log('pid', pid);
const sample = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const r = (d.ticketRecords || []).find(x => x.kibunArrival); return r ? { kA: r.kibunArrival, date: r.date, year: r.year, keys: Object.keys(r).slice(0, 40) } : null; }); console.log('sample', JSON.stringify(sample));
await page.evaluate((pid) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const t = new Date(); const y = t.getFullYear(), m = t.getMonth() + 1; const moods = ['😊', '😐', '🤩', '😞', '😊']; d.ticketRecords = (d.ticketRecords || []).filter(r => r.patientId !== pid);
  for (let i = 1; i <= Math.min(18, t.getDate()); i++) d.ticketRecords.push({ id: `tz_${pid}_${i}`, patientId: pid, date: `${m}月${i}日`, year: y, status: '出席', temp: String(36 + (i % 9) / 10), bpUpSt: String(120 + i), bpDnSt: String(70 + (i % 7)), plSt: String(65 + i), bpUpEn: String(118 + i), bpDnEn: '72', plEn: '70', temp_AM: String(36 + (i % 9) / 10), bpUpSt_AM: String(120 + i), bpDnSt_AM: String(70 + (i % 7)), plSt_AM: String(65 + i), bpUpEn_AM: String(118 + i), bpDnEn_AM: String(72), plEn_AM: String(70), kibunArrival: moods[i % 5], kibunDeparture: moods[(i + 1) % 5], exercises: { ex1: '10分' }, _savedAt: Date.now() });
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); }, pid);
for (const per of ['1ヶ月', '3ヶ月', '6ヶ月']) {
  await page.evaluate((pid) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'dash_personal', pid, t: Date.now() })), pid); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
  const sel = page.locator('select').filter({ has: page.locator('option', { hasText: '3ヶ月' }) }).first(); if (await sel.count()) { await sel.selectOption({ label: per }).catch(() => {}); await page.waitForTimeout(2000); }
  console.log(per, 'vital widths', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.vital-scroll')].map(e => e.clientWidth))), 'svgs', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('#print-content-analysis svg[width]')].map(s => s.getAttribute('width')).slice(0, 12))));
  const err = await page.getByText('画面の表示中にエラーが発生しました').count(); console.log(per, 'error screen', err);
  if (err) { bad++; console.log((await page.locator('body').innerText()).slice(0, 600)); await page.screenshot({ path: `${OUT}/dpcrash_${W}.png` }); break; }
}
console.log(bad ? 'FAIL' : 'PASS'); await b.close();
