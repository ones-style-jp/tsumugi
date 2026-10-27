import { chromium, devices } from 'playwright';
const OUT = '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad';
const b = await chromium.launch();
for (const [label, dev] of [['phone', devices['iPhone 13']], ['pc', { viewport: { width: 1366, height: 800 } }]]) {
  const ctx = await b.newContext({ ...dev, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage();
  page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 160)));
  const pdfs = []; await page.route('**/api/pdf**', async (route) => { try { pdfs.push(JSON.parse(route.request().postData() || '{}')); } catch {} await route.fulfill({ status: 200, contentType: 'application/pdf', body: '%PDF-1.4\n%%EOF' }); });
  await page.goto('http://localhost:4185/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'print', pid: null, t: Date.now() })));
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
  if (label === 'phone') { const op = page.locator('button', { hasText: /操作/ }).first(); if (await op.count()) { await op.click(); await page.waitForTimeout(300); } }
  await page.locator('button', { hasText: /^印刷設定$/ }).first().click(); await page.waitForTimeout(400);
  const pr = await page.getByTestId('cb-print-settings').boundingBox();
  console.log(label, 'panel', JSON.stringify({ left: Math.round(pr.x), right: Math.round(pr.x + pr.width), vw: page.viewportSize().width, top: Math.round(pr.y) }));
  if (label === 'phone') await page.screenshot({ path: `${OUT}/cbset_phone.png` });
  const timeStyle = () => page.evaluate(() => { const sp = Array.from(document.querySelectorAll('span')).find(s => s.textContent === '時' && s.style.fontSize === '24px'); const num = sp && sp.previousElementSibling; return sp ? { color: sp.style.color, weight: sp.style.fontWeight, numColor: num && num.style.color, numWeight: num && num.style.fontWeight } : null; });
  console.log(label, 'default', JSON.stringify(await timeStyle()));
  await page.getByTestId('cb-timecolor-red').click(); await page.waitForTimeout(400); console.log(label, 'red    ', JSON.stringify(await timeStyle()));
  await page.getByTestId('cb-timebold-0').click(); await page.waitForTimeout(400); console.log(label, 'normal ', JSON.stringify(await timeStyle()));
  await page.getByTestId('cb-timecolor-blue').click(); await page.waitForTimeout(400);
  const n0 = pdfs.length; await page.getByTestId('cb-pdf').click().catch(() => {}); await page.waitForTimeout(800);
  const modal = page.locator('div.fixed.inset-0.z-\\[9999\\]').last(); if (await modal.count()) { console.log(label, 'modal:', (await modal.innerText()).replace(/\n+/g, ' / ').slice(0, 160)); const go = modal.locator('button', { hasText: /ダウンロード|作成|OK|はい|進む/ }).first(); if (await go.count()) await go.click(); } await page.waitForTimeout(3500);
  const h = pdfs.length > n0 ? pdfs.at(-1).html : ''; console.log(label, 'pdf has blue 時', /color:\s*rgb\(29, 78, 216\);[^>]*>時</.test(h) || /#1d4ed8;[^>]*>時</.test(h), 'weight normal', /font-weight:\s*normal;[^>]*>時</.test(h));
  await page.getByTestId('cb-timecolor-black').click(); await page.getByTestId('cb-timebold-1').click(); await page.waitForTimeout(300);
  await ctx.close();
}
await b.close();
