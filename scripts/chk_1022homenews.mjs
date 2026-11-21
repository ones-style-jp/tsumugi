// 2026-10-22 試験版: ホームの「お知らせ」はハイライトなし(白い行)・件数はスマホ5件/タブレット・パソコン10件(家族・ケアマネからの更新も)
import { chromium } from 'playwright';
const PORT = process.argv[2] || '4173'; const r = {}; const b = await chromium.launch();
for (const [W, H, want, tag] of [[1180, 820, 10, 'ipad'], [390, 844, 5, 'phone']]) {
  const ctx = await b.newContext({ viewport: { width: W, height: H }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', ...(W < 768 ? { isMobile: true, hasTouch: true } : {}) }); const page = await ctx.newPage(); page.on('dialog', d => d.accept());
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.familyAnnouncements = []; const now = Date.now();
    for (let i = 0; i < 14; i++) d.familyAnnouncements.push({ id: `tst_ann_${i}`, title: `見本のお知らせ ${i + 1}`, body: '見本', date: '2026-10-' + String(1 + i).padStart(2, '0'), postedAt: new Date(now - i * 3600e3).toISOString(), target: 'all' });
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'dashboard', pid: null, t: Date.now() })); });
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 600 }).catch(() => {});
  const rows = page.locator('[data-testid="home-news-row"]'); const n = await rows.count();
  const bg = n ? await rows.first().evaluate(e => getComputedStyle(e).backgroundColor) : '';
  console.log(tag, 'rows', n, bg); r[`count_${tag}`] = n === want; r[`white_${tag}`] = bg === 'rgb(255, 255, 255)';
  await page.screenshot({ path: `/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad/homenews_${tag}.png`, fullPage: W < 768 });
  await ctx.close(); }
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
