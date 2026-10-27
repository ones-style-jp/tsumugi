// 2026-10-21 試験版: 連絡帳は広い画面で用紙を横に並べる(24インチ=2列・27インチ=3列・14インチ=1列・スマホは今までどおり)
//   ご家族・ケアマネの画面の分析(個人)も幅いっぱい(職員の「家族・ケアマネ画面プレビュー」→通所記録 で確かめる)
import { chromium } from 'playwright';
const b = await chromium.launch(); const r = {};
const open = async (W, H, view, ss = {}) => { const ctx = await b.newContext({ viewport: { width: W, height: H }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 160)));
  await page.goto('http://localhost:4185/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  await page.evaluate(([v, ss]) => { sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: null, t: Date.now() })); for (const [k, val] of Object.entries(ss)) sessionStorage.setItem(k, val); }, [view, ss]);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2200); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 600 }).catch(() => {}); return { ctx, page }; };
const cols = (page) => page.evaluate(() => { const items = [...document.querySelectorAll('[data-testid="cb-list"] > .tsu-cb-item')]; if (!items.length) return { n: 0, perRow: 0 }; const t0 = Math.round(items[0].getBoundingClientRect().top); return { n: items.length, perRow: items.filter(e => Math.abs(Math.round(e.getBoundingClientRect().top) - t0) <= 2).length }; });
for (const [W, H, tag, want] of [[1512, 982, 'mac14', 1], [1920, 1080, 'w24', 2], [2560, 1440, 'w27', 3]]) {
  const { ctx, page } = await open(W, H, 'print'); const c = await cols(page); console.log('cb', tag, JSON.stringify(c)); r[`cb_${tag}`] = c.n >= want && c.perRow === Math.min(want, c.n); await ctx.close(); }
{ const { ctx, page } = await open(390, 844, 'print'); r.cbPhone = (await page.getByTestId('renraku-phone-list').count()) === 1; await ctx.close(); }
// ご家族・ケアマネの画面(プレビュー)の分析
const pid = await (async () => { const { ctx, page } = await open(1920, 1080, 'dashboard'); const id = await page.evaluate(() => (JSON.parse(localStorage.getItem('daycareAppData_v3')).patients || []).find(p => p.status === '利用中').id); await ctx.close(); return id; })();
for (const kind of ['family', 'caremanager']) {
  const { ctx, page } = await open(1920, 1080, 'family_admin', { tsumugiPreviewJump: JSON.stringify({ pid, kind }) });
  await page.locator('button:visible', { hasText: /^通所記録$/ }).first().click().catch(() => console.log('no records tab')); await page.waitForTimeout(1800);
  const w = await page.evaluate(() => { const el = document.getElementById('print-content-analysis'); const sc = document.getElementById('tsuContentScroller'); return el ? { w: Math.round(el.getBoundingClientRect().width), sc: sc ? sc.clientWidth : 0 } : null; });
  console.log('preview', kind, JSON.stringify(w)); r[`wide_${kind}`] = !!w && w.w >= 1300; await ctx.close(); }
console.log(r, Object.values(r).every(v => v === true) ? 'PASS' : 'FAIL'); await b.close();
