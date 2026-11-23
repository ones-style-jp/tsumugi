// 2026-11-24 trial624(重さ対策 第1弾): テスト店舗・試験版で 2 台のつもり
//   ① A が 70 秒なにもせず(保存前の「まず取り込む」が働く条件)に保存しても、版が同じなら全量(2.5MB)の取り直しをしない。保存のあとも自分の版なので取り直さない
//   ② B が保存すると、A は版の違いに気づいて 1 回だけ全量を取り込み、B の内容が A の画面に入る
//   ③ A が 5 分半なにもしなくても(旧: 5 分の安全網で全量取り直し)、版が同じなら全量を取り直さない
//   取り込みの種類は app_state への GET の select で見分ける: 全量=data,updated_at,version / 見出し=updated_at,version / 保存の読み(CAS)=data,version
//   LIVE_URL=https://tsumugi-git-trial-ones-style.vercel.app node scripts/live_1124pull.mjs   [--quick で③を飛ばす]
import { chromium } from 'playwright';
const BASE = (process.env.LIVE_URL || 'https://tsumugi-git-trial-ones-style.vercel.app').replace(/\/$/, '');
const QUICK = process.argv.includes('--quick');
const b = await chromium.launch(); const r = {};
const open = async (tag, view) => {
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept());
  const cnt = { full: 0, meta: 0, cas: 0, other: 0 }; page.__cnt = cnt;
  page.on('request', (req) => { try { const u = new URL(req.url()); if (!/\/rest\/v1\/app_state/.test(u.pathname) || req.method() !== 'GET') return; const sel = decodeURIComponent(u.searchParams.get('select') || '');
    if (sel === 'data,updated_at,version' || sel === 'data,updated_at') cnt.full++; else if (sel === 'updated_at,version' || sel === 'updated_at') cnt.meta++; else if (sel === 'data,version') cnt.cas++; else cnt.other++; } catch {} });
  await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
  await page.evaluate(() => { localStorage.setItem('tsumugiSidebarOpen', '0'); localStorage.setItem('tsumugiDeviceName', 'live-pull-' + Math.random().toString(36).slice(2, 6)); });
  await page.locator('input[autocomplete^="username"]').first().fill('test'); await page.locator('input[autocomplete="current-password"]').first().fill('testoooo');
  await page.locator('button[type=submit]:visible, button:visible:has-text("ログイン")').first().click(); await page.waitForTimeout(7000);
  const settle = async () => { for (let i = 0; i < 6; i++) {
    const body = await page.locator('body').innerText();
    if (/管理者パスワードを入力/.test(body)) { const inp = page.locator('input[type=password]:visible, input[type=text]:visible, input:not([type]):visible').last(); await inp.fill('test1234'); await page.waitForTimeout(200); await inp.press('Enter'); await page.waitForTimeout(1500);
      await page.locator('button:visible', { hasText: /^(入る|確認|OK|ログイン|決定)$/ }).first().click({ timeout: 800 }).catch(() => {}); await page.waitForTimeout(4000); continue; }
    if (/どなたですか/.test(body)) { const el = page.locator('button:visible', { hasText: /試験 管理者/ }).first(); if (await el.count()) { await el.evaluate(b => b.click()); await page.waitForTimeout(3000); continue; } }
    if (/この端末の名前/.test(body)) { const inp = page.locator('input[type=text]:visible, input:not([type]):visible').first(); if (await inp.count()) { await inp.fill('live-pull-' + tag); await page.waitForTimeout(200); } await page.locator('button:visible', { hasText: /決定|保存|OK|はじめる|次へ/ }).first().click({ timeout: 1000 }).catch(() => {}); await page.waitForTimeout(2000); continue; }
    if (!/どなたですか|パスワード|この端末の名前/.test(body)) break; await page.waitForTimeout(3000); } };
  const waitData = async () => { for (let i = 0; i < 20; i++) { const n = await page.evaluate(() => { try { return (JSON.parse(localStorage.getItem('daycareAppData_v3') || '{}').patients || []).length; } catch { return 0; } }); if (n > 0) return n; await page.waitForTimeout(2000); } return 0; };
  await settle();
  if (view) { await page.evaluate((v) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: null, t: Date.now() })), view); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(6000); }
  await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
  await settle(); console.log(tag, 'patients in device:', await waitData(), 'ver', await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('tsumugiSyncLog') || '[]').filter(x => x.ev === 'pull-full').slice(-1).map(x => JSON.stringify(x.d))[0] || '-'; } catch { return '?'; } }));
  return { ctx, page, cnt }; };
const slog = (page, n = 30) => page.evaluate((n) => { try { return JSON.parse(localStorage.getItem('tsumugiSyncLog') || '[]').slice(-n).map(x => `${x.t} ${x.ev}${x.d ? ' ' + JSON.stringify(x.d).slice(0, 80) : ''}`); } catch { return []; } }, n);
const reset = (c) => { c.full = 0; c.meta = 0; c.cas = 0; c.other = 0; };
const saveMemo = async (page, text) => { await page.getByTestId('home-memo-add').click(); await page.waitForTimeout(500); await page.getByTestId('memo-text').fill(text); await page.getByTestId('memo-save').click(); await page.waitForTimeout(1500); };
const stamp = () => `${new Date().getHours()}${String(new Date().getMinutes()).padStart(2, '0')}`;

const A = await open('A', 'dashboard');
await A.page.waitForTimeout(8000); reset(A.cnt);
// ① 70 秒なにもしない → 保存
console.log('A idle 70s …'); await A.page.waitForTimeout(70000);
const c_idle = { ...A.cnt }; console.log('A during idle', JSON.stringify(c_idle));
reset(A.cnt); const M1 = `取込検査A ${stamp()}（消してよい）`; await saveMemo(A.page, M1); await A.page.waitForTimeout(25000);
const c1 = { ...A.cnt }; const lgA1 = await slog(A.page, 40); console.log('A after own save', JSON.stringify(c1)); console.log('  A log:\n   ' + lgA1.filter(x => /pull|push/.test(x)).join('\n   '));
r.a_idle_no_full = c_idle.full === 0 && c_idle.meta >= 2;
r.a_save_no_full = c1.full === 0 && c1.cas >= 1 && lgA1.some(x => /push-ok/.test(x));
r.a_own_sig = lgA1.some(x => /push-own-sig/.test(x));
// ② B が保存 → A が 1 回だけ全量を取り込み、B の文が A に入る
const B = await open('B', 'dashboard'); await B.page.waitForTimeout(5000);
reset(A.cnt); const M2 = `取込検査B ${stamp()}（消してよい）`; await saveMemo(B.page, M2); await A.page.waitForTimeout(25000);
const c2 = { ...A.cnt }; const lgA2 = await slog(A.page, 20); console.log('A after B save', JSON.stringify(c2)); console.log('  A log:\n   ' + lgA2.filter(x => /pull|push/.test(x)).join('\n   '));
r.a_pulls_once = c2.full === 1 && lgA2.some(x => /pull-full.*changed/.test(x));
r.a_sees_b = (await A.page.getByText(M2, { exact: false }).count()) > 0;
await B.ctx.close();
// ③ 5 分半なにもしない → 全量の取り直しなし
if (!QUICK) { reset(A.cnt); console.log('A idle 330s …'); await A.page.waitForTimeout(330000); const c3 = { ...A.cnt }; console.log('A during 5.5min idle', JSON.stringify(c3)); r.a_long_idle_no_full = c3.full === 0 && c3.meta >= 10; }
await A.ctx.close(); await b.close();
console.log(r); const ok = Object.values(r).every(Boolean); console.log(ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
