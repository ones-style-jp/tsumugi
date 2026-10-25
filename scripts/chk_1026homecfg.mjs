import { chromium } from 'playwright';
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1024, height: 768 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
await page.goto('http://localhost:4175/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
await page.evaluate(() => localStorage.setItem('tsumugiSidebarOpen', '0')); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
const r = {};
const cfg = page.getByTestId('home-tasks-cfg'); r.btn = (await cfg.count()) === 1;
const bb = await cfg.boundingBox(); const chips = await page.locator('[data-testid^="home-tasks-"] button, [data-testid="home-tasks"] button').evaluateAll(els => els.map(e => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, t: e.textContent.slice(0, 10) }; }));
r.noOverlap = chips.every(c => !(c.x < bb.x + bb.width && c.x + c.w > bb.x && c.y < bb.y + bb.height && c.y + c.h > bb.y));
await cfg.click(); await page.waitForTimeout(300); r.panel = (await page.getByTestId('home-tasks-cfg-panel').count()) === 1;
await page.getByTestId('home-hero').screenshot({ path: '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad/shot_home_cfg.png' });
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
