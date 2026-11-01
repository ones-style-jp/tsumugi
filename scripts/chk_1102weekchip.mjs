// 2026-11-02 trial498 カレンダーの週表示: 申し送りの札(月表示と同じ)・タスクの見分け(白地・緑枠・✓/□・済みは打ち消し)
//   ①週表示の日付の見出しに「申し送り n」(今日=2件) ②押すとその日が選ばれ、下に「その日の申し送り」2行 ③終日のタスクは白地に「□ 」・済みのタスクは「✓ 」で打ち消し
//   ④時間つきのタスクも白地に「□ 」 ⑤ふつうの予定は色の塗り(白地でない) ⑥月表示の札は今までどおり
//   実行: node scripts/chk_1102weekchip.mjs [--port 4175]
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4175'; })();
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept());
page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 160)));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const S = await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const t = new Date(); const iso = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  const now = Date.now(); const p = d.patients.find(x => x.status === '利用中');
  d.scheduleEvents = (d.scheduleEvents || []).filter(e => e.kind !== 'memo' && e.kind !== 'task' && e.date !== iso);
  d.scheduleEvents.push(
    { id: 'wk_memo1', kind: 'memo', date: iso, title: '見本の申し送り 運動は軽めに', patientId: p ? p.id : '', author: '見本 職員', _savedAt: now },
    { id: 'wk_memo2', kind: 'memo', date: iso, title: '見本の全体連絡 午後に打ち合わせ', patientId: '', author: '見本 職員', _savedAt: now },
    { id: 'wk_task1', kind: 'task', date: iso, start: '', end: '', title: '見本のタスク 請求の確認', note: '', color: '#047857', notify: false, _savedAt: now },
    { id: 'wk_task2', kind: 'task', date: iso, start: '', end: '', title: '見本の済みタスク', note: '', color: '#047857', notify: false, done: { [iso]: { by: '見本 職員', at: now } }, _savedAt: now },
    { id: 'wk_task3', kind: 'task', date: iso, start: '14:00', end: '', title: '見本の時間つきタスク', note: '', color: '#047857', notify: false, _savedAt: now },
    { id: 'wk_ev1', date: iso, start: '10:00', end: '11:00', title: '見本の予定', note: '', color: '#3b82f6', _savedAt: now });
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0');
  sessionStorage.setItem('tsumugiActiveRecorder', JSON.stringify({ id: 'demo_rec', name: '見本 職員', roleLabel: '介護職員' }));
  sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'schedule', pid: null, t: Date.now() }));
  return { iso }; });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(900);
const r = {};
r.monthChip = (await page.getByTestId(`sch-memo-chip-${S.iso}`).innerText().catch(() => '')) === '申し送り 2';
await page.locator('button', { hasText: /^週$/ }).first().click(); await page.waitForTimeout(600);
const chip = page.getByTestId(`sch-week-memo-chip-${S.iso}`);
r.weekChip = (await chip.innerText().catch(() => '')) === '申し送り 2';
await chip.click(); await page.waitForTimeout(500);
r.dayMemos = (await page.locator('[data-testid="sch-day-memos"] [data-testid^="memo-row-"]').count()) === 2;
const info = async (title) => page.evaluate((t) => { const all = [...document.querySelectorAll('div,span')].filter(el => (el.textContent || '').includes(t)); if (!all.length) return null; let el = all.sort((a, b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length)[0]; while (el && !(el.style && el.style.backgroundColor)) el = el.parentElement; if (!el) return null; const cs = getComputedStyle(el); return { text: el.textContent.trim().slice(0, 30), bg: cs.backgroundColor, deco: cs.textDecorationLine, task: el.getAttribute('data-task') }; }, title);
const t1 = await info('見本のタスク 請求の確認'), t2 = await info('見本の済みタスク'), t3 = await info('見本の時間つきタスク'), e1 = await info('見本の予定');
r.taskAllDay = !!(t1 && t1.task === '1' && t1.text.startsWith('□') && t1.bg === 'rgb(255, 255, 255)');
r.taskDone = !!(t2 && t2.task === '1' && t2.text.startsWith('✓') && /line-through/.test(t2.deco));
r.taskTimed = !!(t3 && t3.task === '1' && t3.text.startsWith('□') && t3.bg === 'rgb(255, 255, 255)');
r.plainEvent = !!(e1 && e1.task !== '1' && e1.bg !== 'rgb(255, 255, 255)');
console.log('月の札', r.monthChip, '週の札', r.weekChip, '押すとその日の申し送り', r.dayMemos, '| タスク', t1, '| 済み', t2, '| 時間つき', t3, '| 予定', e1);
await b.close();
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
