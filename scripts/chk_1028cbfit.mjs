// 2026-10-28 連絡帳: タブレット・パソコンで、1枚(名前〜次回お迎え時間)がスクロールせずに画面に入る大きさに縮める(0.5倍まで)
//   iPad 横(1180×820・1024×768)・iPad 縦(820×1180)・パソコン(1366×768・1920×1080)で、1枚目の用紙の上下が画面の中にあるか
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4173'; })();
const OUT = (() => { const i = process.argv.indexOf('--out'); return i >= 0 ? process.argv[i + 1] : ''; })();
const b = await chromium.launch(); const r = {};
for (const [w, h, touch] of [[1180, 820, true], [1024, 768, true], [820, 1180, true], [1366, 768, false], [1920, 1080, false]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', hasTouch: touch }); const page = await ctx.newPage(); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  await page.evaluate(() => { localStorage.setItem('tsumugiSidebarOpen', '0'); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'print', pid: null, t: Date.now() })); }); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
  await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
  const m = await page.evaluate(() => { const list = document.querySelector('[data-testid="cb-list"]'); const item = list && list.querySelector('.tsu-cb-item'); const box = item && item.firstElementChild; const bar = document.querySelector('.tsu-cb-bar');
    if (!box) return null; const rb = box.getBoundingClientRect(); const items = [...list.querySelectorAll('.tsu-cb-item')].slice(0, 2).map(x => Math.round(x.firstElementChild.getBoundingClientRect().top));
    const nx = [...box.querySelectorAll('*')].find(e => /次回お迎え時間/.test(e.textContent || '') && e.children.length === 0); const rn = nx ? nx.getBoundingClientRect() : null;
    return { sc: Number(list.getAttribute('data-cb-scale')), top: Math.round(rb.top), bottom: Math.round(rb.bottom), barBottom: bar ? Math.round(bar.getBoundingClientRect().bottom) : 0, vh: window.innerHeight, nextVisible: !!rn && rn.bottom <= window.innerHeight, twoCols: items.length === 2 && items[0] === items[1] }; });
  const k = `${w}x${h}`; r[k] = !!m && m.bottom <= m.vh && m.top >= m.barBottom && m.nextVisible && m.sc >= 0.5 && m.sc <= 1; console.log(k, JSON.stringify(m));
  if (OUT) await page.screenshot({ path: `${OUT}/cbfit_${k}.png` });
  await ctx.close(); }
await b.close();
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); process.exit(Object.values(r).every(Boolean) ? 0 : 1);
