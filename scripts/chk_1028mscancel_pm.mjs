// 2026-10-28 月間スケジュールの状態の小窓(ユーザー「午後に利用する人の午前を押すと取り消しが出る。基本利用日は午後で午前は関係ないので出さない方がいい」)
//   見本の1人を 月・水・金の午後だけの利用にする
//   ①午後に来た日(記録=出席)の午前のマス → 「取り消し」なし・「現在: 予定なし」
//   ②午後を欠席にした日(シフト=欠席・記録=欠席)の午前のマス → 「取り消し」なし
//   ③予定のない曜日(火・木)に残った記録 → 午前のマスに「取り消し」あり(残骸の片付けは今までどおり)
//   ④午後のマス(基本の利用日・出席) → 「取り消し」なし
//   実行: node scripts/chk_1028mscancel_pm.mjs [--port 4175]
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4173'; })();
const b = await chromium.launch(); const r = {};
const page = await (await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 160)));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const info = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const now = new Date(); const y = now.getFullYear(), m = now.getMonth(); const mk = `${y}-${String(m + 1).padStart(2, '0')}`; const last = new Date(y, m + 1, 0).getDate();
  d.systemSettings = d.systemSettings || {}; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [0] }; d.holidays = [];
  const p = (d.patients || []).find(x => x.status === '利用中' && !x.endDate && (x.name || '').trim()); if (!p) return null;
  p.scheduleAmPm = ['', 'PM', '', 'PM', '', 'PM', '']; p.scheduleChangeHistory = []; p.pauseHistory = []; if (p.startDate && p.startDate > `${mk}-01`) p.startDate = `${mk}-01`;
  const base = [], off = []; for (let dd = 1; dd <= last; dd++) { const dw = new Date(y, m, dd).getDay(); if (dw === 0) continue; if ([1, 3, 5].includes(dw)) base.push(dd); else off.push(dd); }
  if (base.length < 2 || !off.length) return null; const d1 = base[0], d2 = base[1], d3 = off[0];
  d.monthlyShifts = d.monthlyShifts || {}; d.monthlyShifts[mk] = d.monthlyShifts[mk] || {}; d.monthlyShifts[mk][p.id] = { [`${d2}_PM`]: '欠席' };
  const rec = (dd, st) => ({ id: `tr_${p.id}_${y}_${m + 1}_${dd}`, patientId: p.id, name: p.name, kana: p.kana || '', date: `${m + 1}月${dd}日`, year: y, status: st, tokki: '', _savedAt: Date.now() });
  d.ticketRecords = (d.ticketRecords || []).filter(t => t.patientId !== p.id); d.ticketRecords.push(rec(d1, '出席'), rec(d2, '欠席'), rec(d3, '出席'));
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); return { name: p.name, d1, d2, d3 }; });
r.seed = !!info; if (!info) { console.log('NO SEED'); process.exit(1); }
const openPopup = async (dn, ap) => { const c = page.getByTestId(`ms-cell-${dn}-${ap}`); await c.scrollIntoViewIfNeeded(); await c.click(); await page.waitForTimeout(400);
  const has = await page.locator('button:visible', { hasText: /^取り消し$/ }).count(); const cur = await page.getByTestId('ms-status-current').innerText().catch(() => '');
  await page.locator('button:visible', { hasText: /^キャンセル$/ }).last().click(); await page.waitForTimeout(300); return { has, cur }; };
await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'master', pid: null, t: Date.now() }))); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800);
await page.locator('button:visible').filter({ hasText: new RegExp('^' + info.name) }).first().click(); await page.waitForTimeout(1200);
await page.locator('button:visible', { hasText: /^サービス提供内容$/ }).first().click(); await page.waitForTimeout(800);
const a = await openPopup(info.d1, 'AM'); console.log('① 午後に来た日の午前', JSON.stringify(a)); r.pmDayAmNoCancel = a.has === 0 && a.cur === '予定なし';
const c = await openPopup(info.d2, 'AM'); console.log('② 午後を欠席の日の午前', JSON.stringify(c)); r.pmAbsentAmNoCancel = c.has === 0;
const e = await openPopup(info.d3, 'AM'); console.log('③ 予定のない日の残り', JSON.stringify(e)); r.remnantHasCancel = e.has === 1;
const g = await openPopup(info.d1, 'PM'); console.log('④ 午後のマス(基本)', JSON.stringify(g)); r.basePmNoCancel = g.has === 0 && g.cur === '出席';
await b.close();
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); process.exit(Object.values(r).every(Boolean) ? 0 : 1);
