// 2026-11-27 trial648 / 安定版 1127d: 2台のつもり(テスト店舗・試験版)— 月間スケジュールで休止にした方が、ほかの端末の提供記録入力でも「休止」になる
//   ① B が あす(D1)の提供記録入力を保存(X は出席・中身なし) ② B をオフラインに ③ A が X を月間スケジュールのセルから休止にする → A の自動の直しで X/D1 の記録が 休止(heal-pause-recs)
//   ④ B(休止を知らない・オフライン)が D2 を保存 → つながると X/D2 の「出席」がクラウドへ ⑤ A・B・新しい端末 C のどれも、提供記録入力と月間スケジュールで D1・D2 が「休止」
//   ⑥ (--wait) 16分待つと X/D2 の記録そのものも 休止 にそろう ⑦ 片付け: 休止を取り消し、検査の記録を論理削除
//   LIVE_URL=https://tsumugi-git-trial-ones-style.vercel.app node scripts/live_1127status.mjs [--explore] [--wait] [--cleanup-only]
import { chromium } from 'playwright';
const BASE = (process.env.LIVE_URL || 'https://tsumugi-git-trial-ones-style.vercel.app').replace(/\/$/, '');
const b = await chromium.launch(); const r = {};
const open = async (tag, view) => {
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept());
  await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
  await page.evaluate(() => { localStorage.setItem('tsumugiSidebarOpen', '0'); localStorage.setItem('tsumugiDeviceName', 'live-status-' + Math.random().toString(36).slice(2, 6)); });
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
    if (/この端末の名前/.test(body)) { const inp = page.locator('input[type=text]:visible, input:not([type]):visible').first(); if (await inp.count()) { await inp.fill('live-status-' + tag); await page.waitForTimeout(200); } await page.locator('button:visible', { hasText: /この名前で保存/ }).first().click({ timeout: 1500 }).catch(() => {}); await page.waitForTimeout(3000); continue; }
    if (!/どなたですか|パスワード|この端末の名前/.test(body)) break; await page.waitForTimeout(3000); } };
  // 店舗のデータが端末に入るまで待つ(最大40秒)
  const waitData = async () => { for (let i = 0; i < 20; i++) { const n = await page.evaluate(() => { try { return (JSON.parse(localStorage.getItem('daycareAppData_v3') || '{}').patients || []).length; } catch { return 0; } }); if (n > 0) return n; await page.waitForTimeout(2000); } return 0; };
  await settle();
  if (view) { await page.evaluate((v) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: null, t: Date.now() })), view); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(6000); await settle(); }
  await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
  await settle(); console.log(tag, 'patients in device:', await waitData());
  console.log(tag, 'screen:', (await page.locator('body').innerText()).slice(0, 60).replace(/\n/g, ' / '));
  return { ctx, page }; };
const WAIT = process.argv.includes('--wait'), CLEAN_ONLY = process.argv.includes('--cleanup-only');
const PID = Number(process.env.LIVE_PID || 23); const MARK = '状態の検査(消してよい)';
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addD = (n) => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate() + n); };
const jpOf = (s) => { const d = new Date(s + 'T00:00:00'); return `${d.getMonth() + 1}月${d.getDate()}日`; };
const T = iso(new Date());
const slog = (page, n = 80) => page.evaluate((n) => { try { return JSON.parse(localStorage.getItem('tsumugiSyncLog') || '[]').slice(-n).map(x => `${x.t} ${x.ev}${x.d ? ' ' + JSON.stringify(x.d).slice(0, 70) : ''}`); } catch { return []; } }, n);
const pat = (page) => page.evaluate((pid) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3') || '{}'); const p = (d.patients || []).find(x => x.id === pid); return p ? { st: p.status, hist: (p.pauseHistory || []).map(h => [h.fromDate, h.toDate || '']), sched: p.scheduleAmPm, su: p.statusUpdatedAt || 0 } : null; }, PID);
const recOf = (page, s) => page.evaluate(({ pid, jp, y }) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3') || '{}'); const x = (d.ticketRecords || []).find(r => r.patientId === pid && r.date === jp && Number(r.year) === y && !r._deleted); return x ? { status: x.status || '', mark: /検査/.test(x.tokki || ''), ts: (x._fieldTs && x._fieldTs.status) || 0, saved: x._savedAt || 0, temp: !!(x.temp_AM || x.temp_PM || x.temp) } : null; }, { pid: PID, jp: jpOf(s), y: Number(s.slice(0, 4)) });
const resume = async (page, view, pid, ampm, date) => { await page.evaluate(({ view, pid, ampm, date }) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view, pid, ampm: ampm || 'AM', t: Date.now(), ...(date ? { date } : {}) })), { view, pid, ampm, date }); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(6000); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {}); };
const setDate = async (page, s) => { const inp = page.locator('input[type="date"]:visible').first(); await inp.fill(s); await page.waitForTimeout(2500); };
const rowStatus = (page) => page.evaluate((pid) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3') || '{}'); const p = (d.patients || []).find(x => x.id === pid); const name = p ? p.name : '\u0000';
  const els = [...document.querySelectorAll('body *')].filter(e => e.innerText && e.innerText.includes(name) && /出席|欠席|休止|振替|休業/.test(e.innerText)); if (!els.length) return '';
  els.sort((a, b) => a.innerText.length - b.innerText.length); const t = els[0].innerText.replace(/\s+/g, ' '); const m = t.match(/出席|欠席|休止|振替|休業/); return m ? m[0] : ''; }, PID);
const tokkiBox = async (page) => { let tr = page.locator(`tr:has([data-testid="rv-tokki-pick-${PID}"])`).first(); if (!(await tr.count())) { const nm = await page.evaluate((pid) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3') || '{}'); return ((d.patients || []).find(x => x.id === pid) || {}).name || ''; }, PID); tr = page.locator('tr', { hasText: nm }).first(); } return tr.locator('textarea').last(); };
const saveRec = async (page) => { await page.locator('button:visible', { hasText: /^保存$/ }).first().click(); await page.waitForTimeout(6000); };
const openMonthly = async (page) => { await resume(page, 'master', PID); await page.locator('button:visible', { hasText: /^サービス提供内容$/ }).first().click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(1000); };
const gotoMonth = async (page, s) => { const [y, m] = s.split('-').map(Number);
  for (let i = 0; i < 3; i++) { const el = page.locator('span.tabular-nums', { hasText: /\d+年\d+月/ }).first(); const lbl = await el.textContent().catch(() => ''); if (lbl && lbl.includes(`${y}年${m}月`)) break;
    const mm = (lbl || '').match(/(\d+)年(\d+)月/); const fwd = mm && (Number(mm[1]) * 12 + Number(mm[2])) < (y * 12 + m);
    await el.locator(fwd ? 'xpath=following-sibling::button[1]' : 'xpath=preceding-sibling::button[1]').click().catch(() => {}); await page.waitForTimeout(600); } };
const cellOf = async (page, s, ap) => { await gotoMonth(page, s); return (await page.locator(`[data-testid="ms-cell-${Number(s.slice(8))}-${ap}"]`).first().textContent().catch(() => '')).trim(); };
const poll = async (fn, ms, step = 3000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await new Promise(z => setTimeout(z, step)); } };
// 休止の履歴を消す(利用者マスタ → 休止の履歴 → ごみ箱)。きょう入れた検査の休止だけ
const removePause = async (page) => { const p0 = await pat(page); if (!p0 || !(p0.hist || []).some(h => h[0] === T)) { console.log('cleanup: no test pause', JSON.stringify(p0 && { st: p0.st, hist: p0.hist })); return p0 && p0.st !== '休止'; }
  await resume(page, 'master', PID); let btn = page.locator('button[title="この休止履歴を削除"]:visible').first();
  if (!(await btn.count())) { for (const tab of ['基本情報', '利用状況', 'サービス提供内容']) { await page.locator('button:visible', { hasText: new RegExp(`^${tab}$`) }).first().click({ timeout: 1500 }).catch(() => {}); await page.waitForTimeout(800); if (await btn.count()) break; } }
  if (!(await btn.count())) { console.log('cleanup: delete button not found'); return false; }
  await btn.click(); await page.waitForTimeout(6000); const p1 = await pat(page); console.log('cleanup: after delete', JSON.stringify({ st: p1.st, hist: p1.hist })); return p1.st !== '休止' && !(p1.hist || []).some(h => h[0] === T); };
const clearMarks = async (page, days, ap) => { for (const s of days) { const rc = await recOf(page, s); if (!rc || !rc.mark) continue; await resume(page, 'record', PID, ap, s); await setDate(page, s); const tb = await tokkiBox(page); if (await tb.count() && await tb.isEnabled().catch(() => false)) { await tb.fill(''); await page.waitForTimeout(400); await saveRec(page); } const r2 = await recOf(page, s); console.log('cleanup: mark', s, '→', JSON.stringify(r2 && { status: r2.status, mark: r2.mark })); } };

const A = await open('A', 'home'); const p0 = await pat(A.page);
if (!p0) { console.log('patient not found'); await b.close(); process.exit(2); }
// 利用日: 日曜はじまりの並び。きょうと、このあとの利用日を2つ
const dowAp = (s) => (p0.sched || [])[new Date(s + 'T00:00:00').getDay()] || '';
const next = []; for (let i = 1; i < 15 && next.length < 2; i++) { const s = iso(addD(i)); if (dowAp(s)) next.push(s); }
const [D1, D2] = next; const AP = dowAp(D1); console.log('pid', PID, 'today', T, dowAp(T) || '(利用日でない)', 'D1', D1, dowAp(D1), 'D2', D2, dowAp(D2), 'pre', JSON.stringify({ st: p0.st, hist: p0.hist }));
console.log('pre recs', JSON.stringify({ T: await recOf(A.page, T), D1: await recOf(A.page, D1), D2: await recOf(A.page, D2) }));
if (CLEAN_ONLY) { const okc = await removePause(A.page); await A.page.waitForTimeout(8000);
  console.log('recs', JSON.stringify({ T: await recOf(A.page, T), D1: await recOf(A.page, D1), D2: await recOf(A.page, D2) })); await clearMarks(A.page, [D1, D2], AP); await A.page.waitForTimeout(8000);
  console.log('A log:\n  ' + (await slog(A.page, 200)).filter(x => /heal/.test(x)).slice(-10).join('\n  ')); console.log(okc ? 'CLEANUP OK' : 'CLEANUP INCOMPLETE'); await b.close(); process.exit(okc ? 0 : 1); }
if (p0.st !== '利用中' || (p0.hist || []).length || !dowAp(T) || !D2 || dowAp(D2) !== AP || dowAp(T) !== AP) { console.log('この利用者では検査できません(利用中・休止の履歴なし・きょうが利用日 が条件)'); await b.close(); process.exit(2); }
let paused = false;
try {
  const B = await open('B', 'home');
  // ① B: D1 の提供記録入力を保存(出席・中身なし)
  await resume(B.page, 'record', PID, AP, D1); await setDate(B.page, D1);
  r.b_row_d1_attend = (await rowStatus(B.page)) === '出席';
  const tb1 = await tokkiBox(B.page); await tb1.fill(MARK); await B.page.waitForTimeout(400); await saveRec(B.page);
  const b1 = await recOf(B.page, D1); r.b_saved_d1 = !!b1 && b1.status === '出席' && b1.mark && !b1.temp; console.log('① B saved D1', JSON.stringify(b1));
  const a1 = await poll(async () => { const x = await recOf(A.page, D1); return x && x.mark ? x : null; }, 45000); r.a_got_d1 = !!a1; console.log('① A got D1', JSON.stringify(a1));
  // ② B を切る
  await B.ctx.setOffline(true);
  // ③ A: 月間スケジュールのきょうのセルから休止にする
  await openMonthly(A.page); await gotoMonth(A.page, T);
  await A.page.locator(`[data-testid="ms-cell-${Number(T.slice(8))}-${AP}"]`).first().click(); await A.page.waitForTimeout(700);
  await A.page.locator('button:visible', { hasText: /^休止/ }).last().click(); await A.page.waitForTimeout(700);
  const modal = A.page.locator('div.fixed', { hasText: '休止期間の登録' }).last();
  await modal.locator('input[type="text"]').first().fill('検査'); await A.page.waitForTimeout(300);
  await modal.locator('button', { hasText: /^登録$/ }).click(); paused = true; await A.page.waitForTimeout(5000);
  const pa = await pat(A.page); r.a_paused = pa.st === '休止' && pa.hist.some(h => h[0] === T && !h[1]); console.log('③ A paused', JSON.stringify({ st: pa.st, hist: pa.hist }));
  const a2 = await poll(async () => { const x = await recOf(A.page, D1); return x && x.status === '休止' ? x : null; }, 90000); r.a_healed_d1 = !!a2; console.log('③ A D1 record', JSON.stringify(await recOf(A.page, D1)));
  const lgA = await slog(A.page, 200); console.log('A log:\n  ' + lgA.filter(x => /heal|push-ok|pull-full|blocked/.test(x)).slice(-14).join('\n  '));
  r.a_heal_logged = lgA.some(x => /heal-pause-recs/.test(x));
  r.a_cell_d1 = (await cellOf(A.page, D1, AP)) === '休止'; r.a_legend = (await A.page.locator('[data-testid="ms-legend-pause"]').count()) >= 1;
  // ④ B(休止を知らない・オフライン): D2 を保存
  await setDate(B.page, D2); r.b_stale_row_d2_attend = (await rowStatus(B.page)) === '出席';
  const tb2 = await tokkiBox(B.page); await tb2.fill(MARK); await B.page.waitForTimeout(400); await saveRec(B.page); await B.page.waitForTimeout(6000);
  const b2 = await recOf(B.page, D2); const pb0 = await pat(B.page); r.b_offline_saved_d2 = !!b2 && b2.status === '出席' && pb0.st === '利用中'; console.log('④ B offline D2', JSON.stringify(b2), 'B patient', pb0.st);
  const tSaveD2 = Date.now();
  // ⑤ B をつなぐ
  await B.ctx.setOffline(false);
  const pb = await poll(async () => { const x = await pat(B.page); return x && x.st === '休止' ? x : null; }, 90000); r.b_got_pause = !!pb; await B.page.waitForTimeout(15000);
  console.log('B log:\n  ' + (await slog(B.page, 200)).filter(x => /heal|push|resend|pull-full|blocked/.test(x)).slice(-16).join('\n  '));
  r.b_row_d2_pause = (await rowStatus(B.page)) === '休止'; await setDate(B.page, D1); r.b_row_d1_pause = (await rowStatus(B.page)) === '休止';
  const b3 = await recOf(B.page, D1); r.b_rec_d1_pause = !!b3 && b3.status === '休止';
  // ⑥ 新しい端末 C と A
  const C = await open('C', 'home'); const pc = await pat(C.page); r.c_pause_kept = !!pc && pc.st === '休止' && pc.hist.some(h => h[0] === T && !h[1]);
  const c2 = await recOf(C.page, D2); r.c_has_d2 = !!c2 && c2.mark; console.log('⑥ C D1', JSON.stringify(await recOf(C.page, D1)), 'D2', JSON.stringify(c2));
  await resume(C.page, 'record', PID, AP, D1); await setDate(C.page, D1); r.c_row_d1_pause = (await rowStatus(C.page)) === '休止'; await setDate(C.page, D2); r.c_row_d2_pause = (await rowStatus(C.page)) === '休止';
  await openMonthly(C.page); r.c_cell_d1 = (await cellOf(C.page, D1, AP)) === '休止'; r.c_cell_d2 = (await cellOf(C.page, D2, AP)) === '休止'; await C.ctx.close();
  await resume(A.page, 'record', PID, AP, D2); await setDate(A.page, D2); r.a_row_d2_pause = (await rowStatus(A.page)) === '休止';
  // ⑦ 16分ほど待つと、あとから届いた D2 の「出席」の記録そのものも 休止 にそろう
  if (WAIT) { await resume(A.page, 'home', null);
    const a7 = await poll(async () => { const x = await recOf(A.page, D2); const y = await recOf(B.page, D2); console.log(`  ⑦ ${Math.round((Date.now() - tSaveD2) / 60000)}分 A=${x && x.status} B=${y && y.status}`); return (x && x.status === '休止') || (y && y.status === '休止') ? (x || y) : null; }, 22 * 60000, 60000);
    r.d2_rewritten = !!a7; await A.page.waitForTimeout(20000);
    console.log('A heal log:\n  ' + (await slog(A.page, 300)).filter(x => /heal/.test(x)).slice(-10).join('\n  ')); console.log('B heal log:\n  ' + (await slog(B.page, 300)).filter(x => /heal/.test(x)).slice(-10).join('\n  '));
    const C2 = await open('C2', 'home'); const c7 = await recOf(C2.page, D2); r.c2_d2_pause = !!c7 && c7.status === '休止'; console.log('⑦ C2 D2', JSON.stringify(c7)); await C2.ctx.close(); }
} catch (e) { console.log('ERROR', String(e && e.stack || e).slice(0, 600)); r.no_error = false; }
finally { if (paused) { try { r.cleanup_pause_removed = await removePause(A.page); await A.page.waitForTimeout(8000); } catch (e) { console.log('cleanup error', String(e).slice(0, 200)); r.cleanup_pause_removed = false; } } }
console.log(r); const ok = Object.values(r).every(Boolean); console.log(ok ? 'PASS' : 'FAIL'); await b.close(); process.exit(ok ? 0 : 1);
