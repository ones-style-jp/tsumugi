// 2026-11-22 1122a の検査(休止の状態が画面ごとに食い違う)(見本データ VITE_E2E_DEMO=1 のビルド・:4175 / 安定版 :4173)
//   A 過ぎた日に「休止」の記録(休止の期間外): 提供記録入力=休止・数値は入れられない(特記だけ) / 利用者マスタの月間スケジュール=休止
//   B 休止の期間の日: はっきり付けた「欠席」の記録はそのまま(休止に上書きしない・保存しても欠席のまま)、記録の無い日は休止
//   C 休み連絡: 理由欄は大分類だけ(「通院・受診（整形外科）」→「通院・受診」)・文は「整形外科のためお休みされました」(trial607: 試験版だけ)
//   実行: node chk/chk_1122status.mjs [port] [--no-fax]
import { chromium } from 'playwright';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
const NOFAX = process.argv.includes('--no-fax');
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
page.on('dialog', d => d.accept()); page.on('pageerror', e => { console.log('PAGEERROR', e.message.slice(0, 200)); fails++; });
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addD = (n) => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate() + n); };
const weekdayBack = (n) => { let d = addD(n); while (d.getDay() === 0) d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1); return iso(d); };
const today = iso(new Date());
const D1 = weekdayBack(-7);            // 過ぎた日・休止の期間外・「休止」の記録
const pauseFrom = iso(addD(-4));       // 休止(終了日なし)の開始
const D3 = weekdayBack(-1);            // 休止中・はっきり付けた「欠席」の記録
let D4 = weekdayBack(-2); if (D4 === D3) D4 = weekdayBack(-3); // 休止中・記録なし
const absDay = weekdayBack(-10);       // 休み連絡(欠席)
const jpOf = (isoS) => { const d = new Date(isoS + 'T00:00:00'); return `${d.getMonth() + 1}月${d.getDate()}日`; };
const seed = await page.evaluate(({ D1, pauseFrom, D3, D4, absDay }) => {
  const jp = (isoS) => { const d = new Date(isoS + 'T00:00:00'); return `${d.getMonth() + 1}月${d.getDate()}日`; };
  const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const p = d.patients.find(x => x.status === '利用中' && !x.endDate);
  p.scheduleAmPm = ['AM', 'AM', 'AM', 'AM', 'AM', 'AM', 'AM']; p.scheduleChangeHistory = []; p.startDate = '2025-01-01'; p.endDate = ''; d.holidays = [];
  p.status = '休止'; p.pauseHistory = [{ fromDate: pauseFrom, toDate: '', reason: '入院' }]; p.statusUpdatedAt = Date.now() - 86400000 * 4;
  d.ticketRecords = (d.ticketRecords || []).filter(r => r.patientId !== p.id);
  d.monthlyShifts = {};
  const Y = new Date().getFullYear(); const T0 = Date.now() - 3600000;
  const base = (dIso, extra) => ({ id: `t_${dIso}`, patientId: p.id, name: p.name, kana: p.kana || '', date: jp(dIso), year: Y, dayOfWeek: '月', status: '出席', temp: '', bpUpSt: '', bpDnSt: '', plSt: '', bpUpEn: '', bpDnEn: '', plEn: '', massage: '', exercises: {}, tokki: '', _savedAt: T0, ...extra });
  d.ticketRecords.push(base(D1, { status: '休止', tokki: '' }));
  d.ticketRecords.push(base(D3, { status: '欠席', tokki: '体調不良（発熱）', _fieldTs: { status: T0, tokki: T0 } }));
  d.ticketRecords.push(base(absDay, { status: '欠席', tokki: '通院・受診（整形外科）', _fieldTs: { status: T0, tokki: T0 } }));
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0');
  return { pid: p.id, name: p.name };
}, { D1, pauseFrom, D3, D4, absDay });
const resume = async (view, pid, extra) => { await page.evaluate(({ view, pid, extra }) => { sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view, pid, t: Date.now() })); Object.entries(extra || {}).forEach(([k, v]) => sessionStorage.setItem(k, v)); }, { view, pid, extra }); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {}); };
const rowStatus = (name) => page.evaluate((name) => {
  const els = [...document.querySelectorAll('body *')].filter(e => e.innerText && e.innerText.includes(name) && /出席|欠席|休止|振替|休業/.test(e.innerText));
  if (!els.length) return '';
  els.sort((a, b) => a.innerText.length - b.innerText.length); const t = els[0].innerText.replace(/\s+/g, ' ');
  const m = t.match(/出席|欠席|休止|振替|休業/); return m ? m[0] : '';
}, name);
const setDate = async (isoS) => { const inp = page.locator('input[type="date"]:visible').first(); await inp.fill(isoS); await page.waitForTimeout(1500); };
const recOf = (isoS) => page.evaluate(({ pid, jp }) => (JSON.parse(localStorage.getItem('daycareAppData_v3')).ticketRecords || []).find(r => r.patientId === pid && r.date === jp) || null, { pid: seed.pid, jp: jpOf(isoS) });

// ---- A: 過ぎた日の「休止」の記録 → 提供記録入力は休止・数値は入れられない
await resume('record', seed.pid);
await setDate(D1);
let st = await rowStatus(seed.name); ok(st === '休止', `A 提供記録入力 ${D1}(休止の期間外・過ぎた日)の記録「休止」はそのまま → ${st || '行なし'}`);
// 行を広げて、入れられる欄が特記だけかを見る
const row = page.locator('button.tsu-rv-row', { hasText: seed.name.split(/[\s　]+/)[0] }).first();
if (await row.count()) { await row.click().catch(() => {}); await page.waitForTimeout(600); }
const enabled = await page.evaluate((pid) => { const card = document.querySelector(`[data-rec-card="${pid}"]`); if (!card) return null; return [...card.querySelectorAll('input,select')].filter(e => !e.disabled).map(e => e.placeholder || e.type || e.tagName); }, seed.pid);
ok(Array.isArray(enabled) && enabled.length <= 1 && (enabled.length === 0 || /特記/.test(enabled[0])), `A 休止の行で入れられる欄は特記だけ → ${JSON.stringify(enabled)}`);
// ---- B: 休止中の日: はっきり付けた欠席はそのまま・記録の無い日は休止
await setDate(D3);
st = await rowStatus(seed.name); ok(st === '欠席', `B 休止中の ${D3}: はっきり付けた「欠席」は休止で上書きしない → ${st || '行なし'}`);
// 保存しても欠席のまま(印を付けないので端末内の最新の値が残る)
const saveBtn = page.locator('[data-testid="rec-fold-save"]:visible, [data-testid="rec-fs-save"]:visible').first();
if (await saveBtn.count()) { await saveBtn.click().catch(() => {}); await page.waitForTimeout(1500); } else { await page.locator('button:visible', { hasText: /^保存/ }).first().click({ timeout: 1000 }).catch(() => {}); await page.waitForTimeout(1500); }
let r3 = await recOf(D3); ok(r3 && r3.status === '欠席' && /体調不良/.test(r3.tokki || ''), `B 保存後も ${D3} の記録は欠席のまま(理由も残る) → ${r3 ? `${r3.status} / ${r3.tokki}` : '記録なし'}`);
await setDate(D4);
st = await rowStatus(seed.name); ok(st === '休止', `B 休止中の ${D4}(記録なし)は休止 → ${st || '行なし'}`);
// ---- A/B 月間スケジュール(利用者マスタ → サービス提供内容)
await resume('master', seed.pid); await page.waitForTimeout(1000);
await page.locator('button:visible', { hasText: /^サービス提供内容$/ }).first().click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(800);
const cellOf = async (isoS) => {
  const [y, m, d] = isoS.split('-').map(Number);
  // 表示中の月が違えば前の月へ
  for (let i = 0; i < 2; i++) {
    const lbl = await page.locator('span.tabular-nums', { hasText: /\d+年\d+月/ }).first().textContent().catch(() => '');
    if (lbl && lbl.includes(`${y}年${m}月`)) break;
    await page.locator('span.tabular-nums', { hasText: /\d+年\d+月/ }).first().locator('xpath=preceding-sibling::button[1]').click().catch(() => {}); await page.waitForTimeout(500);
  }
  return (await page.locator(`[data-testid="ms-cell-${d}-AM"]`).first().textContent().catch(() => '')).trim();
};
let c = await cellOf(D1); ok(c === '休止', `A 月間スケジュール ${D1} は「休止」(記録の休止を反映) → ${c || '空'}`);
c = await cellOf(D3); ok(c === '欠席', `B 月間スケジュール ${D3} は「欠席」(休止中でも記録の欠席が優先) → ${c || '空'}`);
c = await cellOf(D4); ok(c === '休止', `B 月間スケジュール ${D4} は「休止」 → ${c || '空'}`);
// ---- C: 休み連絡(trial607)
if (!NOFAX) {
  await resume('absence_fax', seed.pid, { tsumugiOpenFax: JSON.stringify({ type: 'absence', patientId: seed.pid, date: absDay }) });
  await page.waitForTimeout(1200);
  const reasonVal = await page.evaluate(() => { const lab = [...document.querySelectorAll('span')].find(e => e.textContent.trim() === '理由：'); const inp = lab && lab.parentElement && lab.parentElement.querySelector('input'); return inp ? inp.value : null; });
  ok(reasonVal === '通院・受診', `C 休み連絡の理由欄は大分類だけ → ${JSON.stringify(reasonVal)}`);
  const memo = await page.evaluate(() => { const t = [...document.querySelectorAll('textarea')].find(e => /お世話になっております/.test(e.value)); return t ? t.value : ''; });
  ok(/整形外科のためお休みされました。/.test(memo), `C 連絡事項の文は括弧の中の詳しい理由 → ${memo.replace(/\n/g, '／').slice(0, 60)}`);
}
await b.close(); console.log(fails ? `FAIL ${fails}` : 'ALL PASS'); process.exit(fails ? 1 : 0);
