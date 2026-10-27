import { chromium, devices } from 'playwright';
const OUT = '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad';
const MEMO = 'いつもお世話になっております。\n上記件、送付致しますのでご確認ください。\n\n9/25以降お休みが続き、久々のご利用でした。\n杖を使用し来所されましたが、使用しなくても歩行は比較的安定されているご様子でした。\n接骨院通院により、腰痛や前傾姿勢は、“余りよく分からないが、少し良い気はする”と仰っていて、実際姿勢は以前より伸びていて、腰痛の訴えなく、運動も行うことが出来ていました。\n体力測定の数値も、片足立ち以外、維持・向上傾向でした。';
const b = await chromium.launch();
for (const [label, dev] of [['phone', devices['iPhone 13']], ['ipad', { viewport: { width: 1080, height: 810 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }], ['pc1366', { viewport: { width: 1366, height: 800 } }], ['pc1100', { viewport: { width: 1100, height: 700 } }]]) {
  const ctx = await b.newContext({ ...dev, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage();
  page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 160)));
  const pdfs = []; await page.route('**/api/pdf**', async (route) => { try { pdfs.push(JSON.parse(route.request().postData() || '{}')); } catch {} await route.fulfill({ status: 200, contentType: 'application/pdf', body: '%PDF-1.4\n%%EOF' }); });
  await page.goto('http://localhost:4185/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'general_fax', pid: null, t: Date.now() })));
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
  const sel = page.locator('select').first(); if (await sel.count()) { const opts = await sel.evaluate(el => Array.from(el.options).map(o => o.value)); const v = opts.find(x => x); if (v) await sel.selectOption(v); await page.waitForTimeout(400); }
  const ta = page.locator('#print-content-general-fax textarea').first();
  await ta.fill(MEMO); await page.waitForTimeout(600);
  const m = await ta.evaluate(el => ({ sheetH: el.closest('[id^=print-content]').getBoundingClientRect().height, boxH: el.parentElement.getBoundingClientRect().height, fs: el.style.fontSize, sh: el.scrollHeight, ch: el.clientHeight, zoom: getComputedStyle(el.closest('[id^=print-content]')).zoom, outerZoom: (() => { let z = 1; for (let n = el; n; n = n.parentElement) { const v = parseFloat(n.style.zoom); if (v) z *= v; } return z; })() }));
  const dl = page.locator('button', { hasText: /^ダウンロード$/ }).first(); const n0 = pdfs.length; await dl.click().catch(() => {}); await page.waitForTimeout(2500);
  const h = pdfs.length > n0 ? pdfs.at(-1).html : ''; const pf = (h.match(/<textarea[^>]*font-size:\s*([\d.]+)px/) || [])[1];
  console.log(label, JSON.stringify(m), '| pdf textarea font-size', pf);
  await page.screenshot({ path: `${OUT}/faxfs_${label}.png`, fullPage: false });
  await ctx.close();
}
await b.close();
