// 2026-11-17 1117a/trial586: ログイン後に利用者マスタ管理を開くと、前に開いていた個人ファイルが開く(ユーザー報告)
//   ① 個人ファイルを開いたままの控え(tsumugiReopenPF keep)が残った状態でログアウト直後の起動(tsumugiNoResume)→ ホーム → 利用者マスタ: 個人ファイルは開かない
//   ② 控えが残った状態で、見ていた画面に戻らない起動(tsumugi_resume_view なし)→ 利用者マスタ: 開かない
//   ③ 再読み込み(今すぐ更新)=tsumugi_resume_view が master で keep の控えあり → 個人ファイルが開き直る(10/17 の動きはそのまま)
//   ④ 個人ファイルを開いたまま別の画面へ移って戻る → 開かない
//   ⑤ ログアウトで控えが消える(handleLogout が tsumugiReopenPF を消す・静的検査)
//   実行: node scripts/chk_1117pf.mjs [port]
import { chromium } from 'playwright';
import fs from 'node:fs';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
const r = {}; const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
const pid = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const p = d.patients.find(x => x.status === '利用中' && !x.endDate); localStorage.setItem('tsumugiSidebarOpen', '1'); return p.id; });
const pfOpen = async () => (await page.locator('[data-testid="personal-file-modal"]').count()) > 0;
const seedKeep = () => page.evaluate((pid) => { sessionStorage.setItem('tsumugiReopenPF', JSON.stringify({ patientId: pid, tab: 'cat_1', keep: true })); }, pid);
const domClick = (label) => page.evaluate((label) => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim().replace(/\d+$/, '') === label); /* 件数の印(ホーム50)を除く */ if (b) b.click(); return !!b; }, label); // 小窓の幕に邪魔されないよう DOM で押す
const toMaster = async () => { await domClick('利用者マスタ管理'); await page.waitForTimeout(1200); };
// ① ログアウト直後の起動
await seedKeep(); await page.evaluate(() => { sessionStorage.removeItem('tsumugi_resume_view'); sessionStorage.setItem('tsumugiNoResume', '1'); });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
r.s1_keep_dropped_at_start = await page.evaluate(() => !sessionStorage.getItem('tsumugiReopenPF'));
await toMaster(); r.s1_master_no_pf = !(await pfOpen());
// ② 見ていた画面に戻らない起動(控えなし)
await seedKeep(); await page.evaluate(() => { sessionStorage.removeItem('tsumugi_resume_view'); });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
await toMaster(); r.s2_master_no_pf = !(await pfOpen());
// ③ 再読み込み(今すぐ更新)で利用者マスタに戻るとき → 個人ファイルが開き直る
await seedKeep(); await page.evaluate((pid) => { sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'master', pid, t: Date.now() })); }, pid);
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(3000); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
r.s3_reload_reopens = await pfOpen();
// ④ 開いたまま別の画面へ移って戻る → 開かない
r.s4_pf_was_open = await pfOpen();
await domClick('ホーム'); await page.waitForTimeout(1000); // 個人ファイルを開いたまま別の画面へ(小窓の中の「移動」と同じく MasterView が片付く)
r.s4_left_master = !(await pfOpen()) && /ホーム/.test((await page.locator('h1:visible').allInnerTexts()).join(''));
const keepAfterLeave = await page.evaluate(() => sessionStorage.getItem('tsumugiReopenPF'));
r.s4_keep_dropped_on_leave = !keepAfterLeave || !JSON.parse(keepAfterLeave).keep;
await toMaster(); r.s4_back_no_pf = !(await pfOpen());
await b.close();
// ⑤ 静的検査
{ const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const i = app.indexOf('tsumugiNoResume', app.indexOf('const handleLogout = () => {', app.indexOf('const handleLogout = () => {') + 1)); const seg = app.slice(i - 400, i + 200); /* App 本体の handleLogout(2つ目) */
  r.s5_logout_clears = /sessionStorage\.removeItem\('tsumugiReopenPF'\)/.test(seg) && /_dropPF\(\)/.test(app); }
const ok = Object.values(r).every(v => v === true); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
