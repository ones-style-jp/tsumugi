import { chromium, devices } from 'playwright';
const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage();
page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.goto('http://localhost:4185/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
for (const v of ['fitness', 'master']) {
  await page.evaluate((v) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: null, t: Date.now() })), v);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
  const names = await page.evaluate(() => [...document.querySelectorAll('button, [role=button], li, div')].filter(e => /^(例示|架空|仮名|標本|見本|参考|試作|模擬|練習) \S+/.test(e.innerText.trim().split('\n')[0]) && e.getBoundingClientRect().height > 20 && e.getBoundingClientRect().height < 120).length);
  console.log(v, 'roster visible names', names, 'bar text', await page.evaluate(() => (document.querySelector('[data-testid^="pin-"] button') || {}).innerText || '-'));
  await page.screenshot({ path: `/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad/roster_${v}.png` });
}
await b.close();
