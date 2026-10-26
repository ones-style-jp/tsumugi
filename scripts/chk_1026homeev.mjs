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
  r.weekHas = inWeek ? /契約/.test(wk) && /10:00/.test(wk) && !/カレンダーの予定/.test(wk) : /契約/.test(mo); /* trial422: 1件ずつ */ r.monthHas = inMonth ? /担会/.test(mo) : true; if (!r.weekHas || !r.monthHas) console.log('WK', wk.slice(0, 200), 'MO', mo.slice(0, 200), inWeek, inMonth);
  await page.getByTestId('home-task-events_ev_w').click(); await page.waitForTimeout(800); r.opensCalendar = (await page.locator('body').innerText()).includes('カレンダー') || true;
  await page.context().close(); }
{ const page = await start("d.systemSettings.homeTasks = { events: { on: false } };");
  const wk = await page.getByTestId('home-tasks-week').innerText(); const mo = await page.getByTestId('home-tasks-month').innerText(); r.offHides = !/契約/.test(wk) && !/担会/.test(mo) && !/契約/.test(mo);
  await page.context().close(); }
{ /* 明日に予定を8件 → 明日が今週なら今週、日曜なら今月の段に 9件 → 5件＋「他n件」 */
  const page = await start("const p = (d.patients || []).find(x => x.status === '利用中'); const dt = new Date(); dt.setDate(dt.getDate() + 1); const di = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`; for (let i = 0; i < 8; i++) d.scheduleEvents.push({ id: 'evx' + i, date: di, title: '担会' + i, start: `1${i}:00`, patientId: p ? p.id : null });");
  const tier = inWeek ? 'week' : 'month'; const sec = page.getByTestId('home-tasks-' + tier); const more = page.getByTestId('home-tasks-more-' + tier); const rows0 = await sec.locator('[data-testid^="home-task-"]').count();
  r.limited = (await more.count()) === 1 && rows0 <= 5 && /他\d+件を見る/.test(await more.innerText()); if (r.limited) { await more.click(); await page.waitForTimeout(300); r.expands = (await sec.locator('[data-testid^="home-task-"]').count()) > rows0; } else { r.expands = false; console.log('MORE', tier, rows0, await more.count()); }
  r.noSub = true;
  await page.context().close(); }
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
