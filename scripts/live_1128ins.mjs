// 2026-11-28 1128a/trial657: 2台のつもり(テスト店舗)— 保険証の認定有効期間と変更履歴
//   ① A が検査用の利用者(検守り HHMM)を登録 ② A: 個人ファイルで 要介護1・前の認定有効期間 ③ B: 同じ方の利用者マスタを開いてオフライン・編集中
//   ④ A(ユーザーの手順): 利用者マスタを編集中のまま 個人ファイルで新しい認定有効期間 → 保存 → 利用者マスタを保存 → 期間が戻らない・履歴は 2 行
//   ⑤ B(前の期間の控え)が利用者マスタを保存してつなぐ → クラウドの期間は戻らない・履歴は増えない
//   ⑥ A が履歴を 1 行消す → 新しい端末でも消えている → B(消す前の控え)が保存しても戻らない
//   ⑦ A が履歴を「要介護2・きょうから」に直す → 開き直すと読み込みのあと自動で切り替わり、クラウドにも入る
//   片付け: node scripts/live_cleanup_kenmamori.mjs (検守り の利用者を一括削除)
//   LIVE_URL=https://tsumugi-git-trial-ones-style.vercel.app node scripts/live_1128ins.mjs
import { chromium } from 'playwright';
const BASE = (process.env.LIVE_URL || 'https://tsumugi-git-trial-ones-style.vercel.app').replace(/\/$/, '');
const b = await chromium.launch(); const r = {};
const open = async (tag, view) => {
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept());
  await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
  await page.evaluate(() => { localStorage.setItem('tsumugiSidebarOpen', '0'); localStorage.setItem('tsumugiDeviceName', 'live-ins-' + Math.random().toString(36).slice(2, 6)); });
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
    if (/この端末の名前/.test(body)) { const inp = page.locator('input[type=text]:visible, input:not([type]):visible').first(); if (await inp.count()) { await inp.fill('live-ins-' + tag); await page.waitForTimeout(200); } await page.locator('button:visible', { hasText: /この名前で保存/ }).first().click({ timeout: 1500 }).catch(() => {}); await page.waitForTimeout(3000); continue; }
    if (!/どなたですか|パスワード|この端末の名前/.test(body)) break; await page.waitForTimeout(3000); } };
  // 店舗のデータが端末に入るまで待つ(最大40秒)
  const waitData = async () => { for (let i = 0; i < 20; i++) { const n = await page.evaluate(() => { try { return (JSON.parse(localStorage.getItem('daycareAppData_v3') || '{}').patients || []).length; } catch { return 0; } }); if (n > 0) return n; await page.waitForTimeout(2000); } return 0; };
  await settle();
  if (view) { await page.evaluate((v) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: null, t: Date.now() })), view); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(6000); await settle(); }
  await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
  await settle(); console.log(tag, 'patients in device:', await waitData());
  console.log(tag, 'screen:', (await page.locator('body').innerText()).slice(0, 60).replace(/\n/g, ' / '));
  return { ctx, page }; };
const TAG = new Date().toTimeString().slice(0, 5).replace(':', ''); const LAST = '検守り', FIRST = TAG;
const jst = () => new Date(Date.now() + 9 * 3600 * 1000); const iso = (d) => d.toISOString().slice(0, 10);
const TODAY = iso(jst()); const M1 = TODAY.slice(0, 8) + '01';
const addY = (s, y, dd = 0) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCFullYear(d.getUTCFullYear() + y); d.setUTCDate(d.getUTCDate() + dd); return iso(d); };
const OLD_FROM = addY(M1, -1, -10), NEW_TO = addY(M1, 1, -1);
const wk = (s) => [Number(s.slice(0, 4)) - 2018, Number(s.slice(5, 7)), Number(s.slice(8, 10))];
const slog = (page, n = 60) => page.evaluate((n) => { try { return JSON.parse(localStorage.getItem('tsumugiSyncLog') || '[]').slice(-n).map(x => `${x.t} ${x.ev}${x.d ? ' ' + JSON.stringify(x.d).slice(0, 70) : ''}`); } catch { return []; } }, n);
const pats = (page) => page.evaluate(() => { try { return (JSON.parse(localStorage.getItem('daycareAppData_v3') || '{}').patients || []); } catch { return []; } });
const pat = async (page, id) => (await pats(page)).find(p => String(p.id) === String(id)) || null;
const ins = (p) => p ? { v: p.careLevel || '', from: p.careLevelFrom || '', to: p.careLevelTo || '', hist: (p.careLevelHistory || []).map(h => `${h.value}|${h.from}`) } : null;
const uniq = (a) => new Set(a).size === a.length;
const poll = async (fn, ms, step = 3000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await new Promise(z => setTimeout(z, step)); } };
const openMaster = async (page, pid) => { await page.evaluate((pid) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'master', pid, t: Date.now() })), pid); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(8000); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {}); };
const tab = async (page, name) => { await page.locator('button:visible', { hasText: new RegExp('^' + name + '$') }).first().click(); await page.waitForTimeout(700); };
const sec = (page) => page.locator('div.mt-3', { hasText: '保険証の内容（選んで' }).last();
const setWk = async (page, n, ey, m, day) => { const s = sec(page);
  if (await s.locator('[data-testid="wk-y"]').count()) { for (const [k, v] of [['y', ey], ['m', m], ['d', day]]) { await s.locator(`[data-testid="wk-${k}"]`).nth(n).click(); await page.waitForTimeout(250); await page.locator(`[data-testid="wk-${k}-opt"][data-value="${v}"]`).click(); await page.waitForTimeout(250); } }
  else { const sel = s.locator('select'); const o = 1 + n * 4; await sel.nth(o + 1).selectOption(String(ey)); await sel.nth(o + 2).selectOption(String(m)); await sel.nth(o + 3).selectOption(String(day)); await page.waitForTimeout(250); } };
const openPF = async (page) => { await page.locator('button', { hasText: '個人ファイルで編集' }).first().evaluate(el => el.click()); await page.waitForTimeout(2500); };
const closePF = async (page) => { await page.getByTestId('pf-close-btn').click(); await page.waitForTimeout(800); };
const pfSave = async (page) => { await sec(page).locator('button', { hasText: /^保存$/ }).first().click(); await page.waitForTimeout(2500); };
const typeRyui = async (page, text) => { await tab(page, 'サービス提供内容'); const ta = page.locator('div', { has: page.locator('> label', { hasText: '留意点（スタッフへの申し送り）' }) }).last().locator('textarea'); await ta.scrollIntoViewIfNeeded(); await ta.click(); await ta.type(text); await page.waitForTimeout(400); };
const masterSave = async (page) => { await page.locator('.tsu-mhead-btns button:visible', { hasText: /^保存$/ }).first().click(); await page.waitForTimeout(2500); };
const fresh = async (tag, pid) => { const X = await open(tag, 'home'); const p = await poll(() => pat(X.page, pid), 20000); await X.ctx.close(); return p; };

let PID = null; let ok = false;
try {
  const A = await open('A', 'master');
  // ① A: 検査用の利用者を登録
  await A.page.locator('button:visible', { hasText: /新規/ }).first().click(); await A.page.waitForTimeout(800);
  await A.page.locator('input[placeholder="例: 田中"]:visible').type(LAST); await A.page.locator('input[placeholder="例: 太郎"]:visible').type(FIRST);
  await A.page.locator('button:visible', { hasText: /追加のみ/ }).first().click(); await A.page.waitForTimeout(5000);
  const np = await poll(async () => (await pats(A.page)).find(p => (p.name || '').includes(LAST) && (p.name || '').includes(FIRST)), 15000, 1500);
  r.a_added = !!np; PID = np ? np.id : null; console.log('① A added', r.a_added, 'id', PID);
  if (!np) throw new Error('patient not added');
  await A.page.waitForTimeout(10000);
  // ② A: 利用者マスタ → 個人ファイルで編集 → 要介護1・前の認定有効期間(もう切れている)を入れて保存
  await openMaster(A.page, PID); await openPF(A.page);
  await sec(A.page).locator('select').first().selectOption('要介護1'); await A.page.waitForTimeout(300);
  await setWk(A.page, 0, ...wk(OLD_FROM)); await sec(A.page).locator('button', { hasText: /^1年$/ }).click(); await A.page.waitForTimeout(300); await pfSave(A.page);
  const a1 = ins(await pat(A.page, PID)); r.a_first_saved = !!a1 && a1.v === '要介護1' && a1.from === OLD_FROM && !!a1.to && a1.to < M1; console.log('② A first', JSON.stringify(a1));
  await closePF(A.page); await A.page.waitForTimeout(12000);
  // ③ B(別の端末): 同じ方の利用者マスタを開き、オフラインにして留意点を書く(=前の期間の控えを持ったまま編集中)
  const B = await open('B', 'master');
  r.b_got_first = !!(await poll(async () => { const p = ins(await pat(B.page, PID)); return p && p.from === OLD_FROM; }, 25000)); console.log('③ B got first', r.b_got_first);
  await openMaster(B.page, PID); await B.ctx.setOffline(true); await typeRyui(B.page, 'B端末の申し送り');
  // ④ A(ユーザーの手順): 利用者マスタを編集中のまま → 個人ファイルで編集 → 新しい認定有効期間 → 保存 → 閉じる → 利用者マスタを保存
  await typeRyui(A.page, 'A端末の申し送り'); await tab(A.page, '基本情報'); await openPF(A.page);
  await setWk(A.page, 0, ...wk(M1)); await sec(A.page).locator('button', { hasText: /^1年$/ }).click(); await A.page.waitForTimeout(300); await pfSave(A.page); await closePF(A.page);
  await masterSave(A.page); await A.page.waitForTimeout(12000);
  const a2 = ins(await pat(A.page, PID)); r.a_renewed_kept = !!a2 && a2.from === M1 && a2.to === NEW_TO; r.a_hist_two = !!a2 && a2.hist.length === 2 && uniq(a2.hist); console.log('④ A after master save', JSON.stringify(a2));
  const c2 = ins(await fresh('C', PID)); r.c_cloud_renewed = !!c2 && c2.from === M1 && c2.to === NEW_TO; r.c_cloud_hist_two = !!c2 && c2.hist.length === 2 && uniq(c2.hist); console.log('④ C(cloud)', JSON.stringify(c2));
  // ⑤ B(前の期間の控えのまま・オフライン)が利用者マスタを保存 → つなぐ → クラウドの認定有効期間は戻らない・履歴は増えない
  await masterSave(B.page); const b0 = ins(await pat(B.page, PID)); console.log('⑤ B offline saved (stale copy)', JSON.stringify(b0));
  await B.ctx.setOffline(false); await B.page.waitForTimeout(35000);
  const d2 = ins(await fresh('D', PID)); r.d_not_reverted = !!d2 && d2.from === M1 && d2.to === NEW_TO; r.d_hist_two = !!d2 && d2.hist.length === 2 && uniq(d2.hist); console.log('⑤ D(cloud after B)', JSON.stringify(d2));
  const b2 = ins(await pat(B.page, PID)); r.b_caught_up = !!b2 && b2.from === M1 && b2.hist.length === 2; console.log('⑤ B after sync', JSON.stringify(b2));
  if (!r.d_not_reverted || !r.b_caught_up) console.log('B log:', (await slog(B.page, 30)).join(' | '));
  // ⑥ 履歴の削除: B をオフラインに → A が「認定更新」の行を消す → 新しい端末でも消えている → B(消す前の控え)が保存してつないでも戻らない
  await B.ctx.setOffline(true);
  await openMaster(A.page, PID); await tab(A.page, '変更履歴');
  const rows = A.page.getByTestId('hist-care-row'); r.a_rows_two = (await rows.count()) === 2;
  await A.page.getByTestId('hist-care-del').first().click(); await A.page.waitForTimeout(500);
  await A.page.locator('button:visible', { hasText: /^削除(する)?$/ }).last().click(); await A.page.waitForTimeout(12000);
  const a3 = ins(await pat(A.page, PID)); r.a_hist_deleted = !!a3 && a3.hist.length === 1 && a3.from === M1; console.log('⑥ A after delete', JSON.stringify(a3));
  const e3 = ins(await fresh('E', PID)); r.e_cloud_deleted = !!e3 && e3.hist.length === 1; console.log('⑥ E(cloud)', JSON.stringify(e3));
  await typeRyui(B.page, '・追記'); await masterSave(B.page); await B.ctx.setOffline(false); await B.page.waitForTimeout(35000);
  const f3 = ins(await fresh('F', PID)); r.f_not_back = !!f3 && f3.hist.length === 1 && f3.from === M1; console.log('⑥ F(cloud after B)', JSON.stringify(f3));
  if (!r.f_not_back) console.log('B log:', (await slog(B.page, 30)).join(' | '));
  await B.ctx.close();
  // ⑦ 開始日が来た予定の切り替え: A が残りの履歴を「要介護2・きょうから」に直す(履歴だけ変わる) → 開き直すと、読み込みのあと自動で切り替わりクラウドへ
  if (TODAY > M1) {
    await openMaster(A.page, PID); await tab(A.page, '変更履歴');
    await A.page.getByTestId('hist-care-row').first().locator('button').first().click(); await A.page.waitForTimeout(600);
    const md = A.page.locator('div.fixed:visible', { hasText: '履歴を編集' }).last();
    const vi = md.locator('input:not([type=date])').first(); await vi.click(); await vi.press('ControlOrMeta+a'); await vi.type('要介護2');
    await md.getByTestId('hist-from').evaluate((el, v) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, TODAY);
    await md.getByTestId('hist-to').evaluate((el) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
    await md.locator('button:visible', { hasText: /^(保存|更新|保存する)$/ }).last().click(); await A.page.waitForTimeout(12000);
    const a4 = ins(await pat(A.page, PID)); r.a_hist_edited_only = !!a4 && a4.v === '要介護1' && a4.hist.length === 1 && a4.hist[0] === `要介護2|${TODAY}`; console.log('⑦ A after history edit', JSON.stringify(a4));
    await openMaster(A.page, null);
    const a5 = await poll(async () => { const p = ins(await pat(A.page, PID)); return p && p.v === '要介護2' ? p : null; }, 90000, 4000);
    r.a_due_applied = !!a5 && a5.from === TODAY; console.log('⑦ A after reopen', JSON.stringify(a5 || ins(await pat(A.page, PID))));
    const lg = await slog(A.page, 80); r.a_due_logged = lg.some(x => / due-apply/.test(x)); if (!r.a_due_applied) console.log('A log:', lg.slice(-25).join(' | '));
    await A.page.waitForTimeout(12000);
    const g5 = ins(await fresh('G', PID)); r.g_cloud_due = !!g5 && g5.v === '要介護2' && g5.from === TODAY && g5.hist.length === 1; console.log('⑦ G(cloud)', JSON.stringify(g5));
  } else console.log('⑦ skipped (today is the 1st)');
  await A.ctx.close();
  ok = Object.values(r).every(Boolean);
} catch (e) { console.log('ERROR', String(e && e.message || e).split('\n').slice(0, 3).join(' / ').slice(0, 300)); }
console.log(JSON.stringify(r));
console.log(ok ? 'ALL PASS' : 'FAIL', '/ 検査用の利用者', `${LAST} ${FIRST}`, '(片付け: live_cleanup_kenmamori.mjs)');
await b.close(); process.exit(ok ? 0 : 1);
