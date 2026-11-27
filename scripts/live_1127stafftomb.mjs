// 2026-11-27 1128a/trial657: 2台のつもり(テスト店舗)— 消した職員が、ほかの端末でも消える(職員名簿の墓石がクラウドへ届く)
//   ① A の名簿に検査用の職員 X を足す → クラウドへ ② 新しい端末 B に X が届く
//   ③ A で X を消す(名簿から外す＋墓石) → A の保存 ④ 新しい端末 C に X がいない・クラウドに墓石がある・A にも戻らない
//   ⑤ 片付け: 検査用の職員が残っていたら消す
//   画面を操作する: サイドバーの「スタッフ切替」→「スタッフを追加」で足し、「編集」→「削除」で消す(試験 管理者で入っているので関所は通る)
//   LIVE_URL=https://tsumugi-git-trial-ones-style.vercel.app node scripts/live_1127stafftomb.mjs [--cleanup-only]
import { chromium } from 'playwright';
const BASE = (process.env.LIVE_URL || 'https://tsumugi-git-trial-ones-style.vercel.app').replace(/\/$/, '');
const b = await chromium.launch(); const r = {};
const open = async (tag, view) => {
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept());
  await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
  await page.evaluate(() => { localStorage.setItem('tsumugiSidebarOpen', '0'); localStorage.setItem('tsumugiDeviceName', 'live-stafftomb-' + Math.random().toString(36).slice(2, 6)); });
  await page.locator('input[autocomplete^="username"]').first().fill('test'); await page.locator('input[autocomplete="current-password"]').first().fill('testoooo');
  await page.locator('button[type=submit]:visible, button:visible:has-text("ログイン")').first().click(); await page.waitForTimeout(7000);
  // 「どなたですか」→ 試験 管理者 → 管理者パスワード(出たら) を、画面が落ち着くまで繰り返す
  // 「どなたですか」→ 試験 管理者 → 管理者パスワード(出たら test1234) を、画面が落ち着くまで繰り返す
  const settle = async () => { for (let i = 0; i < 6; i++) {
    const body = await page.locator('body').innerText();
    if (/管理者パスワードを入力/.test(body)) {
      const inp = page.locator('input[type=password]:visible, input[type=text]:visible, input:not([type]):visible').last();
      await inp.fill('test1234'); await page.waitForTimeout(200); await inp.press('Enter'); await page.waitForTimeout(1500);
      await page.locator('button:visible', { hasText: /^(入る|確認|OK|ログイン|決定)$/ }).first().click({ timeout: 800 }).catch(() => {}); await page.waitForTimeout(4000);
      console.log(tag, 'after pw:', (await page.locator('body').innerText()).slice(0, 100).replace(/\n+/g, ' / ')); continue;
    }
    if (/どなたですか/.test(body)) { const el = page.locator('button:visible', { hasText: /試験 管理者/ }).first(); if (await el.count()) { await el.evaluate(b => b.click()); await page.waitForTimeout(3000); continue; } }
    if (/この端末の名前/.test(body)) { const inp = page.locator('input[type=text]:visible, input:not([type]):visible').first(); if (await inp.count()) { await inp.fill('live-stafftomb-' + tag); await page.waitForTimeout(200); } await page.locator('button:visible', { hasText: /この名前で保存/ }).first().click({ timeout: 1500 }).catch(() => {}); await page.waitForTimeout(3000); continue; }
    if (!/どなたですか|パスワード|この端末の名前/.test(body)) break; await page.waitForTimeout(3000); } };
  // 店舗のデータが端末に入るまで待つ(最大40秒)
  const waitData = async () => { for (let i = 0; i < 20; i++) { const n = await page.evaluate(() => { try { return (JSON.parse(localStorage.getItem('daycareAppData_v3') || '{}').patients || []).length; } catch { return 0; } }); if (n > 0) return n; await page.waitForTimeout(2000); } return 0; };
  await settle();
  if (view) { await page.evaluate((v) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: null, t: Date.now() })), view); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(6000); await settle(); }
  await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
  await settle(); console.log(tag, 'patients in device:', await waitData());
  console.log(tag, 'screen:', (await page.locator('body').innerText()).slice(0, 60).replace(/\n/g, ' / '));
  return { ctx, page }; };
const CLEAN_ONLY = process.argv.includes('--cleanup-only');
const TAG = new Date().toTimeString().slice(0, 5).replace(':', '');
const MARK = /^検査用[\s　]*.*\(消してよい\)$/; const LAST = '検査用'; const FIRST = `${TAG}(消してよい)`;
const slog = (page, n = 60) => page.evaluate((n) => { try { return JSON.parse(localStorage.getItem('tsumugiSyncLog') || '[]').slice(-n).map(x => `${x.t} ${x.ev}${x.d ? ' ' + JSON.stringify(x.d).slice(0, 70) : ''}`); } catch { return []; } }, n);
const mem = (page) => page.evaluate(() => { try { const d = JSON.parse(localStorage.getItem('daycareAppData_v3') || '{}'); return { ms: (d.storeMembers || []).map(m => ({ id: String(m.id), name: m.name || '' })), tomb: Object.keys(((d.deletedIds || {}).storeMembers) || {}) }; } catch { return { ms: [], tomb: [] }; } });
const poll = async (fn, ms, step = 3000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await new Promise(z => setTimeout(z, step)); } };
const tests = (m) => m.ms.filter(x => MARK.test(x.name));
// サイドバーの「スタッフ切替」を開く(閉じていたらサイドバーを出してから)
const openPicker = async (page) => {
  const btn = () => page.locator('button:visible', { hasText: 'スタッフ切替' }).first();
  if (!(await btn().count())) {
    await page.evaluate(() => localStorage.setItem('tsumugiSidebarOpen', '1'));
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(8000);
    await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
  }
  if (!(await btn().count())) throw new Error('staff switch button not found');
  if (!(await page.locator('button:visible', { hasText: 'スタッフを追加' }).count())) { await btn().evaluate(el => el.click()); await page.waitForTimeout(600); }
};
// 画面で足す: スタッフ切替 → スタッフを追加 → 姓・名・役職 → 追加
const addViaUI = async (page) => {
  await openPicker(page);
  await page.locator('button:visible', { hasText: 'スタッフを追加' }).first().evaluate(el => el.click()); await page.waitForTimeout(600);
  await page.locator('input[placeholder="例: 山田"]:visible').type(LAST);
  await page.locator('input[placeholder="例: 太郎"]:visible').type(FIRST);
  const modal = page.locator('div.fixed:visible', { hasText: 'スタッフを追加' }).last();
  await modal.locator('select').first().selectOption({ label: '介護職員' }).catch(async () => { await modal.locator('select').first().selectOption({ index: 1 }); });
  await modal.locator('button:visible', { hasText: /^追加$/ }).first().click(); await page.waitForTimeout(1500);
};
// 画面で消す: スタッフ切替 → 検査用の行の「編集」 → 削除(確認は自動で OK)。管理者の関所が出たら止める
const delViaUI = async (page) => {
  let n = 0;
  for (let i = 0; i < 6; i++) {
    await openPicker(page);
    const row = page.locator('div.flex.items-stretch:visible', { hasText: /検査用.*\(消してよい\)/ }).first();
    if (!(await row.count())) break;
    await row.locator('button', { hasText: /^編集$/ }).evaluate(el => el.click()); await page.waitForTimeout(600);
    await page.locator('button:visible', { hasText: /^削除$/ }).first().click(); await page.waitForTimeout(1200);
    if (await page.locator('[data-testid="admin-gate"]').count()) throw new Error('admin gate shown (not admin)');
    n++; await page.waitForTimeout(2500);
  }
  return n;
};
// 片付け: 新しい端末で検査用の職員が見えたら画面で消し、もう 1 台の新しい端末で消えたのを確かめる
const cleanup = async () => { const P = await open('P', 'home'); const n0 = tests(await mem(P.page)).length; console.log('cleanup: test members seen', n0);
  if (!n0) { await P.ctx.close(); return true; }
  const nd = await delViaUI(P.page); console.log('cleanup: deleted on screen', nd); await P.page.waitForTimeout(15000);
  const Q = await open('Q', 'home'); const n1 = tests(await mem(Q.page)).length; console.log('cleanup: left on a new device', n1); await Q.ctx.close(); await P.ctx.close(); return n1 === 0; };

if (CLEAN_ONLY) { const okc = await cleanup(); console.log(okc ? 'CLEANUP OK' : 'CLEANUP INCOMPLETE'); await b.close(); process.exit(okc ? 0 : 1); }
let ok = false;
try {
  const A = await open('A', 'home');
  const pre = await mem(A.page); console.log('members in store:', pre.ms.length, 'leftover test members:', tests(pre).length, 'staff tombstones on device:', pre.tomb.length);
  // ① A: 画面で検査用の職員を足す
  await addViaUI(A.page);
  const x = await poll(async () => tests(await mem(A.page))[0], 15000, 1500);
  r.a_added = !!x; const XID = x ? x.id : ''; console.log('① A added:', r.a_added);
  await A.page.waitForTimeout(12000);
  // ② 新しい端末 B に届く(クラウドに入った)
  const B = await open('B', 'home');
  r.b_got_x = !!(await poll(async () => (await mem(B.page)).ms.some(m => m.id === XID), 20000)); console.log('② B got X from cloud:', r.b_got_x);
  if (!r.b_got_x) console.log('A log:', (await slog(A.page, 25)).join(' | '));
  await B.ctx.close();
  // ③ A: 画面で X を消す
  const nDel = await delViaUI(A.page); console.log('③ A deleted on screen:', nDel);
  await A.page.waitForTimeout(15000);
  const a1 = await mem(A.page); r.a_still_deleted = !a1.ms.some(m => m.id === XID); r.a_has_tomb = a1.tomb.includes(XID);
  console.log('③ A after save: deleted', r.a_still_deleted, 'tomb', r.a_has_tomb, '| log:', (await slog(A.page, 14)).filter(l => /push|preserve|blocked/.test(l)).slice(-6).join(' | '));
  // ④ 新しい端末 C: X がいない・クラウドに墓石がある
  const C = await open('C', 'home'); const c1 = await mem(C.page);
  r.c_no_x = !c1.ms.some(m => m.id === XID); r.c_cloud_tomb = c1.tomb.includes(XID); console.log('④ C: X gone', r.c_no_x, '/ tomb in cloud', r.c_cloud_tomb);
  await C.ctx.close();
  // ④' A を開き直しても戻らない
  await A.page.reload({ waitUntil: 'networkidle' }); await A.page.waitForTimeout(9000);
  r.a_not_back = !(await mem(A.page)).ms.some(m => m.id === XID); console.log("④' A after reload: not back", r.a_not_back);
  await A.ctx.close();
  ok = Object.values(r).every(Boolean);
} catch (e) { console.log('ERROR', String(e && e.message || e).slice(0, 200)); }
console.log(JSON.stringify(r));
// ⑤ 片付け(直す前の版では、消した印がクラウドへ届かないので CLEANUP INCOMPLETE になる。直した版で --cleanup-only を流す)
let cl = false; try { cl = await cleanup(); } catch (e) { console.log('cleanup error', String(e && e.message || e).slice(0, 120)); }
console.log(ok ? 'ALL PASS' : 'FAIL', '/', cl ? 'CLEANUP OK' : 'CLEANUP INCOMPLETE');
await b.close(); process.exit(ok && cl ? 0 : 1);
