import { chromium, devices } from 'playwright';
const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage();
page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.goto('http://localhost:4185/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'record', pid: null, t: Date.now() })));
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
// 基準値の無い運動のマスを押して ○ → 赤い知らせ
const cells = page.locator('[data-exercise-cell], td button, .rec-ex-cell').first();
const warnBefore = await page.locator('text=閉じる').count();
// 直接 state を出せないので、知らせの部品と同じ作りの要素を調べる: 赤い知らせを出す経路 = ○ ボタン。まず ○ を探す
const maru = page.locator('button', { hasText: /^○$/ }).first(); console.log('maru btn', await maru.count());
if (await maru.count()) { await maru.click().catch(() => {}); await page.waitForTimeout(500); }
const w = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.innerText.trim() === '閉じる' && x.closest('[style*="2000020"]')); if (!b) return null; const r = b.getBoundingClientRect(); return { h: Math.round(r.height), w: Math.round(r.width), ws: getComputedStyle(b).whiteSpace }; });
console.log('warn close btn', JSON.stringify(w));
await page.screenshot({ path: '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad/warn_phone.png' });
await b.close();
