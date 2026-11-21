// 2026-10-28 ユーザー報告「タブレット(とPC)でサイドバーから提供記録入力を押すと、上の保存・戻すの帯がぐらつく」
//   サイドバーを開いたまま ホーム → サイドバーの「サービス提供記録 入力」 を押し、上の帯の 連絡帳/全画面/戻す/保存 の位置と幅を毎コマ記録する
//   最初に出た位置から動かない(変化が1回=出たときだけ)こと。iPad 横(1180)・大きいiPad 横(1366)・iPad 縦(820)・PC(1440)
//   実行: node scripts/chk_1028toolbar.mjs [--port 4175]
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4175'; })();
const b = await chromium.launch(); const r = {};
for (const [k, vp, touch] of [['ipad1180', { width: 1180, height: 820 }, true], ['ipad1366', { width: 1366, height: 1024 }, true], ['ipad820', { width: 820, height: 1180 }, true], ['pc1440', { width: 1440, height: 900 }, false]]) {
  const ctx = await b.newContext({ viewport: vp, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', hasTouch: touch, isMobile: touch, deviceScaleFactor: 2 }); const page = await ctx.newPage();
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  await page.evaluate(() => { localStorage.setItem('tsumugiSidebarOpen', '1'); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'dashboard', pid: null, t: Date.now() })); });
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
  const item = page.locator('[data-testid="app-sidebar"] button', { hasText: 'サービス提供記録 入力' }).first();
  if (!(await item.isVisible().catch(() => false))) { await page.locator('header button').first().click().catch(() => {}); await page.waitForTimeout(600); }
  await page.evaluate(() => { window.__wob = []; const t0 = performance.now(); const tick = () => { const tb = document.querySelector('[data-testid="rec-toolbar"]'); if (tb) { const bs = [...tb.querySelectorAll('button')].filter(x => /保存|戻す|連絡帳|全画面/.test(x.textContent || '')); const s = bs.map(x => { const q = x.getBoundingClientRect(); return `${Math.round(q.x)},${Math.round(q.y)},${Math.round(q.width)}`; }).join(' ') + ' h' + Math.round(tb.getBoundingClientRect().height); const L = window.__wob; if (!L.length || L[L.length - 1].s !== s) L.push({ t: Math.round(performance.now() - t0), s }); } if (performance.now() - t0 < 2500) requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
  await item.click(); await page.waitForTimeout(2800);
  const w = await page.evaluate(() => window.__wob); console.log(k, 'changes', w.length, w.slice(0, 4).map(x => `${x.t}ms ${x.s}`).join(' | '));
  r[`${k}_steady`] = w.length === 1;
  await ctx.close();
}
await b.close();
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
