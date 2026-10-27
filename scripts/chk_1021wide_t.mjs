// 2026-10-21 画面の横幅(試験版)  ※10/21 夜に「タブレットから幅いっぱい」へ変更(以前は 1680px 以上だけ広げていた)
//  iPad 11インチ(1194px)・MacBook 14インチ(1512px)・24インチ(1920px)で、ホーム・分析(稼働)・分析(個人)の利用者一覧と本体が画面の幅いっぱい(左右の空き 各40px 以下)
//  入力の画面(各種設定)は 1280px まで。スマホ(390px)は今までどおり
//  分析(稼働)・分析(個人)のダウンロードは 1194px と 1920px で同じ紙(グラフの viewBox・表の数が同じ)。終わると広い幅に戻る
//  クラス在籍表は横いっぱい・文字13px以上。スマホは16px・印刷の表は100%
import { chromium } from 'playwright';
const b = await chromium.launch(); const r = {};
const open = async (W, H, view, ex = {}) => { const ctx = await b.newContext({ viewport: { width: W, height: H }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 160)));
  await page.goto('http://localhost:4185/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  await page.evaluate(([v, ex]) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: null, date: null, t: Date.now(), ...ex })), [view, ex]);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1600); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 600 }).catch(() => {}); return { ctx, page }; };
// 中身の箱の幅と、置き場所(tsuContentScroller)の幅
const fill = (page, sel) => page.evaluate((sel) => { const el = document.querySelector(sel); const sc = document.getElementById('tsuContentScroller'); if (!el || !sc) return null; const a = el.getBoundingClientRect(), s = sc.getBoundingClientRect(); return { w: Math.round(a.width), sc: Math.round(sc.clientWidth), left: Math.round(a.left - s.left), right: Math.round(s.left + sc.clientWidth - a.right) }; }, sel);
const full = (m) => !!m && m.left <= 40 && m.right <= 40;
const vbOf = (ph) => [...ph.matchAll(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/g)].map(m => Math.round(Number(m[1])));
const capture = (page) => page.evaluate(() => { window.__ph = ''; window.addEventListener('setPrintHtml', e => { window.__ph = (e.detail && e.detail.html) || ''; }, { once: true }); });
const opsPrint = async (page) => { await capture(page); await page.locator('#tsuContentScroller button:visible', { hasText: /^ダウンロード$/ }).first().click(); await page.waitForTimeout(400); await page.locator('button:visible', { hasText: /^ダウンロード/ }).last().click(); await page.waitForTimeout(4000); const ph = await page.evaluate(() => window.__ph); return { tables: (ph.match(/<table/g) || []).length, vb: vbOf(ph) }; };
const perPrint = async (page) => { await capture(page); await page.evaluate(() => { const t = document.getElementById('personal-print-hidden-trigger'); if (t) t.click(); }); for (let i = 0; i < 40; i++) { await page.waitForTimeout(500); if (await page.evaluate(() => !!window.__ph)) break; } const ph = await page.evaluate(() => window.__ph); return { len: ph.length, vb: vbOf(ph) }; };
const pid = await (async () => { const { ctx, page } = await open(1194, 834, 'dashboard'); const id = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); return (d.patients || []).find(p => p.status === '利用中').id; }); await ctx.close(); return id; })();
const prints = {};
for (const [W, H, tag] of [[1194, 834, 'ipad11'], [1512, 982, 'mac14'], [1920, 1080, 'w24']]) {
  { const { ctx, page } = await open(W, H, 'dashboard'); const m = await fill(page, '.tsu-wide'); r[`home_${tag}`] = full(m); if (!full(m)) console.log('home', tag, JSON.stringify(m)); await ctx.close(); }
  { const { ctx, page } = await open(W, H, 'dash_operation'); const m = await fill(page, '#print-content-operation'); r[`ops_${tag}`] = full(m); if (!full(m)) console.log('ops', tag, JSON.stringify(m));
    if (tag !== 'mac14') { prints[`ops_${tag}`] = await opsPrint(page); await page.keyboard.press('Escape').catch(() => {}); await page.locator('button:visible', { hasText: /^(閉じる|×|✕)$/ }).last().click().catch(() => {}); await page.waitForTimeout(1200); const m2 = await fill(page, '#print-content-operation'); r[`opsBack_${tag}`] = full(m2); }
    await ctx.close(); }
  { const { ctx, page } = await open(W, H, 'dash_personal'); const m = await fill(page, '.tsu-wide'); r[`perList_${tag}`] = full(m); if (!full(m)) console.log('perList', tag, JSON.stringify(m)); await ctx.close(); }
  { const { ctx, page } = await open(W, H, 'dash_personal', { pid }); await page.waitForTimeout(800); const m = await fill(page, '#print-content-analysis'); r[`perBody_${tag}`] = full(m); if (!full(m)) console.log('perBody', tag, JSON.stringify(m));
    if (tag !== 'mac14') { prints[`per_${tag}`] = await perPrint(page); await page.waitForTimeout(1200); const m2 = await fill(page, '#print-content-analysis'); r[`perBack_${tag}`] = full(m2); }
    await ctx.close(); }
  { const { ctx, page } = await open(W, H, 'settings'); const m = await fill(page, '.tsu-wide-f'); r[`settings_${tag}`] = !!m && m.w <= 1281 && (m.w >= 1200 || (m.left <= 40 && m.right <= 40)); if (!r[`settings_${tag}`]) console.log('settings', tag, JSON.stringify(m)); await ctx.close(); }
}
console.log('prints', JSON.stringify(prints));
r.opsPrintSame = prints.ops_ipad11.vb.length > 0 && JSON.stringify(prints.ops_ipad11.vb) === JSON.stringify(prints.ops_w24.vb) && prints.ops_ipad11.tables === prints.ops_w24.tables;
r.perPrintSame = prints.per_ipad11.vb.length > 0 && JSON.stringify(prints.per_ipad11.vb) === JSON.stringify(prints.per_w24.vb);
// スマホ: ホームは画面の幅のまま(はみ出さない)・クラス在籍表は16px
{ const { ctx, page } = await open(390, 844, 'dashboard'); const w = await page.evaluate(() => { const el = document.querySelector('.tsu-wide'); return el ? Math.round(el.getBoundingClientRect().width) : 0; }); r.homePhone = w > 0 && w <= 390; await ctx.close(); }
{ const { ctx, page } = await open(1920, 1080, 'class_roster'); const m = await page.evaluate(() => { const sc = document.querySelector('[data-testid="cr-scroll"]'); const t = document.querySelector('[data-testid="cr-am"]'); const R0 = sc.getBoundingClientRect(), T = t.getBoundingClientRect(); return { gap: Math.round(R0.right - T.right), fs: parseFloat(getComputedStyle(t).fontSize), sw: sc.scrollWidth, cw: sc.clientWidth }; });
  r.roster1920Fill = m.gap <= 40 && m.sw <= m.cw + 1; r.roster1920Font = m.fs >= 13;
  const pr = await page.evaluate(() => { const t = document.querySelector('#print-content-classroster table'); return t ? t.style.width : ''; }); r.rosterPrint = pr === '100%'; await ctx.close(); }
{ const { ctx, page } = await open(390, 844, 'class_roster'); const fs = await page.evaluate(() => { const t = document.querySelector('[data-testid="cr-am"]'); return t ? parseFloat(getComputedStyle(t).fontSize) : 0; }); r.rosterPhone = fs === 16; await ctx.close(); }
console.log(r, Object.values(r).every(v => v === true) ? 'PASS' : 'FAIL'); await b.close();
