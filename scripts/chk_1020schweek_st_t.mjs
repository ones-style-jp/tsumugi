// 安定版: スマホでスケジュールの週表示が画面の幅に収まる(はみ出し・横スクロールなし)・予定の件名が読める
import { chromium } from 'playwright';
const OUT = '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad';
const PORT = process.env.PORT || 4174; const b = await chromium.launch(); const r = {};
const today = new Date(); const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
for (const W of [390, 440, 1280]) {
  const page = await (await b.newContext({ viewport: { width: W, height: 900 }, ...(W < 800 ? { isMobile: true, hasTouch: true } : {}), locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
  page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  await page.evaluate((iso) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.scheduleEvents = [{ id: 'e1', date: iso, start: '09:00', end: '10:00', title: 'かかりつけ医受診', color: '#f59e0b' }]; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'schedule', pid: null, t: Date.now() })); }, iso);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
  await page.locator('button', { hasText: /^週$/ }).first().click(); await page.waitForTimeout(600);
  const m = await page.evaluate(() => { const ev = [...document.querySelectorAll('div[title]')].find(e => /かかりつけ医受診/.test(e.title)); const scrollers = [...document.querySelectorAll('*')].filter(e => { const cs = getComputedStyle(e); return (cs.overflowX === 'auto' || cs.overflowX === 'scroll') && e.scrollWidth > e.clientWidth + 1; }).length; const right = Math.max(...[...document.querySelectorAll('div')].filter(e => e.closest('[style*="grid-template-columns"]')).map(e => e.getBoundingClientRect().right)); return { scrollers, right, evText: ev ? ev.innerText.replace(/\n/g, '/') : '' }; });
  r[`fits_${W}`] = m.scrollers === 0 && m.right <= W + 1; r[`event_${W}`] = /かかりつけ医/.test(m.evText.replace(/\//g, ''));
  if (!r[`fits_${W}`]) console.log(W, m);
  await page.screenshot({ path: `${OUT}/st_week_${W}.png` }); await page.context().close();
}
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
