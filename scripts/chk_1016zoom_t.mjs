import { chromium } from 'playwright';
// PC のブラウザ拡大(125%・150%・200%)を 中の幅・外の幅・devicePixelRatio で再現し、画面の縮小(zoom)がどうなるか
const b = await chromium.launch();
const run = async (label, cssW, outerW, dpr, view) => {
  const ctx = await b.newContext({ viewport: { width: cssW, height: 760 }, deviceScaleFactor: dpr, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
  await ctx.addInitScript((ow) => { Object.defineProperty(window, 'outerWidth', { get: () => ow }); }, outerW);
  const page = await ctx.newPage(); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.goto('http://localhost:4185/', { waitUntil: 'networkidle' }); await page.waitForTimeout(600);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(600); }
  await page.evaluate((v) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: null, t: Date.now() })), view);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 400 }).catch(() => {});
  const r = await page.evaluate(() => { const sc = document.getElementById('tsuContentScroller'); const c = sc && sc.firstElementChild; const cs = c ? getComputedStyle(c) : null;
    return { inner: innerWidth, outer: outerWidth, dpr: devicePixelRatio, zoom: c ? c.style.zoom : null, width: c ? c.style.width : null, scW: sc ? sc.clientWidth : 0, scSW: sc ? sc.scrollWidth : 0, mobile: !!document.querySelector('[data-testid="app-sidebar"]') ? 'pc' : '?' }; });
  // 見た目の大きさ = ブラウザの拡大率 × 画面の縮小
  const z = r.zoom ? parseFloat(r.zoom) : 1; console.log(label.padEnd(26), JSON.stringify(r), '見た目', (outerW / cssW * z).toFixed(2));
  await page.screenshot({ path: `/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad/zoom_${label.replace(/[^a-z0-9]/gi,'_')}.png` });
  await ctx.close();
};
// 1366px のノートPC(枠16px)
await run('100 record', 1366, 1382, 1, 'record');
await run('125 record', 1093, 1382, 1.25, 'record');
await run('150 record', 911, 1382, 1.5, 'record');
await run('125 transport', 1093, 1382, 1.25, 'transport');
// サイドパネルで外の幅が広いだけ(拡大なし) → 使わない
await run('sidepanel 100 record', 1046, 1382, 1, 'record');
// Mac(倍率2)で 125%
await run('mac125 record', 1152, 1440, 2.5, 'record');
await b.close();
