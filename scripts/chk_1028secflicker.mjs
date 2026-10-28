// 2026-10-28 深夜(試験版 trial452) ユーザー報告「各種設定の左の見出し(ログイン情報・管理者の設定など)を押すと、いったん前の見出しに戻ってから押したものになる(チカチカ)」
//   iPad 横: ログイン・管理者 を開き、見出しを押すたびに、太字(いまの見出し)の移り変わりを毎コマ記録する
//   ①「管理者の設定」を押す → 太字は 管理者の設定 になったあと、ログイン情報 に戻らない ②「ログイン情報」を押す → 同じく戻らない
//   ③指で動かしたら(ホイール)、また見えている見出しに合わせて太字が動く
//   実行: node scripts/chk_1028secflicker.mjs [--port 4175]
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4175'; })();
const b = await chromium.launch(); const r = {};
const ctx = await b.newContext({ viewport: { width: 1180, height: 760 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage();
page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
await page.evaluate(() => { localStorage.setItem('tsumugiSidebarOpen', '0'); localStorage.removeItem('tsumugiSettingsOpenTabs'); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'settings', pid: null, t: Date.now() })); });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800);
await page.getByTestId('settings-vtab-login').click(); await page.waitForTimeout(900);
const nav = page.getByTestId('settings-secnav-login'); const n = await nav.locator('button').count(); console.log('見出しの数', n);
const watch = async (idx) => {
  await page.evaluate(() => { window.__hl = []; const t0 = performance.now(); const tick = () => { const b = [...document.querySelectorAll('[data-testid="settings-secnav-login"] button')].find(x => x.classList.contains('font-bold')); const s = b ? b.textContent.trim() : ''; const L = window.__hl; if (!L.length || L[L.length - 1] !== s) L.push(s); if (performance.now() - t0 < 1800) requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
  const want = (await nav.locator('button').nth(idx).innerText()).trim();
  await nav.locator('button').nth(idx).click(); await page.waitForTimeout(1900);
  const seq = await page.evaluate(() => window.__hl); const after = seq.slice(seq.indexOf(want)); console.log('押した', want, '太字の移り変わり', JSON.stringify(seq));
  return after.length >= 1 && after.every(x => x === want); };
r.noFlickerDown = n >= 2 && await watch(1);
r.noFlickerUp = n >= 2 && await watch(0);
// ③ ホイールで動かすと、見えている見出しに合わせて動く
await page.mouse.move(700, 500); for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 400); await page.waitForTimeout(150); } await page.waitForTimeout(500);
const hl = await page.evaluate(() => { const b = [...document.querySelectorAll('[data-testid="settings-secnav-login"] button')].find(x => x.classList.contains('font-bold')); return b ? b.textContent.trim() : ''; });
const first = (await nav.locator('button').nth(0).innerText()).trim(); console.log('ホイールのあと', hl); r.spyResumes = hl !== '' && hl !== first;
await b.close();
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
