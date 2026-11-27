// 2026-11-27 1127d の検査: 「月間スケジュールで休止にした方が、提供記録入力で出席になっている」
//   その日の状態を、月間スケジュール・提供記録入力・日誌・提供記録・実績で同じ決め方にする(tsuPauseForces / tsuRecStOn)＋記録そのものを直す自動修復(2方向)
//   見本データ(VITE_E2E_DEMO=1 のビルド)で、休止中の方 P に次の記録を仕込む:
//     Da 休止の期間・出席(中身なし)・状態の時刻が休止の変更より新しい(今回の壊れ方) → どの画面も 休止・記録も 休止 に書き換わる
//     Db 休止の期間・出席(体温あり)                                          → どの画面も 出席(記録のまま)
//     Dc 休止の期間・欠席                                                    → どの画面も 欠席
//     De 休止の期間・出席(中身なし)・いま付けたばかり                        → 画面は 休止・記録はまだ書き換えない(見送り)
//     Df 休止の期間・記録なし                                                → 休止
//     Dd 休止の期間の前・休止(中身なし)                                      → 出席に戻る(前からの修復)
//   つづけて、利用中の方 Q を月間スケジュールのセルから休止にする(画面の操作) → 先の日の 出席 の記録(中身なし)がその場で 休止 にそろう・体温ありの記録は出席のまま
//   実行: node chk/chk_1127status.mjs [port]
import { chromium } from 'playwright';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
const PROBE = process.argv.includes('--probe');
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
page.on('dialog', d => d.accept()); page.on('pageerror', e => { console.log('PAGEERROR', e.message.slice(0, 200)); fails++; });
const heals = []; page.on('console', m => { const t = m.text(); if (/提供記録の修復/.test(t)) heals.push(t); });
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addD = (n) => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate() + n); };
const jpOf = (isoS) => { const d = new Date(isoS + 'T00:00:00'); return `${d.getMonth() + 1}月${d.getDate()}日`; };
const T = iso(new Date());
const Da = iso(addD(-1)), Db = iso(addD(-2)), Dc = iso(addD(-3)), Df = iso(addD(-4)), De = iso(addD(3)), Dd = iso(addD(-9)), pauseFrom = iso(addD(-6));
const Q1 = iso(addD(1)), Q2 = iso(addD(2)); // Q: あす=出席(中身なし)・あさって=出席(体温あり)
const sameMonth = (isoS) => isoS.slice(0, 7) === T.slice(0, 7);
const seed = await page.evaluate(({ Da, Db, Dc, De, Dd, pauseFrom, Q1, Q2 }) => {
  const jp = (isoS) => { const d = new Date(isoS + 'T00:00:00'); return `${d.getMonth() + 1}月${d.getDate()}日`; };
  const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const act = d.patients.filter(x => x.status === '利用中' && !x.endDate); const p = act[0], q = act[1];
  d.systemSettings = d.systemSettings || {}; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [] }; d.holidays = []; d.monthlyShifts = {};
  [p, q].forEach(x => { x.scheduleAmPm = ['AM', 'AM', 'AM', 'AM', 'AM', 'AM', 'AM']; x.scheduleChangeHistory = []; x.startDate = '2025-01-01'; x.endDate = ''; });
  const now = Date.now(); const H = 3600000;
  p.status = '休止'; p.pauseHistory = [{ fromDate: pauseFrom, toDate: '', reason: '入院' }]; p.statusUpdatedAt = now - 6 * 24 * H;
  q.status = '利用中'; q.pauseHistory = []; q.statusUpdatedAt = now - 30 * 24 * H;
  d.ticketRecords = (d.ticketRecords || []).filter(r => r.patientId !== p.id && r.patientId !== q.id);
  const DN = '日月火水木金土';
  const base = (x, dIso, extra) => { const dt = new Date(dIso + 'T00:00:00'); return { id: `t1127_${x.id}_${dIso}`, patientId: x.id, name: x.name, kana: x.kana || '', date: jp(dIso), year: dt.getFullYear(), dayOfWeek: DN[dt.getDay()], status: '出席', exercises: {}, tokki: '', _savedAt: now - H, ...extra }; };
  d.ticketRecords.push(
    base(p, Da, { _fieldTs: { status: now - H } }),          // 状態の時刻(1時間前)が休止の変更(6日前)より新しい=前の決まりでは「出席のまま」になっていた
    base(p, Db, { temp_AM: '36.5', _fieldTs: { status: now - H } }),
    base(p, Dc, { status: '欠席', tokki: '体調不良（発熱）', _fieldTs: { status: now - H, tokki: now - H } }),
    base(p, De, { _savedAt: now, _fieldTs: { status: now } }),
    base(p, Dd, { status: '休止' }),
    base(q, Q1, {}), base(q, Q2, { temp_AM: '36.4' }));
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0');
  return { pid: p.id, name: p.name, qid: q.id, qname: q.name };
}, { Da, Db, Dc, De, Dd, pauseFrom, Q1, Q2 });
const resume = async (view, pid, extra, date) => { await page.evaluate(({ view, pid, extra, date }) => { sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view, pid, ampm: 'AM', t: Date.now(), ...(date ? { date } : {}) })); Object.entries(extra || {}).forEach(([k, v]) => sessionStorage.setItem(k, v)); }, { view, pid, extra, date }); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {}); };
const recOf = (pid, isoS) => page.evaluate(({ pid, jp }) => (JSON.parse(localStorage.getItem('daycareAppData_v3')).ticketRecords || []).find(r => r.patientId === pid && r.date === jp) || null, { pid, jp: jpOf(isoS) });
const rowStatus = (name) => page.evaluate((name) => {
  const els = [...document.querySelectorAll('body *')].filter(e => e.innerText && e.innerText.includes(name) && /出席|欠席|休止|振替|休業/.test(e.innerText));
  if (!els.length) return '';
  els.sort((a, b) => a.innerText.length - b.innerText.length); const t = els[0].innerText.replace(/\s+/g, ' ');
  const m = t.match(/出席|欠席|休止|振替|休業/); return m ? m[0] : '';
}, name);
const setDate = async (isoS) => { const inp = page.locator('input[type="date"]:visible').first(); await inp.fill(isoS); await page.waitForTimeout(1500); };

// ---- 1 自動修復(記録そのもの)
await resume('home', null); await page.waitForTimeout(1500);
let ra = await recOf(seed.pid, Da), rb = await recOf(seed.pid, Db), rc = await recOf(seed.pid, Dc), re = await recOf(seed.pid, De), rd = await recOf(seed.pid, Dd);
ok(ra && ra.status === '休止' && Number(ra._fieldTs && ra._fieldTs.status) > Date.now() - 60000, `1 Da ${Da} 休止の期間の「出席」(中身なし・状態の時刻が休止より新しい)は記録が 休止 に書き換わる → ${ra && ra.status}`);
ok(rb && rb.status === '出席', `1 Db ${Db} 体温の入った「出席」は書き換えない → ${rb && rb.status}`);
ok(rc && rc.status === '欠席' && /体調不良/.test(rc.tokki || ''), `1 Dc ${Dc} 「欠席」は書き換えない → ${rc && rc.status}`);
ok(re && re.status === '出席', `1 De ${De} いま付けたばかりの「出席」はまだ書き換えない(15分は見送り) → ${re && re.status}`);
ok(rd && rd.status === '出席', `1 Dd ${Dd} 休止の期間の前に残った「休止」は 出席 に戻る → ${rd && rd.status}`);
ok(heals.length >= 1, `1 修復のログが出る → ${heals.length}`);
// 開き直しても、もう書き換えは起きない(行ったり来たりしない)
const n0 = heals.length; await resume('home', null); await page.waitForTimeout(1500);
ok(heals.length === n0, `1 開き直しても修復は繰り返さない → ${heals.length - n0} 回`);

// ---- 2 提供記録入力
await resume('record', seed.pid);
const want = [[Da, '休止', 'Da 出席(中身なし)'], [Db, '出席', 'Db 出席(体温あり)'], [Dc, '欠席', 'Dc 欠席'], [De, '休止', 'De 付けたばかりの出席(記録はまだ出席)'], [Df, '休止', 'Df 記録なし'], [Dd, '出席', 'Dd 期間の前']];
for (const [dIso, w, lab] of want) { await setDate(dIso); const st = await rowStatus(seed.name); ok(st === w, `2 提供記録入力 ${dIso} ${lab} → ${st || '行なし'}(期待 ${w})`); }

// ---- 3 月間スケジュール(利用者マスタ → サービス提供内容)
const openMonthly = async (pid) => { await resume('master', pid); await page.waitForTimeout(800); await page.locator('button:visible', { hasText: /^サービス提供内容$/ }).first().click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(800); };
const gotoMonth = async (isoS) => { const [y, m] = isoS.split('-').map(Number);
  for (let i = 0; i < 3; i++) { const el = page.locator('span.tabular-nums', { hasText: /\d+年\d+月/ }).first(); const lbl = await el.textContent().catch(() => ''); if (lbl && lbl.includes(`${y}年${m}月`)) break;
    const mm = (lbl || '').match(/(\d+)年(\d+)月/); const fwd = mm && (Number(mm[1]) * 12 + Number(mm[2])) < (y * 12 + m);
    await el.locator(fwd ? 'xpath=following-sibling::button[1]' : 'xpath=preceding-sibling::button[1]').click().catch(() => {}); await page.waitForTimeout(500); } };
const cellOf = async (isoS) => { await gotoMonth(isoS); return (await page.locator(`[data-testid="ms-cell-${Number(isoS.slice(8))}-AM"]`).first().textContent().catch(() => '')).trim(); };
await openMonthly(seed.pid);
for (const [dIso, w, lab] of want) { const c = await cellOf(dIso); ok(c === w, `3 月間スケジュール ${dIso} ${lab} → ${c || '空'}(期待 ${w})`); }
ok(await page.locator('[data-testid="ms-legend-pause"]').count() >= 1, '3 月間スケジュールの凡例に「休止」がある');

// ---- 4 日誌
if (PROBE) { await resume('diary', null, null, Da); console.log('PROBE diary', JSON.stringify((await page.evaluate(() => document.body.innerText)).slice(0, 3000))); }
const diarySt = async (dIso, name) => page.evaluate(({ name }) => {
  // 日誌の表: 名前の入った行(tr か、いちばん小さい枠)から状態の言葉を読む
  const fam = name.replace(/[\s　]+/g, '');
  const rows = [...document.querySelectorAll('tr, [data-diary-row]')].filter(e => (e.textContent || '').replace(/[\s　]+/g, '').includes(fam));
  const hit = rows.map(e => { const m = (e.textContent || '').match(/休止|欠席|休業|振替|出席/); const vals = [...e.querySelectorAll('select')].map(s => s.value).join(','); return (vals.match(/休止|欠席|休業|振替|出席/) || m || [''])[0]; }).filter(Boolean);
  return hit.join(',');
}, { name });
for (const [dIso, w, lab] of want.filter(x => x[0] <= T)) { await resume('diary', null, null, dIso); const st = await diarySt(dIso, seed.name); ok(st.split(',')[0] === w, `4 日誌 ${dIso} ${lab} → ${st || '行なし'}(期待 ${w})`); }

// ---- 5 提供記録(月の表)
await resume('ticket', seed.pid); await page.waitForTimeout(800);
if (PROBE) console.log('PROBE ticket', JSON.stringify((await page.evaluate(() => document.body.innerText)).slice(0, 2500)));
const ticketSt = (dIso) => page.evaluate(({ day }) => {
  // 1日ぶんの枠は「26\n（木）\n 状態 体調 … 個別（実施担当）\n\n休止 …」の順に並ぶ
  const t = document.body.innerText; const m = t.match(new RegExp(`(?:^|\\n)${day}\\n（[日月火水木金土]）\\n`)); if (!m) return '';
  const rest = t.slice(m.index + m[0].length, m.index + m[0].length + 400); const k = rest.indexOf('個別（実施担当）'); if (k < 0) return '';
  return (rest.slice(k).match(/休止|欠席|休業|振替|臨時|出席/) || [''])[0];
}, { day: Number(dIso.slice(8)) });
for (const [dIso, w, lab] of want.filter(x => sameMonth(x[0]))) { const st = await ticketSt(dIso); ok(st === w, `5 提供記録 ${dIso} ${lab} → ${st || '行なし'}(期待 ${w})`); }

// ---- 6 実績
await resume('jisseki', null); await page.waitForTimeout(800);
if (PROBE) console.log('PROBE jisseki', JSON.stringify((await page.evaluate(() => document.body.innerText)).slice(0, 1500)));
const jissekiSt = (dIso) => page.evaluate(({ name, day }) => {
  const fam = name.replace(/[\s　]+/g, '');
  const tr = [...document.querySelectorAll('tr')].find(e => (e.textContent || '').replace(/[\s　]+/g, '').includes(fam)); if (!tr) return 'no-row';
  const table = tr.closest('table'); const head = [...table.querySelectorAll('thead tr')].pop(); const hs = [...head.children].map(c => (c.textContent || '').trim());
  const idx = hs.findIndex(h => new RegExp(`^${day}(\\D|$)`).test(h)); if (idx < 0) return 'no-col:' + hs.slice(0, 8).join('/');
  const off = tr.children.length - head.children.length; const c = tr.children[idx + off]; return c ? (c.textContent || '').trim() : 'no-cell';
}, { name: seed.name, day: Number(dIso.slice(8)) });
const jw = { '休止': /止/, '出席': /○|◯|〇/, '欠席': /欠|×/ };
// 実績は記録のある日だけ載る(記録の無い Df は空のまま)
for (const [dIso, w, lab] of want.filter(x => sameMonth(x[0]) && x[0] <= T)) { const st = await jissekiSt(dIso); ok(dIso === Df ? st === '' : jw[w].test(st), `6 実績 ${dIso} ${lab} → ${JSON.stringify(st)}(期待 ${w})`); }

// ---- 7 画面の操作で休止にする(月間スケジュールのセル → 休止 → 登録) → 先の日の出席の記録がその場でそろう
await openMonthly(seed.qid); await gotoMonth(T);
await page.locator(`[data-testid="ms-cell-${Number(T.slice(8))}-AM"]`).first().click(); await page.waitForTimeout(600);
await page.locator('button:visible', { hasText: /^休止/ }).last().click().catch(() => {}); await page.waitForTimeout(600);
const modal = page.locator('div.fixed', { hasText: '休止期間の登録' }).last();
await modal.locator('input[type="text"]').first().fill('入院'); await page.waitForTimeout(200);
await modal.locator('button', { hasText: /^登録$/ }).click(); await page.waitForTimeout(3000);
const qp = await page.evaluate((qid) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const p = d.patients.find(x => x.id === qid); return { status: p.status, hist: p.pauseHistory }; }, seed.qid);
ok(qp.status === '休止' && (qp.hist || []).some(h => h.fromDate === T && !h.toDate), `7 Q を月間スケジュールから休止にした → ${qp.status} ${JSON.stringify(qp.hist)}`);
let q1 = await recOf(seed.qid, Q1), q2 = await recOf(seed.qid, Q2);
ok(q1 && q1.status === '休止', `7 Q あす ${Q1} の「出席」の記録(中身なし)は、開き直さなくても 休止 にそろう → ${q1 && q1.status}`);
ok(q2 && q2.status === '出席', `7 Q あさって ${Q2} の体温の入った記録は 出席 のまま → ${q2 && q2.status}`);
if (sameMonth(Q1)) { const c = await cellOf(Q1); ok(c === '休止', `7 月間スケジュール ${Q1} → ${c || '空'}`); }
await resume('record', seed.qid); await setDate(Q1); let st = await rowStatus(seed.qname); ok(st === '休止', `7 提供記録入力 ${Q1} の Q → ${st || '行なし'}(期待 休止)`);
await setDate(Q2); st = await rowStatus(seed.qname); ok(st === '出席', `7 提供記録入力 ${Q2} の Q(体温あり) → ${st || '行なし'}(期待 出席)`);
// 休止を保存しても(提供記録入力の保存)、欠席は欠席のまま
await b.close(); console.log(fails ? `FAIL ${fails}` : 'ALL PASS'); process.exit(fails ? 1 : 0);
