// 2026-10-22 試験版: 実機で「押した合図の順番」が違う場合(テンキーの外の押下だけ届いて、マスの click が届かない)でも、閉じたあと枠と行の黄色が消える
//   ・同じ行の特記に文字を入れているときは行の黄色を残す
import { chromium } from 'playwright';
const PORT = process.argv[2] || '4185'; const r = {};
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept());
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'record', pid: null, t: Date.now() }))); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2200);
const rows = page.locator('#record-table tr[data-rv-pid]:not([data-rv-status="欠席"]):not([data-rv-status="休業"]):not([data-rv-status="休止"])'); const p0 = await rows.nth(0).getAttribute('data-rv-pid');
const temp = page.locator(`#record-table tr[data-rv-pid="${p0}"] input[inputmode="decimal"]`).first();
const st = () => page.evaluate((p0) => { const row = document.querySelector(`#record-table tr[data-rv-pid="${p0}"]`); return { kp: [...document.querySelectorAll('button')].some(x => x.textContent === '36.' && x.offsetParent), cur: row.hasAttribute('data-rv-cur'), amber: /ring-amber-300/.test(row.querySelector('input[inputmode="decimal"]').className) }; }, p0);
await temp.click(); await page.waitForTimeout(400);
await temp.evaluate(el => { el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); }); // click は届かない
await page.waitForTimeout(60); const mid = await st(); await page.waitForTimeout(500); const s = await st(); console.log('mousedown only', JSON.stringify(mid), JSON.stringify(s)); r.noClick = !s.kp && !s.cur && !s.amber; r.sameTime = !mid.kp && !mid.cur && !mid.amber; // テンキーと同時(0.06秒後には消えている)
// 特記に文字を入れているときは行の黄色を残す
await temp.click(); await page.waitForTimeout(400);
const tk = page.locator(`#record-table tr[data-rv-pid="${p0}"] input[placeholder]`).last(); await tk.click(); await page.waitForTimeout(600); const s2 = await st(); const foc = await page.evaluate(() => document.activeElement && document.activeElement.tagName + ':' + (document.activeElement.placeholder || '').slice(0, 10));
console.log('tokki', JSON.stringify(s2), foc); r.tokkiKeepsRow = !s2.kp && s2.cur && !s2.amber;
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
