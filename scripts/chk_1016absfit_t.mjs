import { chromium, devices } from 'playwright';
const OUT = '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad';
const b = await chromium.launch();
for (const [label, dev] of [['phone', devices['iPhone 13']], ['pc', { viewport: { width: 1366, height: 800 } }]]) {
  const ctx = await b.newContext({ ...dev, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage();
  page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 160)));
  const pdfs = []; await page.route('**/api/pdf**', async (route) => { try { pdfs.push(JSON.parse(route.request().postData() || '{}')); } catch {} await route.fulfill({ status: 200, contentType: 'application/pdf', body: '%PDF-1.4\n%%EOF' }); });
  await page.goto('http://localhost:4185/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const p = (d.patients || []).find(x => x.status === '利用中'); const t = new Date(); const dd = `${t.getMonth()+1}月${t.getDate()}日`;
    d.ticketRecords = (d.ticketRecords || []).concat([{ id: 'absX', patientId: p.id, date: dd, year: t.getFullYear(), status: '欠席', tokki: '' }]); d.faxDataStore = {};
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'absence_fax', pid: null, t: Date.now() })); });
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
  // 今日の欠席者(カレンダーの名前の札)を押す
  const chip = page.locator('button', { hasText: /例示 清|例示|架空|仮名/ }).first(); await chip.click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(800);
  const ta = page.locator('#print-content-fax textarea').first();
  if (!(await ta.count())) { console.log(label, 'textarea not found'); await page.screenshot({ path: `${OUT}/absfit_${label}_nf.png` }); await ctx.close(); continue; }
  const base = await ta.inputValue();
  await ta.fill(base + '\n'.repeat(15)); await page.waitForTimeout(500);
  const m = await ta.evaluate(el => { const sheet = el.closest('#print-content-fax'); const close = Array.from(sheet.querySelectorAll('div')).find(c => c.children.length === 0 && /今後とも/.test(c.textContent)); return { fs: el.style.fontSize, h: Math.round(el.getBoundingClientRect().height), closeFs: close && close.style.fontSize, gap: close ? Math.round(close.getBoundingClientRect().top - el.getBoundingClientRect().bottom) : null }; });
  console.log(label, 'trail', JSON.stringify(m));
  await ta.fill((base + '\n').repeat(4).slice(0, 400)); await page.waitForTimeout(500);
  console.log(label, 'long ', JSON.stringify(await ta.evaluate(el => ({ fs: el.style.fontSize, h: Math.round(el.getBoundingClientRect().height) }))));
  await ta.fill(base); await page.waitForTimeout(300);
  const n0 = pdfs.length; await page.locator('button', { hasText: /^ダウンロード$/ }).first().click().catch(() => {}); await page.waitForTimeout(3000);
  const h = pdfs.length > n0 ? pdfs.at(-1).html : ''; if (h) { const fs = await import('fs'); fs.writeFileSync(`${OUT}/absfit_${label}_pdf.html`, h); }
  console.log(label, 'pdf', h.length, 'closing fs', (h.match(/font-size:\s*([\d.]+)px;[^>]*>今後とも/) || [])[1]);
  await ctx.close();
}
await b.close();
