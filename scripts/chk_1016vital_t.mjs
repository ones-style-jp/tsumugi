import { chromium } from 'playwright';
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.goto('http://localhost:4185/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const pid = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const p = d.patients.find(x => x.status === '利用中'); const t = new Date(); const y = t.getFullYear(), m = t.getMonth() + 1;
  // 今月の記録: 通所時 120/70 脈60 … 終了時に最高(150)と最低の脈(50)を置く
  d.ticketRecords = (d.ticketRecords || []).filter(r => r.patientId !== p.id);
  for (let i = 1; i <= 6; i++) d.ticketRecords.push({ id: `v${i}`, patientId: p.id, date: `${m}月${i}日`, year: y, status: '出席', bpUpSt: String(120 + i), bpDnSt: String(70 + i), plSt: String(60 + i), bpUpEn: i === 3 ? '150' : String(118 + i), bpDnEn: String(68 + i), plEn: i === 4 ? '50' : String(62 + i), temp: '36.5' });
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'dash_personal', pid: p.id, t: Date.now() })); return p.id; });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
const sel = page.locator('select').first(); if (await sel.count()) { await sel.selectOption(String(pid)).catch(() => {}); await page.waitForTimeout(800); }
await page.screenshot({ path: '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad/vital_dbg.png', fullPage: true });
const both = page.locator('button', { hasText: /通所時＋終了時/ }).first(); console.log('両方 btn', await both.count(), 'phase btns', await page.locator('button', { hasText: /通所時のみ/ }).count());
if (await both.count()) { await both.click(); await page.waitForTimeout(600); }
const rng = page.locator('button', { hasText: /^(1か月|30日|今月|日別)$/ }).first(); console.log('range btns', await page.locator('button').filter({ hasText: /か月|日別|週/ }).allInnerTexts().then(a => a.slice(0, 8).join('|')));
if (await rng.count()) { await rng.click(); await page.waitForTimeout(600); }
const card = page.locator('text=血圧（日別）').locator('..').locator('..'); await card.screenshot({ path: '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad/vital_bp.png' }).catch(() => {});
const labels = await page.evaluate(() => { const out = []; document.querySelectorAll('svg text').forEach(t => { if (t.textContent === '最高' || t.textContent === '最低') { const g = t.parentElement; const rect = g.querySelector('rect'); out.push({ l: t.textContent, x: Math.round(+t.getAttribute('x')), y: Math.round(+t.getAttribute('y')), op: rect && rect.getAttribute('opacity') }); } }); return out; });
console.log('labels', JSON.stringify(labels.slice(0, 8)));
console.log('summary max', await page.locator('text=収縮期 最高').locator('..').innerText().catch(() => '-'));
await b.close();
