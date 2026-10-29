// 2026-10-29 ユーザー報告「iPad でサイドバーから項目を選んだとき、画面がビクッとずれて、また戻る」
//   画面の切り替え・サイドバーの開け閉めのたびに、0.3〜0.5秒後に「本文を消して描き直す」「アプリ全体の大きさを1px変える」「表示設定(拡大の上限)を切り替える」をしていた。
//   iPad の名乗りの WebKit で、ログイン直後の描き直し(白く残る対策・残す)が終わってから、サイドバーで3つの画面を移り、その間に
//   アプリ全体(.tsu-app-root)・本文(#appMainArea)の style の書き換えと、表示設定(meta viewport)の書き換えが起きないか
//   ①縦(810×1080・メニューを重ねて出す) ②横(1080×810・並べて出す)。--base を付けると直す前のビルドの数も出す(比べるだけ)
//   実行: node scripts/chk_1029navsmooth.mjs [--port 4175] [--base 4173]
import { webkit } from 'playwright';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const PORT = arg('--port', '4175'), BASE = arg('--base', '');
const UA = 'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
const r = {};
const run = async (port, vp) => {
  const b = await webkit.launch(); const ctx = await b.newContext({ viewport: vp, screen: vp, userAgent: UA, hasTouch: true, isMobile: true, deviceScaleFactor: 1, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept());
  await page.addInitScript(() => { window.__rp = { root: 0, main: 0, meta: 0 };
    const start = () => { const mo = new MutationObserver(ms => ms.forEach(m => { const t = m.target; if (!(t instanceof Element)) return;
        if (t.matches && t.matches('meta[name="viewport"]')) window.__rp.meta++; else if (t.classList && t.classList.contains('tsu-app-root')) window.__rp.root++; else if (t.id === 'appMainArea') window.__rp.main++; }));
      mo.observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ['style', 'content'] }); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start(); });
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  await page.evaluate(() => { localStorage.setItem('tsumugiSidebarOpen', '1'); sessionStorage.setItem('tsumugiActiveRecorder', JSON.stringify({ id: 'demo_rec', name: '見本 職員', roleLabel: '介護職員' })); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'dashboard', pid: null, t: Date.now() })); });
  await page.reload({ waitUntil: 'networkidle' }); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 1500 }).catch(() => {});
  await page.waitForTimeout(7500); // ログイン直後の描き直し(0.4/1.3/3/6秒)が終わるまで
  const before = await page.evaluate(() => ({ ...window.__rp }));
  const openSide = async () => { const vis = await page.locator('aside:visible, nav:visible').filter({ hasText: '連絡帳' }).count(); if (!vis || vp.width < 1024) { const it = page.getByText('連絡帳', { exact: true }).first(); if (!(await it.isVisible().catch(() => false))) { await page.locator('header button').first().click(); await page.waitForTimeout(450); } } };
  const items = ['サービス提供記録 入力', '連絡帳', '日誌']; const went = [];
  for (const lab of items) { await openSide(); const it = page.getByText(lab, { exact: true }).first(); if (await it.isVisible().catch(() => false)) { await it.click(); went.push(lab); } await page.waitForTimeout(1500); }
  const after = await page.evaluate(() => ({ ...window.__rp }));
  await b.close();
  return { went, d: { root: after.root - before.root, main: after.main - before.main, meta: after.meta - before.meta } }; };
for (const [lab, vp] of [['縦', { width: 810, height: 1080 }], ['横', { width: 1080, height: 810 }]]) {
  const now = await run(PORT, vp); let line = `${lab} 移った画面 ${now.went.join('→')} / 直した後 書き換え ${JSON.stringify(now.d)}`;
  r[`${lab}_went`] = now.went.length === 3; r[`${lab}_noRoot`] = now.d.root === 0; r[`${lab}_noMeta`] = now.d.meta === 0;
  if (lab === '縦') r[`${lab}_noMain`] = now.d.main === 0; // 横はメニューの開け閉めで上の帯を固定し直す(本文を一瞬消す)のを残す。縦は何もしない
  if (BASE) { const old = await run(BASE, vp); line += ` / 直す前 ${JSON.stringify(old.d)}`; }
  console.log(line);
}
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
