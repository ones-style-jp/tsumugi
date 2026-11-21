// 2026-10-27 iPad のホーム画面のアプリで上の帯がかすむ件(iPadOS 26〜 の上端のぼかし): index.html の見えない帯(tsu-edge-band)
//   ・ホーム画面のアプリ(navigator.standalone)× iPhone/iPad × 幅768px以上 のときだけ出る(スマホ幅・Safari のタブ・パソコンは出ない)
//   ・WebKit の判定(上端の中央・上から4px の所の fixed の箱・幅9割以上・高さ10px超・不透明の背景色)を満たす(押す扱いを無視して一番上がこの帯)
//   ・見た目は変わらない(帯あり/なしの上端の画素が同じ)・押すと下(メニューのボタン)に通る・サイドバーや小窓を開いても一番上のまま
import { webkit as chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4173'; })();
const b = await chromium.launch(); const r = {};
const IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
async function open(vp, ua, standalone, view = 'record') {
  const ctx = await b.newContext({ viewport: vp, locale: 'ja-JP', hasTouch: !!ua, isMobile: !!ua, ...(ua ? { userAgent: ua } : {}) });
  if (standalone) await ctx.addInitScript(() => { try { Object.defineProperty(navigator, 'standalone', { get: () => true }); } catch {} });
  const page = await ctx.newPage(); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => d.accept());
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
  await page.evaluate((v) => { sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: null, t: Date.now() })); }, view);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2200); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
  return { ctx, page };
}
const bandInfo = (page) => page.evaluate(() => { const el = document.querySelector('.tsu-edge-band'); if (!el) return null; const cs = getComputedStyle(el); const rc = el.getBoundingClientRect();
  return { cls: document.documentElement.classList.contains('tsu-ios-app'), display: cs.display, position: cs.position, top: rc.top, left: rc.left, width: rc.width, height: rc.height, vw: window.innerWidth, bg: cs.backgroundColor, z: cs.zIndex, pe: cs.pointerEvents, first: document.body.firstElementChild === el }; });
// WebKit の判定のまね: 押す扱いを無視して(一時的に auto)上端の中央・上から4px の一番上の要素
const topAtSample = (page) => page.evaluate(() => { const el = document.querySelector('.tsu-edge-band'); const prev = el.style.pointerEvents; el.style.pointerEvents = 'auto';
  const hit = document.elementFromPoint(window.innerWidth / 2, 4); el.style.pointerEvents = prev; return hit === el; });
const webkitOk = (i) => !!i && i.display === 'block' && i.position === 'fixed' && i.top === 0 && i.left === 0 && i.width >= i.vw * 0.9 && i.height > 10 && i.bg === 'rgb(255, 255, 255)' && i.z === '2147483647' && i.pe === 'none' && i.first;
// 1) iPad 横・ホーム画面のアプリ
{ const { ctx, page } = await open({ width: 1180, height: 820 }, IPAD_UA, true);
  const i = await bandInfo(page); r.ipadBand = i && i.cls && webkitOk(i); if (!r.ipadBand) console.log('ipad', i);
  r.ipadTopmost = await topAtSample(page);
  // 見た目が変わらない
  const clip = { x: 0, y: 0, width: 1180, height: 60 };
  const a = await page.screenshot({ clip }); await page.evaluate(() => { document.querySelector('.tsu-edge-band').style.display = 'none'; }); const c = await page.screenshot({ clip }); await page.evaluate(() => { document.querySelector('.tsu-edge-band').style.display = ''; });
  r.invisible = a.equals(c);
  // 押すと下に通る: 上から6px の所でメニューのボタンを押せる
  const btn = page.locator('header.tsu-app-header button').first(); const bb = await btn.boundingBox();
  const w0 = await page.getByTestId('app-sidebar').evaluate(el => Math.round(el.getBoundingClientRect().width));
  const under = await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return !!(el && el.closest('header.tsu-app-header')); }, [bb.x + bb.width / 2, 6]);
  await page.mouse.click(bb.x + bb.width / 2, Math.max(6, bb.y + 2)); await page.waitForTimeout(800);
  const w1 = await page.getByTestId('app-sidebar').evaluate(el => Math.round(el.getBoundingClientRect().width));
  r.tapThrough = under && w0 !== w1; if (!r.tapThrough) console.log('tap', under, w0, w1, bb);
  await ctx.close(); }
// 2) iPad 縦・サイドバーを開いても一番上
{ const { ctx, page } = await open({ width: 820, height: 1180 }, IPAD_UA, true);
  await page.locator('header.tsu-app-header button').first().click(); await page.waitForTimeout(700);
  r.portraitSidebarTop = webkitOk(await bandInfo(page)) && await topAtSample(page);
  await ctx.close(); }
// 3) ホームの画面(ほかの画面)でも出る
{ const { ctx, page } = await open({ width: 1180, height: 820 }, IPAD_UA, true, 'dashboard'); r.homeBand = webkitOk(await bandInfo(page)) && await topAtSample(page); await ctx.close(); }
// 4) 出さない: スマホ縦(上の帯が fixed の白で、もともとぼかされない)・iPad の Safari のタブ・パソコン
{ const { ctx, page } = await open({ width: 390, height: 844 }, IPHONE_UA, true); const i = await bandInfo(page); r.phoneNone = !!i && i.cls && i.display === 'none'; await ctx.close(); }
{ const { ctx, page } = await open({ width: 1180, height: 820 }, IPAD_UA, false); const i = await bandInfo(page); r.safariTabNone = !!i && !i.cls && i.display === 'none'; await ctx.close(); }
{ const { ctx, page } = await open({ width: 1280, height: 900 }, null, false); const i = await bandInfo(page); r.pcNone = !!i && !i.cls && i.display === 'none'; await ctx.close(); }
// 5) スマホ横(844px・上の帯が fixed でない幅)では出る
{ const { ctx, page } = await open({ width: 844, height: 390 }, IPHONE_UA, true); r.phoneLandscapeBand = webkitOk(await bandInfo(page)); await ctx.close(); }
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
