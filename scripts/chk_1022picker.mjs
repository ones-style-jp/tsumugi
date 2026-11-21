// 2026-10-22 試験版:「こんにちは、どなたですか？」を画面の幅いっぱいに(以前は600px)。iPad横・24インチ・スマホで幅と1列の名前の数
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4173'; })();
const b = await chromium.launch(); const r = {};
for (const [W, H, tag] of [[1180, 820, 'ipad'], [1920, 1080, 'w24'], [390, 844, 'phone']]) {
  const ctx = await b.newContext({ viewport: { width: W, height: H }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage();
  await page.goto(`http://localhost:${PORT}/#picker`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
  const m = await page.evaluate(() => { const w = document.querySelector('[data-testid="picker-wrap"]'); if (!w) return null; const btns = [...w.querySelectorAll('button')].filter(x => x.offsetParent && x.getBoundingClientRect().height > 50); const tops = btns.map(x => Math.round(x.getBoundingClientRect().top)); const first = tops.length ? tops.filter(t => t === tops[0]).length : 0; return { w: Math.round(w.getBoundingClientRect().width), vw: innerWidth, perRow: first, sx: document.documentElement.scrollWidth > innerWidth + 1 }; });
  console.log(tag, JSON.stringify(m)); r[`${tag}_wide`] = !!m && m.w >= m.vw - 60; r[`${tag}_noHscroll`] = !!m && !m.sx;
  await page.screenshot({ path: `/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad/picker_${tag}.jpg`, type: 'jpeg', quality: 55 });
  await ctx.close(); }
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
