// 2026-10-21 月間スケジュールの状態の小窓(試験版): 予定のない日(基本の利用日でない空のセル)は「取り消し」を出さず「現在: 予定なし」
//   基本の利用日(出席)も「取り消し」なし。欠席にしたセルは「取り消し」あり。予定のない日でも記録が残っている日は「取り消し」あり(残骸の片付け)
import { chromium } from 'playwright';
const b = await chromium.launch(); const r = {};
const page = await (await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 160)));
await page.goto('http://localhost:4185/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
// 今月で、基本が午前だけの曜日がある方を選び、その曜日の日を3つ使う(午後の空セル・午前の出席セル・午前を欠席にしたセル)+ 予定のない別の日に記録の残骸
const info = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const now = new Date(); const y = now.getFullYear(), m = now.getMonth(); const mk = `${y}-${String(m + 1).padStart(2, '0')}`; const last = new Date(y, m + 1, 0).getDate();
  const closed = (d.systemSettings?.facilityInfo?.closedDays) || [0];
  for (const p of (d.patients || []).filter(x => x.status === '利用中')) { const sch = p.scheduleAmPm || []; const days = []; const off = [];
    for (let dd = 1; dd <= last; dd++) { const dw = new Date(y, m, dd).getDay(); if (closed.includes(dw)) continue; if (Object.keys(((d.monthlyShifts || {})[mk] || {})[p.id] || {}).some(k => k.startsWith(dd + '_'))) continue; if ((d.ticketRecords || []).some(t => t.patientId === p.id && t.date === `${m + 1}月${dd}日`)) continue; if (sch[dw] === 'AM') days.push(dd); else if (!sch[dw]) off.push(dd); }
    if (days.length >= 2 && off.length >= 1) { d.monthlyShifts = d.monthlyShifts || {}; d.monthlyShifts[mk] = d.monthlyShifts[mk] || {}; d.monthlyShifts[mk][p.id] = { ...(d.monthlyShifts[mk][p.id] || {}), [`${days[1]}_AM`]: '欠席' };
      d.ticketRecords = [...(d.ticketRecords || []), { id: `tr_${p.id}_${y}_${m + 1}_${off[0]}`, patientId: p.id, name: p.name, kana: p.kana || '', date: `${m + 1}月${off[0]}日`, year: y, status: '出席', tokki: '', _savedAt: Date.now() }];
      localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); return { pid: p.id, name: p.name, d0: days[0], d1: days[1], off: off[0], off2: off[1] || null }; } }
  return null; });
r.seed = !!info; console.log('info', info && { d0: info.d0, d1: info.d1, off: info.off, off2: info.off2 });
const openPopup = async (dn, ap) => { await page.getByTestId(`ms-cell-${dn}-${ap}`).scrollIntoViewIfNeeded(); await page.getByTestId(`ms-cell-${dn}-${ap}`).click(); await page.waitForTimeout(400); const has = await page.locator('button:visible', { hasText: /^取り消し$/ }).count(); const cur = await page.getByTestId('ms-status-current').innerText().catch(() => ''); await page.locator('button:visible', { hasText: /^キャンセル$/ }).last().click().catch(() => {}); await page.waitForTimeout(300); return { has, cur }; };
if (info) {
  await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'master', pid: null, t: Date.now() }))); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1600);
  await page.locator('button:visible').filter({ hasText: new RegExp('^' + info.name) }).first().click(); await page.waitForTimeout(1200); await page.locator('button:visible', { hasText: /^サービス提供内容$/ }).first().click(); await page.waitForTimeout(800);
  const a = await openPopup(info.d0, 'PM'); console.log('empty PM', JSON.stringify(a)); r.emptyNoCancel = a.has === 0 && a.cur === '予定なし';
  const c = await openPopup(info.d0, 'AM'); console.log('base AM', JSON.stringify(c)); r.baseNoCancel = c.has === 0 && c.cur === '出席';
  const e = await openPopup(info.d1, 'AM'); console.log('absent AM', JSON.stringify(e)); r.absentHasCancel = e.has === 1 && e.cur === '欠席';
  const g = await openPopup(info.off, 'AM'); console.log('off with record', JSON.stringify(g)); r.remnantHasCancel = g.has === 1;
  if (info.off2) { const h = await openPopup(info.off2, 'AM'); console.log('off empty', JSON.stringify(h)); r.offEmptyNoCancel = h.has === 0 && h.cur === '予定なし'; }
}
console.log(r, Object.values(r).every(v => v === true) ? 'PASS' : 'FAIL'); await b.close();
