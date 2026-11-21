// 2026-11-21 1121a の検査(欠席が出席に戻る)(見本データ VITE_E2E_DEMO=1 のビルド・:4175)
//   ① 分析(個人) 詳細記録: 血圧の上(140以上)と下(90以上)を別の色で(終了時も)
//   ③ 運動トレンド まとめ: 点が1つのとき日付が2つ出ない
//   ④ 利用開始日が空で記録のない方は 提供記録入力・計画書の利用者の選択に出ない(開始日を入れると出る)
//   ⑤a 休止の期間外に残った「休止」の記録: 過ぎた日は出席に戻さない・今日以降は出席に戻す
//   ⑤b 支援経過表: 終了日のない休止でも、状態が利用中なら休止扱いにしない(提供記録の休止の行が出る)
//   ⑨ 休み連絡の文面: 「〇〇のためお休みされました」
//   実行: node chk/chk_1121pause.mjs [port]
import { chromium } from 'playwright';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
page.on('dialog', d => d.accept()); page.on('pageerror', e => { console.log('PAGEERROR', e.message.slice(0, 200)); fails++; });
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const jp = (isoS) => { const d = new Date(isoS + 'T00:00:00'); return `${d.getMonth() + 1}月${d.getDate()}日`; };
const today = new Date(); const T = iso(today); const past1 = iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 9)); const past2 = iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 8));
const pastPause = iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 3)); const absDay = iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 5)); const tomorrow = iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1));
const NEWNAME = '試験 新規太郎';
// 見本データに仕込む(毎回同じ形から)
const seed = await page.evaluate(({ T, past1, past2, pastPause, absDay, tomorrow, NEWNAME, jp }) => {
  const jpf = new Function('isoS', jp);
  const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const p = d.patients.find(x => x.status === '利用中' && !x.endDate);
  p.scheduleAmPm = ['AM', 'AM', 'AM', 'AM', 'AM', 'AM', 'AM']; p.scheduleChangeHistory = []; p.startDate = '2025-01-01'; p.endDate = ''; d.holidays = [];
  // 休止の履歴: 先月いっぱいで終わった休止(終了日あり)
  const lm = new Date(); lm.setDate(0); const lmEnd = `${lm.getFullYear()}-${String(lm.getMonth() + 1).padStart(2, '0')}-${String(lm.getDate()).padStart(2, '0')}`;
  const lmStart = lmEnd.slice(0, 8) + '01';
  p.pauseHistory = [{ fromDate: lmStart, toDate: lmEnd, reason: '入院' }]; p.docUpdates = [];
  d.systemSettings = { ...(d.systemSettings || {}), exerciseItems: [{ id: 'ex_chk1', name: '検査運動', defaultUnit: '回' }] }; const exKeys = ['ex_chk1']; // 運動項目を1つ仕込む(まとめの折れ線のため)
  d.ticketRecords = (d.ticketRecords || []).filter(r => r.patientId !== p.id);
  const Y = new Date().getFullYear();
  const base = (dIso, extra) => ({ id: `t_${dIso}`, patientId: p.id, name: p.name, kana: p.kana || '', date: jpf(dIso), year: Y, dayOfWeek: '月', status: '出席', temp: '36.5', bpUpSt: '', bpDnSt: '', plSt: '', bpUpEn: '', bpDnEn: '', plEn: '', massage: '', exercises: {}, tokki: '', ...extra });
  d.ticketRecords.push(base(past1, { bpUpSt: '150', bpDnSt: '95', plSt: '70', bpUpEn: '120', bpDnEn: '92', plEn: '68', exercises: { [exKeys[0]]: '10' } }));
  d.ticketRecords.push(base(past2, { bpUpSt: '120', bpDnSt: '70', plSt: '66' }));
  d.ticketRecords.push(base(pastPause, { status: '休止', temp: '', tokki: '' }));
  d.ticketRecords.push(base(tomorrow, { status: '休止', temp: '', tokki: '' }));
  d.ticketRecords.push(base(absDay, { status: '欠席', temp: '', tokki: '通院（整形外科）' }));
  // 利用開始日が空で記録のない新しい利用者
  const nid = Math.max(0, ...d.patients.map(x => Number(x.id) || 0), Number(d.patientIdSeq) || 0) + 1;
  d.patients.push({ id: nid, name: NEWNAME, kana: 'しけん しんきたろう', status: '利用中', scheduleAmPm: ['AM', 'AM', 'AM', 'AM', 'AM', 'AM', 'AM'], startDate: '', endDate: '', careLevel: '要介護1', pickupType: 'fixed', pickupTimes: ['', '', '', '', '', '', ''] });
  d.patientIdSeq = nid;
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0');
  return { pid: p.id, name: p.name, nid, exKey: exKeys[0] || '' };
}, { T, past1, past2, pastPause, absDay, tomorrow, NEWNAME, jp: `const d = new Date(isoS + 'T00:00:00'); return (d.getMonth() + 1) + '月' + d.getDate() + '日';` });
const resume = async (view, pid, extra) => { await page.evaluate(({ view, pid, extra }) => { sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view, pid, t: Date.now() })); Object.entries(extra || {}).forEach(([k, v]) => sessionStorage.setItem(k, v)); }, { view, pid, extra }); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {}); };
// 提供記録入力: 名前の行の状態を読む(行=名前を含むいちばん小さい要素のうち、状態の言葉も含むもの)
const rowStatus = (name) => page.evaluate((name) => {
  const els = [...document.querySelectorAll('body *')].filter(e => e.innerText && e.innerText.includes(name) && /出席|欠席|休止|振替|休業/.test(e.innerText)); // 行は button.tsu-rv-row
  if (!els.length) return '';
  els.sort((a, b) => a.innerText.length - b.innerText.length); const t = els[0].innerText.replace(/\s+/g, ' ');
  const m = t.match(/出席|欠席|休止|振替|休業/); return m ? m[0] : '';
}, name);
// 提供記録入力の行の名前(1人1行の button.tsu-rv-row の文字。body.innerText には出ない部分があるので textContent で読む)
const rvText = () => page.evaluate(() => [...document.querySelectorAll('.tsu-rv-row')].map(e => e.textContent).join(' | '));
const setDate = async (isoS) => { const inp = page.locator('input[type="date"]:visible').first(); await inp.fill(isoS); await page.waitForTimeout(1500); };
// ⑤a・④ 提供記録入力
await resume('record', seed.pid);
await setDate(pastPause);
let st = await rowStatus(seed.name); ok(st === '休止', `⑤a 過ぎた日(${pastPause})の残った休止は休止のまま(出席に戻さない) → ${st || '行なし'}`);
await setDate(tomorrow);
st = await rowStatus(seed.name); ok(st === '出席', `⑤a 今日以降(${tomorrow})の残った休止は出席に戻す → ${st || '行なし'}`);
// ⑤b 支援経過表: 終了日のない休止 + 状態は利用中 → 休止扱いにしない(提供記録の休止の行が出る・利用再開の行は出ない)
await page.evaluate(({ pid, from }) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const p = d.patients.find(x => x.id === pid); p.pauseHistory = [{ fromDate: from, toDate: '', reason: '入院' }]; p.status = '利用中'; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); sessionStorage.setItem('tsumugiReopenPF', JSON.stringify({ patientId: pid, tab: '__support', keep: true })); }, { pid: seed.pid, from: past2 });
await resume('master', seed.pid); await page.waitForTimeout(1500);
let modal = page.locator('[data-testid="personal-file-modal"]'); if (!(await modal.count())) { await page.locator('button', { hasText: /個人ファイル/ }).first().click().catch(() => {}); await page.waitForTimeout(1500); modal = page.locator('[data-testid="personal-file-modal"]'); }
const tabs = modal.locator('button:visible', { hasText: '支援経過表' }); if (await tabs.count()) { await tabs.last().click(); await page.waitForTimeout(1500); }
const txt = (await modal.locator('textarea, input, select').evaluateAll(els => els.map(e => e.value || '').join(' | '))).replace(/\s+/g, ' ');
ok(txt.includes(pastPause) && /休止/.test(txt), `⑤b 支援経過表に提供記録の休止(${pastPause})の行が出る(終了日なし・利用中の休止履歴は期間扱いにしない)`);
ok(!/利用再開/.test(txt), '⑤b 「利用再開」の行は出ない(終了日が無い)');
await b.close(); console.log(fails ? `FAIL ${fails}` : 'ALL PASS'); process.exit(fails ? 1 : 0);
