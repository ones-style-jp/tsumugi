// 2026-10-23 試験版: iPad 第8世代(横1080px)とメニュー付き(1024px)で、提供記録の上の帯が1行(印を付けても・グループを上に表示中でも)。1366pxは今までの文字
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4173'; })();
const b = await chromium.launch(); const r = {};
for (const [W, tag] of [[1080, 'ipad8'], [1024, 'w1024'], [1366, 'pc']]) {
  const ctx = await b.newContext({ viewport: { width: W, height: 810 }, locale: 'ja-JP', hasTouch: true }); const page = await ctx.newPage();
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  await page.evaluate(() => { localStorage.setItem('tsumugiSidebarOpen', '0'); const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.systemSettings = d.systemSettings || {}; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), kobetsuKinouAddon: true }; d.diarySettings = d.diarySettings || {}; d.diarySettings.staff = [...(d.diarySettings.staff || []), { id: 'k1', name: '見本 指導員', role: '機能訓練指導員' }]; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'record', pid: null, date: (() => { const d = new Date(); if (d.getDay() === 0) d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })(), t: Date.now() })); });
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2200); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 600 }).catch(() => {});
  const h0 = await page.locator('[data-testid="rec-toolbar"]').evaluate(e => Math.round(e.getBoundingClientRect().height));
  // 名前を長押し(タッチ)で印
  const cell = page.locator('#record-table tr[data-rv-pid] td').first(); const bb = await cell.boundingBox();
  const cdp = await ctx.newCDPSession(page); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bb.x + 30, y: bb.y + 20 }] }); await page.waitForTimeout(800); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(500);
  const marks = await page.locator('[data-testid="rv-marks-bar"]').evaluate(e => e.style.visibility);
  const h1 = await page.locator('[data-testid="rec-toolbar"]').evaluate(e => Math.round(e.getBoundingClientRect().height));
  const order = await page.getByTestId('rec-order-btn').innerText();
  console.log(tag, 'h', h0, '→', h1, 'marks', marks, 'order', JSON.stringify(order));
  r[`${tag}_oneRow`] = h0 < 80 && h1 < 80; r[`${tag}_label`] = order === '' /* trial401: 幅に関係なくアイコン */;
  if (tag === 'ipad8') { r.marksShown = marks === 'visible'; await page.screenshot({ path: '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad/ipadbar.jpg', type: 'jpeg', quality: 60, clip: { x: 0, y: 0, width: W, height: 300 } }); }
  await ctx.close(); }
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
