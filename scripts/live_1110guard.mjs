// 2026-11-10 trial545: 2台のつもり(テスト店舗・試験版)— ①眠っていた端末(B・オフライン70秒)が保存すると、まず最新を取り込む(push-stale-pull-first)
//   ②A が登録した利用者が B の再送で消えない ③B にも新しい利用者が入る。画面からログイン(セッションの差し込みはしない)
//   LIVE_URL=https://tsumugi-git-trial-ones-style.vercel.app node scripts/live_1110guard.mjs
import { chromium } from 'playwright';
const BASE = (process.env.LIVE_URL || 'https://tsumugi-git-trial-ones-style.vercel.app').replace(/\/$/, '');
const b = await chromium.launch(); const r = {};
const open = async (tag, view) => {
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept());
  await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
  await page.evaluate(() => { localStorage.setItem('tsumugiSidebarOpen', '0'); localStorage.setItem('tsumugiDeviceName', 'live-guard-' + Math.random().toString(36).slice(2, 6)); });
  await page.locator('input[autocomplete^="username"]').first().fill('test'); await page.locator('input[autocomplete="current-password"]').first().fill('testoooo');
  await page.locator('button[type=submit]:visible, button:visible:has-text("ログイン")').first().click(); await page.waitForTimeout(7000);
  const pickOne = async () => { const el = page.getByText('試験 管理者', { exact: true }).first(); try { await el.waitFor({ timeout: 25000 }); await el.click(); await page.waitForTimeout(2500); return true; } catch { return false; } };
  if ((await page.getByText('どなたですか').count()) > 0) { if (!(await pickOne())) { await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(5000); await pickOne(); } }
  if (view) { await page.evaluate((v) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: null, t: Date.now() })), view); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(6000); }
  await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
  console.log(tag, 'screen:', (await page.locator('body').innerText()).slice(0, 60).replace(/\n/g, ' / '));
  return { ctx, page }; };
const state = (page) => page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3') || '{}'); return { n: (d.patients || []).length, ids: (d.patients || []).map(p => p.id), seq: d.patientIdSeq, names: (d.patients || []).map(p => p.name) }; });
const slog = (page) => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('tsumugiSyncLog') || '[]').slice(-40).map(x => `${x.t} ${x.ev}${x.d ? ' ' + JSON.stringify(x.d).slice(0, 60) : ''}`); } catch { return []; } });
const A = await open('A', 'master'); const B = await open('B', 'dashboard');
const sA = await state(A.page), sB = await state(B.page); console.log('A', sA.n, 'B', sB.n, 'seq', sA.seq); r.same_start = sA.n === sB.n && sA.n > 0;
// B を眠らせる(オフライン 70秒 → クラウドを確かめられない時間が 60秒を超える)
await B.ctx.setOffline(true); const tOff = Date.now();
// A: 新規登録
const NM = `検守り ${new Date().getHours()}${String(new Date().getMinutes()).padStart(2, '0')}`;
await A.page.locator('button:visible', { hasText: /新規/ }).first().click(); await A.page.waitForTimeout(600);
await A.page.locator('input[placeholder="例: 田中"]').fill('検守り'); await A.page.locator('input[placeholder="例: 太郎"]').fill(NM.split(' ')[1]); await A.page.waitForTimeout(300);
await A.page.locator('button:visible', { hasText: /一覧|だけ|のみ/ }).first().click({ timeout: 1500 }).catch(async () => { await A.page.locator('button:visible', { hasText: /登録|追加/ }).first().click(); });
await A.page.waitForTimeout(6000);
const sA2 = await state(A.page); r.a_added = sA2.n === sA.n + 1 && sA2.names.includes(NM); const newId = Math.max(...sA2.ids); console.log('A after', sA2.n, 'newId', newId);
const C = await open('C', 'dashboard'); const sC = await state(C.page); r.cloud_has_new = sC.n === sA.n + 1 && sC.names.includes(NM); console.log('C(cloud)', sC.n); await C.ctx.close();
// 70秒たつまで待つ
const rest = 70000 - (Date.now() - tOff); if (rest > 0) await B.page.waitForTimeout(rest);
// B: オフラインのまま申し送りを保存(失敗→再送キュー)
await B.page.getByTestId('home-memo-add').click(); await B.page.waitForTimeout(500); await B.page.getByTestId('memo-text').fill('守りの検査(消してよい)'); await B.page.getByTestId('memo-save').click(); await B.page.waitForTimeout(4000);
const sB2 = await state(B.page); r.b_stale = sB2.n === sA.n; console.log('B offline', sB2.n);
await B.ctx.setOffline(false); await B.page.waitForTimeout(20000);
const lg = await slog(B.page); console.log('B log:\n  ' + lg.join('\n  '));
r.pull_first_logged = lg.some(x => /push-stale-pull-first/.test(x));
r.no_shrink_block = !lg.some(x => /blocked-shrink|"reason":"shrink"/.test(x));
const D = await open('D', 'dashboard'); const sD = await state(D.page); console.log('D(cloud after B)', sD.n, 'has', sD.names.includes(NM));
r.cloud_keeps_new = sD.n === sA.n + 1 && sD.names.includes(NM); r.seq_ok = sD.seq == null || Number(sD.seq) >= newId; await D.ctx.close();
const sB3 = await state(B.page); r.b_got_new = sB3.names.includes(NM); console.log('B after', sB3.n);
// 片付け: A で登録した利用者を削除(管理者の関所は確認ダイアログを受ける)・B の申し送りは残っても害なし
console.log(r); const ok = Object.values(r).every(Boolean); console.log(ok ? 'PASS' : 'FAIL', 'newId', newId, 'name', NM); await b.close(); process.exit(ok ? 0 : 1);
