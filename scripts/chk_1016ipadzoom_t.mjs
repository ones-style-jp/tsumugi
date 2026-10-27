import { chromium } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1080, height: 810 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
const page = await ctx.newPage(); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.goto('http://localhost:4185/', { waitUntil: 'networkidle' }); await page.waitForTimeout(600);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(600); }
await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'record', pid: null, t: Date.now() })));
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 400 }).catch(() => {});
const meta = () => page.evaluate(() => document.querySelector('meta[name="viewport"]').getAttribute('content'));
console.log('load meta:', await meta());
const inp = page.locator('#tsuContentScroller input:visible').nth(1);
const bb = await inp.boundingBox(); console.log('input', !!bb);
await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.waitForTimeout(100);
console.log('tap input → meta:', (await meta()).match(/maximum-scale=[\d.]+/)[0], 'focused:', await inp.evaluate(el => document.activeElement === el));
await page.waitForTimeout(2000); console.log('still focused after 2s → meta:', (await meta()).match(/maximum-scale=[\d.]+/)[0]);
await page.evaluate(() => document.activeElement && document.activeElement.blur()); await page.waitForTimeout(700);
console.log('blur → meta:', (await meta()).match(/maximum-scale=[\d.]+/)[0]);
// ピンチ(CDP)で拡大したときに スマホ用の画面に切り替わらないか
const cdp = await ctx.newCDPSession(page);
await cdp.send('Input.synthesizePinchGesture', { x: 540, y: 400, scaleFactor: 2, gestureSourceType: 'touch' }).catch(e => console.log('pinch err', e.message));
await page.waitForTimeout(800);
console.log('after pinch:', JSON.stringify(await page.evaluate(() => ({ scale: visualViewport.scale, inner: innerWidth, cw: document.documentElement.clientWidth, sidebar: !!document.querySelector('[data-testid="app-sidebar"]'), phoneFold: !!document.querySelector('[data-testid^="tsu-phone-fold"], .tsu-phone-fold') }))));
await page.evaluate(() => window.dispatchEvent(new Event('resize'))); await page.waitForTimeout(500);
console.log('after resize:', JSON.stringify(await page.evaluate(() => ({ scale: visualViewport.scale, sidebar: !!document.querySelector('[data-testid="app-sidebar"]'), main: !!document.getElementById('tsuContentScroller') }))));
await page.screenshot({ path: '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad/ipad_pinch.png' });
await b.close();
