// 2026-11-27 trial654: 2台のつもり(テスト店舗・試験版)— ケアマネ事業所の ふりがな が、古い状態の端末の保存で消えない
//   ① A が検査用の事業所 X・Y を追加(ふりがななし) ② B に届いたら B をオフラインに ③ A が X に ふりがな を入れる
//   ④ B(ふりがなを知らない)が Y の電話を直す ⑤ B をつなぐ → B の保存がクラウドへ ⑥ A・B・新しい端末 C のどれも X の ふりがな が残り、Y の電話も入っている
//   ⑦ 片付け: 検査用の事業所を消す(新しい端末でも消えていること)
//   LIVE_URL=https://tsumugi-git-trial-ones-style.vercel.app node scripts/live_1127kana.mjs [--cleanup-only]
import { chromium } from 'playwright';
const BASE = (process.env.LIVE_URL || 'https://tsumugi-git-trial-ones-style.vercel.app').replace(/\/$/, '');
const b = await chromium.launch(); const r = {};
const open = async (tag, view) => {
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept());
  await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
  await page.evaluate(() => { localStorage.setItem('tsumugiSidebarOpen', '0'); localStorage.setItem('tsumugiDeviceName', 'live-kana-' + Math.random().toString(36).slice(2, 6)); });
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
    if (/この端末の名前/.test(body)) { const inp = page.locator('input[type=text]:visible, input:not([type]):visible').first(); if (await inp.count()) { await inp.fill('live-kana-' + tag); await page.waitForTimeout(200); } await page.locator('button:visible', { hasText: /この名前で保存/ }).first().click({ timeout: 1500 }).catch(() => {}); await page.waitForTimeout(3000); continue; }
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
const MARK = /^検査用.*\(消してよい\)$/; const X = `検査用あ${TAG}(消してよい)`, Y = `検査用い${TAG}(消してよい)`;
const slog = (page, n = 80) => page.evaluate((n) => { try { return JSON.parse(localStorage.getItem('tsumugiSyncLog') || '[]').slice(-n).map(x => `${x.t} ${x.ev}${x.d ? ' ' + JSON.stringify(x.d).slice(0, 70) : ''}`); } catch { return []; } }, n);
const offs = (page) => page.evaluate(() => { try { const d = JSON.parse(localStorage.getItem('daycareAppData_v3') || '{}'); return ((d.systemSettings || {}).cmOffices || []).map(o => ({ name: o.name, kana: o.kana || '', ts: Number(o._kanaTs) || 0, phone: o.phone || '' })); } catch { return []; } });
const off = async (page, name) => (await offs(page)).find(o => o.name === name) || null;
const resume = async (page, view) => { await page.evaluate((v) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: null, t: Date.now() })), view); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(6000); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {}); };
const poll = async (fn, ms, step = 3000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await new Promise(z => setTimeout(z, step)); } };
const rowBtn = async (page, name, title) => { const idx = await page.evaluate(({ name, title }) => { const bs = [...document.querySelectorAll(`button[title="${title}"]`)].filter(b => b.offsetParent); return bs.findIndex(b => { const row = b.parentElement; return row && (row.innerText || '').split('\n')[0].trim() === name; }); }, { name, title }); if (idx < 0) return false; await page.locator(`button[title="${title}"]:visible`).nth(idx).click(); await page.waitForTimeout(700); return true; };
const addOffice = async (page, name) => { await page.locator('button:visible', { hasText: /事業所を追加/ }).first().click(); await page.waitForTimeout(500); await page.getByTestId('cm-office-name-new').fill(name); await page.waitForTimeout(200); await page.locator('button:visible', { hasText: /^追加$/ }).last().click(); await page.waitForTimeout(2500); };
const saveEdit = async (page) => { await page.locator('button:visible', { hasText: /^(保存|更新|保存する)$/ }).last().click(); await page.waitForTimeout(2500); };
// 片付け: 検査用の事業所を消す(確認の窓は自動で「OK」)
const cleanup = async (page) => { await resume(page, 'cmmaster'); let left = (await offs(page)).filter(o => MARK.test(o.name)).map(o => o.name); console.log('cleanup: targets', left.length);
  for (const nm of left) { const hit = await rowBtn(page, nm, '削除'); console.log('cleanup:', hit ? 'deleted' : 'row not found', nm.slice(0, 8)); await page.waitForTimeout(2500); }
  await page.waitForTimeout(8000); return (await offs(page)).filter(o => MARK.test(o.name)).length === 0; };

const A = await open('A', 'cmmaster'); let made = false;
if (CLEAN_ONLY) { const okc = await cleanup(A.page); await A.page.waitForTimeout(10000); const C = await open('C', 'home'); const n = (await offs(C.page)).filter(o => MARK.test(o.name)).length; console.log(okc && n === 0 ? 'CLEANUP OK' : 'CLEANUP INCOMPLETE', n); await b.close(); process.exit(okc && n === 0 ? 0 : 1); }
try {
  const pre = (await offs(A.page)); console.log('offices in store:', pre.length, 'leftover test offices:', pre.filter(o => MARK.test(o.name)).length);
  if (pre.some(o => MARK.test(o.name))) await cleanup(A.page);
  await resume(A.page, 'cmmaster');
  // ① A: 検査用の事業所を2つ追加(ふりがななし)
  await addOffice(A.page, X); made = true; await addOffice(A.page, Y);
  const ax = await off(A.page, X), ay = await off(A.page, Y); r.a_added_two = !!ax && !!ay && !ax.kana && !ax.ts; console.log('① A added', JSON.stringify({ ax, ay }));
  await A.page.waitForTimeout(12000); console.log('A log:\n  ' + (await slog(A.page, 60)).filter(x => /push|blocked|resend/.test(x)).slice(-5).join('\n  '));
  // ② B: 開いて 2つ届くのを待つ → 切る
  const B = await open('B', 'cmmaster');
  const bg = await poll(async () => (await off(B.page, X)) && (await off(B.page, Y)), 60000); r.b_got_two = !!bg; console.log('② B got both', !!bg);
  await resume(B.page, 'cmmaster'); r.b_list_has_y = await B.page.evaluate((n) => document.body.innerText.includes(n), Y);
  await B.ctx.setOffline(true);
  // ③ A: X に ふりがな を入れる
  await resume(A.page, 'cmmaster'); r.a_edit_opened = await rowBtn(A.page, X, '編集');
  await A.page.getByTestId('cm-office-kana-edit').fill('けんさようあ'); await A.page.waitForTimeout(300); await saveEdit(A.page);
  const ax2 = await off(A.page, X); r.a_kana_saved = !!ax2 && ax2.kana === 'ケンサヨウア' && ax2.ts > 0; console.log('③ A kana', JSON.stringify(ax2));
  await A.page.waitForTimeout(12000); console.log('A log:\n  ' + (await slog(A.page, 60)).filter(x => /push|blocked|resend/.test(x)).slice(-4).join('\n  '));
  // ④ B(切れたまま・ふりがなを知らない): Y の電話を直す
  r.b_edit_opened = await rowBtn(B.page, Y, '編集');
  const tel = B.page.locator('input[inputmode="tel"]:visible').first(); await tel.fill('03-0000-0001'); await tel.press('Tab'); await saveEdit(B.page); await B.page.waitForTimeout(4000);
  const bx = await off(B.page, X), by = await off(B.page, Y); r.b_offline_saved = !!by && by.phone === '03-0000-0001' && !!bx && !bx.kana; console.log('④ B offline', JSON.stringify({ bx, by }));
  // ⑤ B をつなぐ → B の保存(古い X を含む)がクラウドへ
  await B.ctx.setOffline(false);
  const ay2 = await poll(async () => { const y = await off(A.page, Y); return y && y.phone === '03-0000-0001' ? y : null; }, 150000); r.a_got_phone = !!ay2; console.log('⑤ A got phone', JSON.stringify(ay2));
  await B.page.waitForTimeout(15000);
  console.log('B log:\n  ' + (await slog(B.page, 200)).filter(x => /push|resend|pull-full|blocked/.test(x)).slice(-10).join('\n  '));
  // ⑥ どの端末でも X の ふりがな が残っている
  const ax3 = await off(A.page, X); r.a_kana_kept = !!ax3 && ax3.kana === 'ケンサヨウア' && ax3.ts > 0;
  const bx3 = await poll(async () => { const x = await off(B.page, X); return x && x.kana ? x : null; }, 60000); r.b_kana_arrived = !!bx3 && bx3.kana === 'ケンサヨウア'; console.log('⑥ A', JSON.stringify(ax3), 'B', JSON.stringify(bx3 || await off(B.page, X)));
  const C = await open('C', 'cmmaster'); const cx = await off(C.page, X), cy = await off(C.page, Y);
  r.c_kana_kept = !!cx && cx.kana === 'ケンサヨウア' && cx.ts > 0; r.c_phone_kept = !!cy && cy.phone === '03-0000-0001'; console.log('⑥ C', JSON.stringify({ cx, cy }));
  // 選ぶ欄: 担当者を追加 → 所属事業所 → ふりがなで探せる
  await C.page.locator('button:visible', { hasText: /担当者を追加/ }).first().click(); await C.page.waitForTimeout(600);
  const pk = C.page.getByTestId('cm-new-office'); if (await pk.count()) { await pk.click(); await C.page.waitForTimeout(400); await C.page.getByTestId('cm-new-office-q').fill('けんさようあ'); await C.page.waitForTimeout(400);
    const hit = await C.page.locator('[data-testid="cm-new-office-opt"]').evaluateAll(es => es.map(e => e.getAttribute('data-value')).filter(Boolean)); r.c_pick_by_kana = hit.length === 1 && hit[0] === X; console.log('⑥ C pick', hit.length); } else r.c_pick_by_kana = false;
  await C.ctx.close();
  // ⑦ さらに B が(ふりがなを受け取ったあと)もう一度保存しても消えない
  await resume(B.page, 'cmmaster'); if (await rowBtn(B.page, Y, '編集')) { const t2 = B.page.locator('input[inputmode="tel"]:visible').first(); await t2.fill('03-0000-0002'); await t2.press('Tab'); await saveEdit(B.page); }
  const ay3 = await poll(async () => { const y = await off(A.page, Y); return y && y.phone === '03-0000-0002' ? y : null; }, 90000); const ax4 = await off(A.page, X); r.a_kana_kept_after_b_resave = !!ay3 && !!ax4 && ax4.kana === 'ケンサヨウア'; console.log('⑦ A', JSON.stringify({ ax4, ay3 }));
  await B.ctx.close();
} catch (e) { console.log('ERROR', String(e && e.stack || e).slice(0, 600)); r.no_error = false; }
finally { if (made) { try { r.cleanup_local = await cleanup(A.page); await A.page.waitForTimeout(12000); const C2 = await open('C2', 'home'); const n = (await offs(C2.page)).filter(o => MARK.test(o.name)).length; r.cleanup_cloud = n === 0; console.log('cleanup: left in cloud', n); await C2.ctx.close(); } catch (e) { console.log('cleanup error', String(e).slice(0, 200)); r.cleanup_cloud = false; } } }
let bad = 0; for (const [k, v] of Object.entries(r)) { if (!v) bad++; console.log(v ? 'PASS' : 'FAIL', k); }
console.log(bad ? `FAIL ${bad}` : 'ALL PASS'); await b.close(); process.exit(bad ? 1 : 0);
