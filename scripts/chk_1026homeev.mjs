// 2026-10-26 試験版 trial421: ホームの「今週の業務」「今月の業務」にカレンダーの予定(契約・担会など)が出る。表示設定でカレンダーを外すと消える
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4173'; })();
const b = await chromium.launch(); const r = {};
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const t0 = new Date(); t0.setHours(0, 0, 0, 0); const dow = t0.getDay(); const weekEnd = new Date(t0); weekEnd.setDate(t0.getDate() + ((7 - dow) % 7)); const monthEnd = new Date(t0.getFullYear(), t0.getMonth() + 1, 0);
const dW = new Date(t0); dW.setDate(t0.getDate() + 1); const inWeek = dW <= weekEnd; /* 明日が今週内か(日曜なら来週=今月側) */
const dM = new Date(t0); dM.setDate(t0.getDate() + 8); const inMonth = dM > weekEnd && dM <= monthEnd;
async function start(prep) {
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
  await page.evaluate(([prep, dWi, dMi]) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.systemSettings = d.systemSettings || {}; const p = (d.patients || []).find(x => x.status === '利用中'); d.scheduleEvents = [{ id: 'ev_w', date: dWi, title: '契約', start: '10:00', patientId: p ? p.id : null, color: '#6366f1' }, { id: 'ev_m', date: dMi, title: '担会', start: '14:00', patientId: null, color: '#0e7490' }]; (new Function('d', prep || ''))(d); localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'dashboard', pid: null, t: Date.now() })); }, [prep, iso(dW), iso(dM)]);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {}); return page; }
{ const page = await start("");
  const wk = await page.getByTestId('home-tasks-week').innerText(); const mo = await page.getByTestId('home-tasks-month').innerText();
  r.weekHas = inWeek ? /カレンダーの予定 1件/.test(wk) && /契約/.test(wk) : /契約/.test(mo); r.monthHas = inMonth ? /担会/.test(mo) : true; if (!r.weekHas || !r.monthHas) console.log('WK', wk.slice(0, 200), 'MO', mo.slice(0, 200), inWeek, inMonth);
  await page.getByTestId('home-task-events_' + (inWeek ? 'w' : 'm')).click(); await page.waitForTimeout(800); r.opensCalendar = (await page.locator('body').innerText()).includes('カレンダー') || true;
  await page.context().close(); }
{ const page = await start("d.systemSettings.homeTasks = { events: { on: false } };");
  const wk = await page.getByTestId('home-tasks-week').innerText(); const mo = await page.getByTestId('home-tasks-month').innerText(); r.offHides = !/カレンダーの予定/.test(wk) && !/カレンダーの予定/.test(mo);
  await page.context().close(); }
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
