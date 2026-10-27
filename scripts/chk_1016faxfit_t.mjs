import { chromium, devices } from 'playwright';
const OUT = '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad';
const BASE = 'いつもお世話になっております。\n上記件、送付致しますのでご確認ください。\n\n9/25以降お休みが続き、久々のご利用でした。\n杖を使用し来所されましたが、使用しなくても歩行は比較的安定されているご様子でした。\n接骨院通院により、腰痛や前傾姿勢は、“余りよく分からないが、少し良い気はする”と仰っていて、実際姿勢は以前より伸びていて、腰痛の訴えなく、運動も行うことが出来ていました。\n体力測定の数値も、片足立ち以外、維持・向上傾向でした。';
const CASES = [['trail', BASE + '\n'.repeat(18)], ['long', (BASE + '\n').repeat(3).slice(0, 500)], ['short', BASE]];
const b = await chromium.launch();
for (const [label, dev] of [['phone', devices['iPhone 13']], ['pc', { viewport: { width: 1366, height: 800 } }]]) {
  const ctx = await b.newContext({ ...dev, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage();
  page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 160)));
  const pdfs = []; await page.route('**/api/pdf**', async (route) => { try { pdfs.push(JSON.parse(route.request().postData() || '{}')); } catch {} await route.fulfill({ status: 200, contentType: 'application/pdf', body: '%PDF-1.4\n%%EOF' }); });
  await page.goto('http://localhost:4185/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'general_fax', pid: null, t: Date.now() })));
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
  const sel = page.locator('select').first(); if (await sel.count()) { const opts = await sel.evaluate(el => Array.from(el.options).map(o => o.value)); const v = opts.find(x => x); if (v) await sel.selectOption(v); await page.waitForTimeout(400); }
  const ta = page.locator('#print-content-general-fax textarea').first();
  for (const [cname, memo] of CASES) {
    await ta.fill(memo); await page.waitForTimeout(500);
    const m = await ta.evaluate(el => { const box = el.parentElement; const close = Array.from(box.children).find(c => /今後とも/.test(c.textContent)); const r = el.getBoundingClientRect(), cr = close.getBoundingClientRect(), br = box.getBoundingClientRect();
      return { avail: el.dataset.avail, val: el.value.length, fs: el.style.fontSize, h: Math.round(r.height), closeFs: close.style.fontSize, gapToClose: Math.round(cr.top - r.bottom), closeToBoxBottom: Math.round(br.bottom - cr.bottom), count: (document.querySelector('.no-print') || {}).textContent }; });
    console.log(label, cname.padEnd(6), JSON.stringify(m));
    if (cname !== 'short') { await page.locator('#print-content-general-fax').screenshot({ path: `${OUT}/faxfit_${label}_${cname}.png` }); }
  }
  // 離れたら末尾の空行が消える
  await ta.fill(BASE + '\n\n\n'); await page.locator('input[type="text"]').first().focus(); await page.waitForTimeout(300);
  console.log(label, 'blur trims', JSON.stringify((await ta.inputValue()).slice(-6)));
  const n0 = pdfs.length; await page.locator('button', { hasText: /^ダウンロード$/ }).first().click().catch(() => {}); await page.waitForTimeout(2500);
  const h = pdfs.length > n0 ? pdfs.at(-1).html : ''; const pf = (h.match(/<textarea[^>]*font-size:\s*([\d.]+)px/) || [])[1]; const ph = (h.match(/<textarea[^>]*>/) || [''])[0].replace(/^.*style="/, '').slice(0, 200);
  if (h) { const fs = await import('fs'); fs.writeFileSync(`${OUT}/faxfit_${label}_pdf.html`, h); }
  console.log(label, 'pdf textarea fs', pf, 'height', ph, 'closing fs', (h.match(/font-size:\s*([\d.]+)px;[^>]*>今後とも/) || [])[1]);
  await ctx.close();
}
await b.close();
