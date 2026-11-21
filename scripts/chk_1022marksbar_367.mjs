// 2026-10-22 試験版: 提供記録の上の帯で「印 ○名・外す」が個別機能訓練の右・右のボタンの左にある(iPad横・14インチ・24インチ)
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4187'; })();
const b = await chromium.launch(); const r = {};
for (const [W, H] of [[1180, 820], [1512, 982], [1920, 1080]]) {
  const ctx = await b.newContext({ viewport: { width: W, height: H }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept());
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.systemSettings = d.systemSettings || {}; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), kobetsuKinouAddon: true }; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'record', pid: null, t: Date.now() })); });
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
  const bb = async (id) => { const l = page.getByTestId(id); return (await l.count()) ? l.first().boundingBox() : null; };
  const k = await bb('kinou-box'), m = await bb('rv-marks-bar'), a = await bb('rec-actions');
  console.log(W, JSON.stringify({ k: k && [Math.round(k.x), Math.round(k.x + k.width)], m: m && [Math.round(m.x), Math.round(m.x + m.width)], a: a && [Math.round(a.x), Math.round(a.y)], my: m && Math.round(m.y) }));
  r[`order_${W}`] = !!(k && m && a) && k.x + k.width <= m.x + 1 && Math.abs(k.y - m.y) < 5 && (m.x + m.width <= a.x + 1 || a.y > m.y + 5); // 右のボタンが2段目に回るときは段で見る
  await page.screenshot({ path: `/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad/marksbar_${W}.png`, clip: { x: 0, y: 0, width: W, height: 160 } });
  await ctx.close(); }
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
