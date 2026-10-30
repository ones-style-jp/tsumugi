// 2026-10-30 ユーザー要望「連絡帳の次回予定で『未定』を解除したら、次回の日付と時間がまた出るように(前は空欄のまま)」
//   ①次回予定の小窓で「未定」→ 日付と時間が空欄(押せない) → もう一度押す → 自動計算の日付(次の基本利用日)と時間(送迎時間)が戻る
//   ②被保険者番号を10桁に(ユーザー指示・全店): 「12345」→「0000012345」・「H12」→「H000000012」・10桁はそのまま。開き直すと自動で直り、同期の時刻(_fieldTs.insuranceNo)が付く
//   実行: node scripts/chk_1030undec.mjs [--port 4175]
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4175'; })();
const r = {};
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
const go = async (view, extra) => { await page.evaluate(([v, x]) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: null, t: Date.now(), ...(x || {}) })), [view, extra]); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2200); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 400 }).catch(() => {}); };
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const S = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const t = new Date(); const dow = t.getDay();
  d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [] }; d.holidays = []; d.ticketRecords = (d.ticketRecords || []).filter(x => !(x && x.year === t.getFullYear())); d.transportPlans = {}; d.systemSettings.transportOn = false;
  const act = d.patients.filter(p => p.status === '利用中' && !p.endDate); act.forEach(p => { p.scheduleAmPm = ['', '', '', '', '', '', '']; });
  const P = act[0]; P.scheduleAmPm[dow] = 'AM'; P.pickupType = 'fixed'; P.pickupTimes = ['', '', '', '', '', '', '']; P.pickupTimes[dow] = '8:30'; P.pauseHistory = []; P.scheduleChangeHistory = []; P.startDate = '2025-01-01'; P.insuranceNo = '12345';
  act[1].insuranceNo = 'H12'; act[2].insuranceNo = '0000098765';
  d.ticketRecords.push({ id: `tk_chk_u_${Date.now()}`, patientId: P.id, date: `${t.getMonth() + 1}月${t.getDate()}日`, year: t.getFullYear(), status: '出席', tokki: '', recorder: '', _savedAt: Date.now() - 3600000 });
  const n7 = new Date(t); n7.setDate(n7.getDate() + 7);
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); return { id: P.id, ids: [act[0].id, act[1].id, act[2].id], m7: n7.getMonth() + 1, d7: n7.getDate() }; });
await go('print', { ampm: 'AM' });
// ② 被保険者番号(開いた時点で直る)
{ const d = await page.evaluate(() => JSON.parse(localStorage.getItem('daycareAppData_v3'))); const v = S.ids.map(id => { const p = d.patients.find(x => x.id === id); return [p.insuranceNo, !!(p._fieldTs && p._fieldTs.insuranceNo)]; });
  console.log('② 被保険者番号', JSON.stringify(v)); r.ins = v[0][0] === '0000012345' && v[0][1] && v[1][0] === 'H000000012' && v[1][1] && v[2][0] === '0000098765' && !v[2][1]; }
// ① 未定 → 解除
await page.getByTestId('cb-input-hub').click(); await page.waitForTimeout(300); await page.getByTestId('cb-hub-next').click(); await page.waitForTimeout(600);
const read = async () => ({ m: await page.getByTestId(`cb-next-month-${S.id}`).inputValue(), d: await page.getByTestId(`cb-next-day-${S.id}`).inputValue(), t: await page.locator(`[data-testid="cb-next-time-${S.id}"] input`).evaluateAll(es => es.map(e => [e.value, e.disabled])) });
const v0 = await read(); await page.getByTestId(`cb-next-undec-${S.id}`).click(); await page.waitForTimeout(300); const v1 = await read(); await page.getByTestId(`cb-next-undec-${S.id}`).click(); await page.waitForTimeout(300); const v2 = await read();
console.log('① 初め', JSON.stringify(v0), '未定', JSON.stringify(v1), '解除', JSON.stringify(v2), '期待', S.m7, '/', S.d7, '8:30');
r.initial = Number(v0.m) === S.m7 && Number(v0.d) === S.d7 && v0.t[0][0] === '8' && v0.t[1][0] === '30';
r.undec = v1.m === '' && v1.d === '' && v1.t.every(x => x[0] === '' && x[1]);
r.restore = Number(v2.m) === S.m7 && Number(v2.d) === S.d7 && v2.t[0][0] === '8' && v2.t[1][0] === '30' && v2.t.every(x => !x[1]);
await b.close();
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
