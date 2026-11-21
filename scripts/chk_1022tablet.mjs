// 2026-10-22 試験版: 縦向きのタブレット(1024px 未満)は 左のメニューを最初は閉じ・開くと本文の上に重ねて出す・画面を移ったら閉じる。タブレット・パソコンでは縮めない
//   ・iPad 縦(820): 最初は閉じている／開いても本文の幅は同じ(重ねて出す)／メニューで画面を移ると閉じる／縮めていない(zoom なし)・文字の真ん中 11px 以上
//   ・iPad 横(1180)・PC(1280): メニューは本文の横に並ぶ(本文の幅 = 画面 - 256)・縮めていない
//   ・横(1180)で開いたまま縦(820)に回すと閉じる
import { chromium } from 'playwright';
const PORT = process.argv[2] || '4173'; const r = {}; const b = await chromium.launch();
const open = async (W, H, view = 'dashboard', sb = null) => { const ctx = await b.newContext({ viewport: { width: W, height: H }, hasTouch: W < 1280, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 160)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  await page.evaluate(([v, sb]) => { if (sb !== null) localStorage.setItem('tsumugiSidebarOpen', sb); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: null, t: Date.now() })); }, [view, sb]);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 600 }).catch(() => {}); return { ctx, page }; };
const m = (page) => page.evaluate(() => { const sb = document.querySelector('[data-testid="app-sidebar"]'); const sr = sb.getBoundingClientRect(); const main = document.getElementById('appMainArea').getBoundingClientRect(); const sc = document.getElementById('tsuContentScroller'); const wr = sc && sc.firstElementChild; const z = wr ? (wr.style.zoom || '') : '';
  const fs = []; const tw = document.createTreeWalker(document.getElementById('appMainArea'), NodeFilter.SHOW_TEXT); let n; while ((n = tw.nextNode()) && fs.length < 3000) { const el = n.parentElement; if (!el || !n.textContent.trim()) continue; const rc = el.getBoundingClientRect(); if (!rc.width || rc.bottom < 0 || rc.top > innerHeight) continue; fs.push(parseFloat(getComputedStyle(el).fontSize)); } fs.sort((a, b) => a - b);
  return { sbVis: sr.right > 1 && getComputedStyle(sb).visibility !== 'hidden', sbPos: getComputedStyle(sb).position, sbW: Math.round(sr.width), mainL: Math.round(main.left), mainW: Math.round(main.width), zoom: z, fmed: fs[Math.floor(fs.length / 2)] || 0 }; });
for (const v of ['dashboard', 'record', 'transport']) {
  const { ctx, page } = await open(820, 1180, v, '1'); const a = await m(page); console.log('820', v, JSON.stringify(a));
  r[`p820_closed_${v}`] = !a.sbVis && a.mainW === 820 && !a.zoom && a.fmed >= 11; await ctx.close(); }
{ const { ctx, page } = await open(820, 1180, 'dashboard', '0'); await page.locator('header.tsu-app-header button').first().click(); await page.waitForTimeout(600); const a = await m(page); console.log('820 open', JSON.stringify(a));
  r.p820_overlay = a.sbVis && a.sbPos === 'fixed' && a.mainW === 820 && a.mainL === 0;
  await page.locator('[data-testid="app-sidebar"] button:visible', { hasText: /体力測定/ }).first().click(); await page.waitForTimeout(900); const c = await m(page); console.log('820 nav', JSON.stringify(c)); r.p820_navCloses = !c.sbVis; await ctx.close(); }
for (const [W, H] of [[1180, 820], [1280, 800]]) { const { ctx, page } = await open(W, H, 'record', '1'); const a = await m(page); console.log(W, JSON.stringify(a)); r[`docked_${W}`] = a.sbVis && a.sbPos !== 'fixed' && a.mainW === W - 256 && !a.zoom;
  if (W === 1180) { await page.setViewportSize({ width: 820, height: 1180 }); await page.waitForTimeout(900); const c = await m(page); console.log('rotate', JSON.stringify(c)); r.rotateCloses = !c.sbVis && c.mainW === 820; }
  await ctx.close(); }
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
