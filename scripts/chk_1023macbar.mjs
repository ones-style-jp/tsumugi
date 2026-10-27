// 2026-10-23 試験版 trial394: MacBook 14インチ(1512px)でサイドバーを開いたままでも、提供記録の上の帯が1行(帯の幅で短い文字に)。閉じれば今までの文字で1行
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4173'; })();
const b = await chromium.launch(); const r = {};
for (const [sb, tag] of [['1', 'sidebarOpen'], ['0', 'sidebarClosed']]) {
  const ctx = await b.newContext({ viewport: { width: 1512, height: 982 }, locale: 'ja-JP' }); const page = await ctx.newPage(); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  await page.evaluate((sb) => { localStorage.setItem('tsumugiSidebarOpen', sb); const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.systemSettings = d.systemSettings || {}; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), kobetsuKinouAddon: true }; d.diarySettings = d.diarySettings || {}; d.diarySettings.staff = [...(d.diarySettings.staff || []), { id: 'k1', name: '見本 指導員', role: '機能訓練指導員' }]; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'record', pid: null, t: Date.now() })); }, sb);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 600 }).catch(() => {});
  const m = await page.locator('[data-testid="rec-toolbar"]').evaluate(e => ({ h: Math.round(e.getBoundingClientRect().height), w: e.clientWidth, icon: e.getAttribute('data-iconbar') || '' }));
  const order = await page.getByTestId('rec-order-btn').innerText();
  console.log(tag, JSON.stringify(m), 'order', JSON.stringify(order));
  r[`${tag}_oneRow`] = m.h < 80; r[`${tag}_mode`] = sb === '1' ? (m.icon === '1' && order === '') : (m.icon === '' && order === '');
  await page.screenshot({ path: `/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad/macbar_${tag}.jpg`, type: 'jpeg', quality: 60, clip: { x: 0, y: 0, width: 1512, height: 260 } });
  await ctx.close(); }
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
