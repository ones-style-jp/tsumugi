// 2026-10-23: iPad 縦(820x1180)でサイドバーを開いたとき、各画面でサイドバーが最前面に来て押せるか(elementFromPoint で確かめる)
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4173'; })();
const VIEWS = (process.argv.find(a => a.startsWith('--views=')) || '--views=master,record,transport,diary,print,fitness,monitoring,settings,dash_personal,dash_operation,absence_fax,general_fax,schedule,class_roster,family_admin,dashboard').slice(8).split(',');
const b = await chromium.launch(); const r = {};
for (const view of VIEWS) {
  const ctx = await b.newContext({ viewport: { width: 820, height: 1180 }, locale: 'ja-JP', hasTouch: true }); const page = await ctx.newPage(); page.on('pageerror', e => console.log('PAGEERROR', view, e.message.slice(0, 120)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(600);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(600); }
  await page.evaluate((view) => { localStorage.setItem('tsumugiSidebarOpen', '1'); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view, pid: null, t: Date.now() })); }, view);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
  // ハンバーガー(≡)でサイドバーを開く
  const sbRect = await page.evaluate(() => { const a = document.querySelector('[data-testid="app-sidebar"]'); if (!a) return null; const b = a.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.width)]; });
  if (!sbRect || sbRect[0] !== 0 || sbRect[1] < 100) { await page.locator('header button, button').filter({ has: page.locator('svg.lucide-menu') }).first().click().catch(() => {}); }
  await page.waitForTimeout(700);
  const m = await page.evaluate(() => { const pts = [[120, 300], [120, 500], [120, 700]]; return pts.map(([x, y]) => { const e = document.elementFromPoint(x, y); if (!e) return 'none'; const sbEl = document.querySelector('[data-testid="app-sidebar"]'); const sb = !!(sbEl && sbEl.contains(e)); const t = (e.getAttribute('data-testid') || e.className || e.tagName).toString().slice(0, 60); return `${sb ? 'SIDEBAR' : 'OTHER'}:${t}`; }); });
  const open = await page.evaluate(() => { const a = document.querySelector('[data-testid="app-sidebar"]'); if (!a) return 'no-sidebar'; const b = a.getBoundingClientRect(); return `${Math.round(b.left)},${Math.round(b.width)}`; });
  console.log(view, 'aside', open, JSON.stringify(m)); r[view] = m.every(x => x.startsWith('SIDEBAR'));
  await ctx.close(); }
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
