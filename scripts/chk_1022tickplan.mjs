// 2026-10-22 試験版: サービス提供記録(月の表)に、今日より後の来る日を「予定」として日付だけ出す
//   来月の表: 基本利用日(月・水)が「予定」で並ぶ ／ 最初の月曜を欠席 → 「欠席」と出る(2026-10-22 ユーザー指示) ／ 最初の木曜に振替 → 日付の順に「予定」で入る
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4173'; })();
const r = {}; const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 160)));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const now = new Date(); const nx = new Date(now.getFullYear(), now.getMonth() + 1, 1); const y = nx.getFullYear(), m = nx.getMonth() + 1; const ym = `${y}-${String(m).padStart(2, '0')}`;
const dim = new Date(y, m, 0).getDate(); const dow = (d) => new Date(y, m - 1, d).getDay();
const mons = [], weds = [], thus = []; for (let d = 1; d <= dim; d++) { if (dow(d) === 1) mons.push(d); if (dow(d) === 3) weds.push(d); if (dow(d) === 4) thus.push(d); }
const absDay = mons[0], furiDay = thus[0];
const pid = await page.evaluate(({ ym, absDay, furiDay }) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const ps = (d.patients || []).filter(p => p.status === '利用中'); const p = ps[0];
  p.scheduleAmPm = ['', 'PM', '', 'PM', '', '', '']; p.scheduleChangeHistory = []; p.startDate = '2020-01-01'; p.endDate = ''; p.pauseHistory = [];
  d.monthlyShifts = d.monthlyShifts || {}; d.monthlyShifts[ym] = d.monthlyShifts[ym] || {}; d.monthlyShifts[ym][p.id] = { [`${absDay}_PM`]: '欠席', [`${furiDay}_PM`]: `振${absDay}` };
  d.holidays = (d.holidays || []).filter(h => !String(h.date || h).startsWith(ym));
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); return p.id; }, { ym, absDay, furiDay });
await page.evaluate(([pid, ym]) => { sessionStorage.setItem('tsumugiOpenTicket', JSON.stringify({ patientId: pid, month: ym })); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'ticket', pid, t: Date.now() })); }, [pid, ym]);
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
const blocks = await page.evaluate(() => { const rows = [...document.querySelectorAll('#print-content-ticket tr')]; const out = [];
  rows.forEach((tr, i) => { const dc = [...tr.cells].find(c => c.rowSpan > 1); if (!dc) return; const mm = /^\s*(\d+)\s*（(.)）/.exec(dc.innerText); if (!mm) return; out.push({ day: +mm[1], text: rows.slice(i, i + 2).map(t => t.innerText.replace(/\s+/g, ' ')).join(' / ') }); }); return out; });
const days = blocks.map(x => x.day); console.log('days', JSON.stringify(days), 'abs', absDay, 'furi', furiDay);
const expect = [...mons, ...weds, furiDay].sort((a, b) => a - b);
r.daysMatch = JSON.stringify(days) === JSON.stringify(expect);
r.allPlanned = blocks.length > 0 && blocks.filter(x => x.day !== absDay).every(x => /予定/.test(x.text));
const ab = blocks.find(x => x.day === absDay); r.absShownAsAbsent = !!ab && /欠席/.test(ab.text) && !/予定/.test(ab.text); r.furiShown = days.includes(furiDay);
r.sorted = days.every((d, i) => i === 0 || days[i - 1] < d);
// 今月(今日まで)の表は今までどおり(過去の日に「予定」は出ない)
await page.evaluate(([pid, ym]) => { sessionStorage.setItem('tsumugiOpenTicket', JSON.stringify({ patientId: pid, month: ym })); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'ticket', pid, t: Date.now() })); }, [pid, `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`]);
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
const cur = await page.evaluate(() => { const rows = [...document.querySelectorAll('#print-content-ticket tr')]; const out = []; rows.forEach((tr, i) => { const dc = [...tr.cells].find(c => c.rowSpan > 1); if (!dc) return; const mm = /^\s*(\d+)\s*（/.exec(dc.innerText); if (!mm) return; const tx = rows.slice(i, i + 2).map(t => t.innerText).join(' '); out.push({ day: +mm[1], planned: /予定/.test(tx), absent: /欠席|休業/.test(tx) }); }); return out; });
const td = now.getDate(); r.pastNotPlanned = cur.filter(x => x.day <= td).every(x => !x.planned); r.futureThisMonthPlanned = cur.filter(x => x.day > td).every(x => x.planned || x.absent);
console.log('cur', JSON.stringify(cur));
await page.screenshot({ path: '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad/tickplan.jpg', type: 'jpeg', quality: 55 });
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
