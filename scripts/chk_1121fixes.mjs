// 2026-11-21 trial606/1121a の検査(見本データ VITE_E2E_DEMO=1 のビルド・:4175)
//   ① 分析(個人) 詳細記録: 血圧の上(140以上)と下(90以上)を別の色で(終了時も)
//   ③ 運動トレンド まとめ: 点が1つのとき日付が2つ出ない
//   ④ 利用開始日が空で記録のない方は 提供記録入力・計画書の利用者の選択に出ない(開始日を入れると出る)
//   (⑤ 欠席が出席に戻る は chk_1121pause.mjs)
//   ⑨ 休み連絡の文面: 「〇〇のためお休みされました」
//   実行: node chk/chk_1121fixes.mjs [port]
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
// ④ 提供記録入力
await resume('record', seed.pid);
await setDate(past2); // 平日(今日が土曜・休業日のこともあるので過去の平日で見る)
let body = await rvText();
ok(body.includes(seed.name) && !body.includes(NEWNAME), `④ 利用開始日が空で記録のない方は提供記録入力(${past2})に出ない`);
// ④ 計画書の利用者の選択
await resume('kinou_keikaku', seed.pid);
const kk = page.locator('[data-testid="kk-patient"]').first();
if (await kk.count()) { await kk.click(); await page.waitForTimeout(600); const pop = await page.locator('[data-testid="kk-patient-pop"]').innerText().catch(() => ''); ok(!pop.includes(NEWNAME), '④ 計画書の利用者の選択にも出ない'); await page.keyboard.press('Escape'); }
else console.log('INFO 計画書の利用者の選択(kk-patient)が見つからない');
// ④ 開始日を入れると出る
await page.evaluate((nid) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const p = d.patients.find(x => x.id === nid); p.startDate = '2026-11-01'; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); }, seed.nid);
await resume('record', seed.pid); await setDate(past2);
body = await rvText(); ok(body.includes(NEWNAME), `④ 利用開始日を入れると提供記録入力(${past2})に出る`);
// ① ③ 分析(個人)
await resume('dash_personal', seed.pid);
const sel = page.locator('select').first(); if (await sel.count()) { await sel.selectOption(String(seed.pid)).catch(() => {}); await page.waitForTimeout(800); }
await page.locator('button', { hasText: /^1ヶ月$/ }).first().click().catch(() => {}); await page.waitForTimeout(1000);
// 詳細記録は折りたたみのことがある → 見出しを押して開く
const detHead = page.locator('#sec-detail > div').first(); if (!(await page.locator('[data-testid="det-bp-st"]').count())) { await detHead.click().catch(() => {}); await page.waitForTimeout(800); }
if (!(await page.locator('[data-testid="det-bp-st"]').count())) { await page.locator('#sec-detail').scrollIntoViewIfNeeded().catch(() => {}); await detHead.click().catch(() => {}); await page.waitForTimeout(800); }
const bp = await page.evaluate(() => {
  const cells = [...document.querySelectorAll('[data-testid="det-bp-st"]')]; const c = cells.find(x => /150/.test(x.innerText)); const c2 = cells.find(x => /120\s*\/\s*70/.test(x.innerText));
  const col = (el, k) => el ? getComputedStyle(el.querySelector(`[data-bp="${k}"]`)).color : '';
  const en = [...document.querySelectorAll('[data-testid="det-bp-en"]')].find(x => /120\s*\/\s*92/.test(x.innerText));
  return { n: cells.length, up: col(c, 'up'), dn: col(c, 'dn'), up2: col(c2, 'up'), dn2: col(c2, 'dn'), enUp: col(en, 'up'), enDn: col(en, 'dn'), hasEn: !!en, warn: c ? c.innerText.includes('⚠') : false };
});
ok(bp.n > 0, `① 詳細記録の血圧の欄が出る (${bp.n}行)`);
ok(bp.up === 'rgb(220, 38, 38)' && bp.dn === 'rgb(234, 88, 12)' && bp.warn, `① 150/95: 上は赤・下はオレンジ・⚠ (${bp.up} / ${bp.dn})`);
ok(bp.up2 === 'rgb(71, 85, 105)' && bp.dn2 === 'rgb(71, 85, 105)', `① 120/70: どちらも通常の色 (${bp.up2} / ${bp.dn2})`);
if (bp.hasEn) ok(bp.enUp === 'rgb(71, 85, 105)' && bp.enDn === 'rgb(234, 88, 12)', `① 終了時 120/92: 下だけオレンジ (${bp.enUp} / ${bp.enDn})`); else console.log('INFO 終了時の血圧の欄は非表示の設定(見本)');
// ③ まとめ
await page.locator('[data-testid="ex-summary-btn"]').first().click().catch(() => {}); await page.waitForTimeout(1000);
const dup = await page.evaluate(() => {
  const svgs = [...document.querySelectorAll('[data-testid="ex-summary"] svg')]; let bad = 0, one = 0;
  svgs.forEach(s => { const labs = [...s.querySelectorAll('text')].map(t => t.textContent).filter(t => /^\d+\/\d+$|^\d+月$/.test(t)); if (labs.length === 2 && labs[0] === labs[1]) bad++; if (labs.length === 1) one++; });
  return { n: svgs.length, bad, one };
});
ok(dup.n > 0, `③ まとめの折れ線が出る (${dup.n}本)`);
ok(dup.bad === 0, `③ 同じ日付が両端に2つ出る折れ線が無い (${dup.bad}本・日付1つ=${dup.one}本)`);
// ⑨ 休み連絡
await resume('absence_fax', seed.pid, { tsumugiOpenFax: JSON.stringify({ type: 'absence', patientId: seed.pid, date: absDay }) });
await page.waitForTimeout(1000);
const memo = await page.locator('textarea').evaluateAll(els => (els.map(e => e.value).find(v => /いつもお世話/.test(v)) || ''));
ok(/整形外科のためお休みされました。/.test(memo), `⑨ 連絡事項の文: 「整形外科のためお休みされました」 (${memo.replace(/\n/g, '／').slice(0, 80)})`);
await b.close(); console.log(fails ? `FAIL ${fails}` : 'ALL PASS'); process.exit(fails ? 1 : 0);
