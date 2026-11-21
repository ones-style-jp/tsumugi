import { chromium, devices } from 'playwright';
const OUT = '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad';
const b = await chromium.launch({ args: ['--lang=ja-JP'] }); const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage();
page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 160)));
await page.clock.install({ time: new Date('2026-10-07T10:40:00') });
await page.goto('http://localhost:4185/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'record', t: Date.now() })));
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
const cards = await page.locator('[data-rec-card]').count();
console.log('cards', cards, '| jump btn', await page.getByTestId('rec-fold-jump').count());
await page.getByTestId('rec-fold-jump').click(); await page.waitForTimeout(400);
const items = page.getByTestId('rec-jump-item'); console.log('list items', await items.count());
await page.screenshot({ path: `${OUT}/recjump_list.png` });
// 名前で探す(最後の方)
const last = await items.last().locator('span').first().innerText();
await page.getByTestId('rec-jump-q').fill(last.slice(0, 2)); await page.waitForTimeout(300);
console.log('search', last.slice(0, 2), '→', await items.count());
await page.getByTestId('rec-jump-q').fill(''); await page.waitForTimeout(200);
const n = await items.count(); const target = items.nth(Math.min(n - 1, 12)); const tname = await target.locator('span').first().innerText();
await target.click(); await page.waitForTimeout(1200);
const r = await page.evaluate((tname) => { const pin = document.querySelector('.tsu-pin'); const pb = pin.getBoundingClientRect().bottom; const card = [...document.querySelectorAll('[data-rec-card]')].find(c => c.innerText.includes(tname)); const ct = card.getBoundingClientRect().top; return { pinBottom: Math.round(pb), cardTop: Math.round(ct), ring: card.className.includes('ring-amber-400'), panel: !!document.querySelector('[data-testid="rec-jump"]') }; }, tname);
console.log('jump to', tname, JSON.stringify(r));
await page.screenshot({ path: `${OUT}/recjump_after.png` });
// 閉じる(背景を押す)
await page.getByTestId('rec-fold-jump').click(); await page.waitForTimeout(300); await page.mouse.click(200, 620); await page.waitForTimeout(300);
console.log('closed by backdrop', await page.getByTestId('rec-jump').count());
await b.close();
