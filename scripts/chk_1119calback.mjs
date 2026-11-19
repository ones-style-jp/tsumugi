// trial602: 日誌のカレンダーは外を押すと閉じる(幕)
import { chromium } from 'playwright';
const PORT = process.argv[2] || '4175'; let fails = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
await page.evaluate(() => { localStorage.setItem('tsumugiSidebarOpen', '0'); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'diary', t: Date.now() })); });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(3000); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
const root = page.locator('[data-testid="diary-cal-root"]').first(); const isOpen = () => page.evaluate(() => { const d = document.querySelector('[data-testid="diary-cal-root"] details'); return !!(d && d.open); });
await root.locator('summary').first().click(); await page.waitForTimeout(400); ok(await isOpen(), 'カレンダーが開く');
const bd = page.locator('[data-testid="diary-cal-backdrop"]'); const vis = await bd.evaluate(el => getComputedStyle(el).display !== 'none' && getComputedStyle(el).position === 'fixed'); ok(vis, '開いている間は画面全体の幕が出る');
await page.mouse.click(300, 700); await page.waitForTimeout(400); ok(!(await isOpen()), '外を押すと閉じる');
const vis2 = await bd.evaluate(el => getComputedStyle(el).display); ok(vis2 === 'none', '閉じたら幕も消える');
await b.close(); console.log(fails ? `FAIL ${fails}` : 'ALL PASS'); process.exit(fails ? 1 : 0);
