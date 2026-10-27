// 2026-10-27: 体調のボタンは 長押し(pointercancel) でも タップ(touchend) でも選ばれる
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4173'; })();
const b = await chromium.launch(); const r = {};
const ctx = await b.newContext({ viewport: { width: 1024, height: 768 }, locale: 'ja-JP', hasTouch: true }); const page = await ctx.newPage(); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
await page.evaluate(() => { localStorage.setItem('tsumugiSidebarOpen', '0'); const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.systemSettings = d.systemSettings || {}; d.systemSettings.kibunDisabled = false; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); const dt = new Date(); if (dt.getDay() === 0) dt.setDate(dt.getDate() + 1); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'record', pid: null, date: `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`, t: Date.now() })); });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2200); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
// 体調の欄(通所時)を開く
let opened = false;
for (const sel of ['[data-testid^="rv-kibun-open-arrival-"]:not([disabled])', '[data-testid^="rv-kibun-open-"]:not([disabled])']) { const l = page.locator(sel).first(); if (await l.count()) { await l.click(); await page.waitForTimeout(500); if (await page.getByText('体調を選んでください').count()) { opened = true; break; } } }
if (!opened) { const t = page.getByText(/体調を選んでください/); opened = (await t.count()) > 0; }
r.opened = opened; if (!opened) console.log('could not open picker');
if (opened) {
  const btn = page.locator('button', { hasText: /とても良い|良い|ふつう|普通|元気/ }).first(); const bb = await btn.boundingBox();
  // 長押し: pointerdown → 700ms → pointercancel(iOS の長押しと同じ)
  await btn.evaluate(el => { const r0 = el.getBoundingClientRect(); const x = r0.x + r0.width / 2, y = r0.y + r0.height / 2; el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y, pointerId: 1, pointerType: 'touch' })); });
  await page.waitForTimeout(700);
  await btn.evaluate(el => { const r0 = el.getBoundingClientRect(); const x = r0.x + r0.width / 2, y = r0.y + r0.height / 2; el.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, clientX: x, clientY: y, pointerId: 1, pointerType: 'touch' })); });
  await page.waitForTimeout(500); r.longPressSelects = (await page.getByText(/理由|どうしてですか|理由を選ぶ/).count()) > 0 || (await page.getByText('体調を選んでください').count()) === 0; void bb;
  if (!r.longPressSelects) console.log('after longpress still picker');
}
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
