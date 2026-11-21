// 2026-10-28 深夜(試験版 trial453) ユーザー「個人ファイルも横じゃなくてサイドバーに」「検索で移った先を光らせる」
//   ①iPad(1180)・PC(1440): 個人ファイルを開くと左に縦のカテゴリ・上の横のタブは出ない・押すと右の中身が変わる・「+ カテゴリ追加」がある
//   ②スマホ: 今までどおり上に横のタブ(縦のカテゴリは出ない)
//   ③各種設定の検索で選ぶと、移った先の見出しの枠が光る(tsu-flash が付き、少したつと消える)
//   実行: node scripts/chk_1028pfnav.mjs [--port 4175]
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4175'; })();
const b = await chromium.launch(); const r = {};
const open = async (vp, view) => { const ctx = await b.newContext({ viewport: vp, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', ...(vp.width < 768 ? { hasTouch: true, isMobile: true } : {}) }); const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => d.accept());
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  await page.evaluate((v) => { localStorage.setItem('tsumugiSidebarOpen', '0'); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: null, t: Date.now() })); }, view);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
  return { ctx, page }; };
const openPF = async (page) => { await page.evaluate(() => { const el = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && /^要(介護|支援)\d$/.test((e.textContent || '').trim())); if (el) el.click(); }); await page.waitForTimeout(1200);
  await page.locator('button:visible', { hasText: /個人ファイル/ }).first().click(); await page.waitForTimeout(1200); return page.getByTestId('personal-file-modal').count(); };
for (const [k, vp] of [['ipad', { width: 1180, height: 820 }], ['pc', { width: 1440, height: 900 }]]) {
  const { ctx, page } = await open(vp, 'master'); const n = await openPF(page);
  const nv = await page.locator('[data-testid^="pf-vtab-"]:visible').count(); const hz = await page.locator('.pf-tabs-scroll').isVisible().catch(() => false);
  const t0 = (await page.getByTestId('pf-content').innerText()).slice(0, 40);
  const second = page.locator('[data-testid^="pf-vtab-"]:visible').nth(1); const nm = (await second.innerText()).trim(); await second.click(); await page.waitForTimeout(700);
  const t1 = (await page.getByTestId('pf-content').innerText()).slice(0, 40); const cur = (await page.locator('[data-testid^="pf-vtab-"][aria-current="page"]').innerText().catch(() => '')).trim();
  console.log(k, '個人ファイル', n, '縦', nv, '横', hz, '押した', nm, '→', cur, JSON.stringify(t1.slice(0, 20)));
  r[`${k}_pfVnav`] = n === 1 && nv >= 5 && !hz && cur === nm && t0 !== t1 && await page.locator('[data-testid="pf-vtabs"] button', { hasText: 'カテゴリ追加' }).isVisible();
  await ctx.close();
}
{ const { ctx, page } = await open({ width: 393, height: 820 }, 'master'); await page.locator('[data-testid="pin-master-list"] button, button', { hasText: /^要(介護|支援)/ }).first().click().catch(() => {}); const n = await openPF(page);
  r.phoneStrip = n === 1 && await page.locator('.pf-tabs-scroll').isVisible() && (await page.locator('[data-testid^="pf-vtab-"]:visible').count()) === 0; console.log('スマホ', r.phoneStrip);
  await ctx.close(); }
{ const { ctx, page } = await open({ width: 1180, height: 820 }, 'settings');
  await page.getByTestId('settings-search-input').fill('端末名'); await page.waitForTimeout(300); await page.getByTestId('settings-search-hit-0').dispatchEvent('mousedown');
  let seen = false; for (let i = 0; i < 20; i++) { await page.waitForTimeout(100); if (await page.locator('.tsu-flash[data-sec-title]').count()) { seen = true; break; } }
  await page.waitForTimeout(2200); const gone = (await page.locator('.tsu-flash').count()) === 0; const t = await page.locator('[data-sec-title]').evaluateAll(els => els.map(e => e.getAttribute('data-sec-title')));
  console.log('光る', seen, '消える', gone); r.searchFlash = seen && gone;
  await ctx.close(); }
await b.close();
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
