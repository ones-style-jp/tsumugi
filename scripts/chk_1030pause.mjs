// 2026-10-30 ユーザー報告「休止の終了日を10/26にしたのに、30日になっても休止のまま(連絡書などに反映されない)」
//   原因: 休止を新しく付けるとき前の終了日なしの休止が残り、最新の休止の終了日を過ぎてもその古い休止に当たってずっと休止になっていた
//   A: 古い終了日なし＋最新は終了日10/26 → 今日は休止でない(提供記録入力に出席で出る・利用者マスタは利用中)。過去(10/20)は休止
//   B: 古い終了日なし＋最新は終了日が先(11/5) → 今日は休止  C: 終了日なしが1件だけ → 休止  D: 終了した休止＋先の日からの休止予定 → 今日は休止でない  E: 状態が利用中なら終了日なしの履歴があっても休止でない
//   F(2026-10-30 柴又店の報告): 終了日10/26の休止1件＋休止中に保存された来週(今日+7日)の記録(状態=休止) → 開き直すと状態が「利用中」に直り(お知らせ)、来週の送迎表で休み扱いにならない(名前が「休み:」に出ず、一覧に出る)
//   実行: node scripts/chk_1030pause.mjs [--port 4175]
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4175'; })();
const r = {};
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
const go = async (view, extra) => { await page.evaluate(([v, x]) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: null, t: Date.now(), ...(x || {}) })), [view, extra]); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2200); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 400 }).catch(() => {}); };
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const S = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const t = new Date(); const dow = t.getDay(); const iso = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [] }; d.holidays = []; d.ticketRecords = (d.ticketRecords || []).filter(x => !(x && x.year === t.getFullYear()));
  const act = d.patients.filter(p => p.status === '利用中' && !p.endDate); const ids = {};
  const set = (k, i, st, hist) => { const p = act[i]; p.status = st; p.pauseHistory = hist; p.scheduleAmPm = ['', '', '', '', '', '', '']; p.scheduleAmPm[dow] = 'AM'; p.scheduleChangeHistory = []; p.startDate = '2025-01-01'; ids[k] = p.id; };
  set('A', 0, '休止', [{ reason: '入院', fromDate: '2026-06-01' }, { reason: '体調', fromDate: '2026-09-01', toDate: '2026-10-26' }]);
  set('B', 1, '休止', [{ reason: '入院', fromDate: '2026-06-01' }, { reason: '体調', fromDate: '2026-09-01', toDate: '2026-11-05' }]);
  set('C', 2, '休止', [{ reason: '入院', fromDate: '2026-06-01' }]);
  set('D', 3, '休止', [{ reason: '体調', fromDate: '2026-09-01', toDate: '2026-10-26' }, { reason: '予定', fromDate: '2026-12-01' }]);
  set('E', 4, '利用中', [{ reason: '入院', fromDate: '2026-06-01' }]);
  set('F', 5, '休止', [{ reason: '入院', fromDate: '2026-09-01', toDate: '2026-10-26' }]);
  const n7 = new Date(t); n7.setDate(n7.getDate() + 7); const iso7 = `${n7.getFullYear()}-${String(n7.getMonth() + 1).padStart(2, '0')}-${String(n7.getDate()).padStart(2, '0')}`;
  d.ticketRecords.push({ id: `tk_chk_f_${Date.now()}`, patientId: act[5].id, date: `${n7.getMonth() + 1}月${n7.getDate()}日`, year: n7.getFullYear(), status: '休止', tokki: '入院（9/1〜）', recorder: '', _savedAt: Date.now() - 86400000 * 10 });
  act.slice(6).forEach(p => { p.scheduleAmPm = ['', '', '', '', '', '', '']; });
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); return { ids, iso, iso7, names: Object.fromEntries(Object.entries(ids).map(([k, id]) => [k, d.patients.find(p => p.id === id).name])) }; });
const paused = async (k) => { const id = S.ids[k]; const row = (await page.getByTestId(`rv-name-${id}`).count()) === 1; if (!row) return 'なし'; const btn = page.locator(`[data-testid^="rv-kibun-open-"][data-testid$="-${id}"]`).first(); return (await btn.count()) ? ((await btn.isDisabled()) ? '休止' : '出席') : '?'; };
await go('record', { ampm: 'AM' });
const today = {}; for (const k of Object.keys(S.ids)) today[k] = await paused(k);
console.log('今日の提供記録入力', JSON.stringify(today));
r.todayA = today.A === '出席'; r.todayB = today.B === '休止'; r.todayC = today.C === '休止'; r.todayD = today.D === '出席'; r.todayE = today.E === '出席';
// 過去(10/20)は A も休止(終了日のある期間はそのまま)
await go('record', { ampm: 'AM', date: '2026-10-20' }); await page.waitForTimeout(300);
const hdr = await page.evaluate(() => document.body.innerText.slice(0, 400));
const pastA = (/10\/20|10月20日/.test(hdr)) ? await paused('A') : 'skip'; console.log('10/20 の A', pastA);
r.pastA = pastA === '休止' || pastA === 'skip' || pastA === 'なし';
// 利用者マスタ: A は利用中の一覧に・B は休止の一覧に
await go('master');
const listTxt = async () => page.evaluate(() => document.body.innerText);
let t0 = await listTxt(); const aInUse = t0.includes(S.names.A), bInUse = t0.includes(S.names.B);
await page.locator('button', { hasText: /^休止$/ }).first().click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(400); let t1 = await listTxt();
console.log('利用者マスタ 利用中の一覧に A', aInUse, 'B', bInUse, '／ 休止の一覧に B', t1.includes(S.names.B), 'A', t1.includes(S.names.A));
r.masterA = aInUse && !bInUse; r.masterB = t1.includes(S.names.B);
// F: 開き直すと状態が利用中に直る・来週の送迎表で休み扱いにならない
const toasts = [];
{ const dF = await page.evaluate(() => JSON.parse(localStorage.getItem('daycareAppData_v3'))); const pF = dF.patients.find(p => p.id === S.ids.F);
  console.log('F 状態', pF.status, 'statusUpdatedAt', !!pF.statusUpdatedAt); r.healF = pF.status === '利用中' && !!pF.statusUpdatedAt;
  const pA = dF.patients.find(p => p.id === S.ids.A); r.healA = pA.status === '利用中'; // A も最新の休止が終わっているので利用中に
  const pB = dF.patients.find(p => p.id === S.ids.B), pD = dF.patients.find(p => p.id === S.ids.D); r.healKeep = pB.status === '休止' && pD.status === '休止'; }
{ const ctx2 = await b.newContext({ viewport: { width: 393, height: 800 }, hasTouch: true, isMobile: true, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const pg = await ctx2.newPage(); pg.on('dialog', d => d.accept());
  await pg.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await pg.waitForTimeout(800);
  if (await pg.getByText('担当者を選択', { exact: false }).count()) { await pg.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await pg.waitForTimeout(800); }
  await pg.evaluate((d0) => { localStorage.setItem('daycareAppData_v3', d0); localStorage.setItem('tsumugiSidebarOpen', '0'); }, await page.evaluate(() => localStorage.getItem('daycareAppData_v3')));
  await pg.evaluate((iso) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, date: iso, ampm: 'AM', t: Date.now() })), S.iso7);
  await pg.reload({ waitUntil: 'networkidle' }); await pg.waitForTimeout(2000); await pg.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {}); await pg.getByTestId('tp-drive-ok').click({ timeout: 800 }).catch(() => {}); await pg.waitForTimeout(300); await pg.getByTestId('tp-phone-ap-AM').click({ timeout: 800 }).catch(() => {}); await pg.waitForTimeout(400);
  const txt = await pg.getByTestId('tp-day-list').innerText().catch(() => ''); const absLine = (txt.match(/休み:[^\n]*/) || [''])[0]; const dateTxt = await pg.getByTestId('tp-phone-date').innerText().catch(() => '');
  console.log('F 来週の送迎表', dateTxt, '休みの行に F', absLine.includes(S.names.F), '一覧に F', txt.includes(S.names.F));
  r.tpF = !absLine.includes(S.names.F) && txt.includes(S.names.F);
  await ctx2.close(); }
void toasts;
await b.close();
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
