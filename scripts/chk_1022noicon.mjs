// 2026-10-22 夕(ユーザー指示「アイコンは無しでいい」): 上の帯の「アイコン＋短い文字」をやめた。
//   前に選んでいた端末(tsuIconBar='1')は「短い文字だけ」と同じ見た目(幅・高さが同じ・アイコンが無い)。設定の選択肢は2つ。
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4173'; })();
const b = await chromium.launch(); const r = {}; const res = {};
for (const on of ['s', '1']) {
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage();
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  await page.evaluate((on) => { localStorage.setItem('tsumugiSidebarOpen', '0'); localStorage.setItem('tsuIconBar', on); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'record', pid: null, t: Date.now() })); }, on);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2200); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 600 }).catch(() => {});
  res[on] = await page.evaluate(() => { const a = document.querySelector('[data-testid="rec-actions"]'); const tb = document.querySelector('[data-testid="rec-toolbar"]'); return { w: Math.round([...a.children].filter(x => x.offsetParent).reduce((t, x) => t + x.getBoundingClientRect().width, 0)), h: Math.round(tb.getBoundingClientRect().height), svg: a.querySelectorAll('button svg').length }; });
  if (on === '1') { await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'settings', pid: null, t: Date.now() }))); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800);
    await page.locator('button', { hasText: /^システム$/ }).first().click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(800);
    res.opts = await page.evaluate(() => { const box = document.querySelector('[data-testid="set-iconbar"]'); return box ? [...box.querySelectorAll('label')].map(l => l.textContent.trim()) : null; }); }
  await ctx.close(); }
console.log(JSON.stringify(res));
r.sameWidth = res.s.w === res['1'].w; r.sameHeight = res.s.h === res['1'].h; r.noIconWhenOld = res['1'].svg === res.s.svg;
r.twoOptions = !res.opts || (res.opts.length === 2 && !res.opts.some(t => /アイコン/.test(t)));
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
