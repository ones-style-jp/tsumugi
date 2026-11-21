// 2026-10-22 試験版: 上の帯をアイコン＋短い文字(試し・この端末だけ)。オフは今までどおり。オンで提供記録の上の帯が何段になるか・写真
import { chromium } from 'playwright';
const PORT = process.argv[2] || '4173'; const r = {}; const b = await chromium.launch(); const OUT = '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad';
for (const [W, H, sb, tag] of [[1180, 820, '1', 'ipadL_menu'], [1180, 820, '0', 'ipadL'], [1512, 982, '1', 'mac14'], [1920, 1080, '1', 'w24']]) for (const on of ['0', 's', '1']) {
  const ctx = await b.newContext({ viewport: { width: W, height: H }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', deviceScaleFactor: 1 }); const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 160)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  await page.evaluate(([sb, on]) => { localStorage.setItem('tsumugiSidebarOpen', sb); localStorage.setItem('tsuIconBar', on); const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.systemSettings = d.systemSettings || {}; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), kobetsuKinouAddon: true }; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'record', pid: null, t: Date.now() })); }, [sb, on]);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2200); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 600 }).catch(() => {});
  const m = await page.evaluate(() => { const tb = document.querySelector('[data-testid="rec-toolbar"]'); const a = document.querySelector('[data-testid="rec-actions"]'); const d = tb.querySelector('input[type="date"]'); const btnW = [...a.children].filter(x => x.offsetParent).reduce((t, x) => t + x.getBoundingClientRect().width, 0); return { btnW: Math.round(btnW), h: Math.round(tb.getBoundingClientRect().height), oneRow: Math.abs(a.getBoundingClientRect().top - d.getBoundingClientRect().top) < 12, icon: !!tb.getAttribute('data-iconbar') }; });
  console.log(tag, 'icon', on, JSON.stringify(m)); r[`${tag}_${on}`] = m;
  const tb = await page.locator('[data-testid="rec-toolbar"]').boundingBox(); await page.screenshot({ path: `${OUT}/iconbar_${tag}_${on}.png`, clip: { x: 0, y: 0, width: W, height: Math.min(H, tb.y + tb.height + 8) } });
  await ctx.close(); }
await b.close();
