// 2026-10-23 試験版 trial390: ①稼働ランキングが縦(1,2,3…が下へ) ②画面を開いた回数(ホームのタイル/横のメニュー) ③「気分」→「体調」の言い換え(画面に「気分」が残らない)
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4173'; })();
const b = await chromium.launch(); const r = {};
async function open(view, prep) {
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, locale: 'ja-JP' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  await page.evaluate(([view, prep]) => { localStorage.setItem('tsumugiSidebarOpen', '1'); const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.systemSettings = d.systemSettings || {}; (new Function('d', 'localStorage', prep || ''))(d, localStorage); localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); if (view) sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view, pid: null, t: Date.now() })); }, [view, prep]);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2200); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 600 }).catch(() => {}); return { page }; }
// ① ランキング: 1位の真下に2位(同じ列・下の行)。データは今月の出席を何人かに作る
{ const { page } = await open('dash_operation', `const dn = ['日','月','火','水','木','金','土']; const now = new Date(); const ps = (d.patients || []).filter(p => p.status === '利用中').slice(0, 8); d.ticketRecords = d.ticketRecords || [];
    ps.forEach((p, pi) => { for (let k = 1; k <= 6; k++) { const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate() - k); d.ticketRecords.push({ id: 'tst_rk_' + pi + '_' + k, patientId: p.id, name: p.name, date: (dt.getMonth() + 1) + '月' + dt.getDate() + '日', year: dt.getFullYear(), dayOfWeek: dn[dt.getDay()], status: (k <= pi) ? '欠席' : '出席', tokki: (k <= pi) ? ['体調不良', '通院', '家族の都合'][k % 3] : '', _savedAt: dt.getTime() }); } });`);
  for (const [key, tid] of [['att', 'ops-rank-grid'], ['reason', 'ops-reason-grid']]) {
    const m = await page.evaluate((tid) => { const g = document.querySelector(`[data-testid="${tid}"]`); if (!g) return null; const ch = [...g.children].map(e => { const b = e.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), t: (e.textContent || '').slice(0, 4) }; }); return { n: ch.length, ch: ch.slice(0, 3), flow: getComputedStyle(g).gridAutoFlow + '/' + getComputedStyle(g).flexDirection }; }, tid);
    if (key === 'reason') r.reasonPie = await page.locator('[data-testid="ops-reason-pie"] path').count() >= 2; /* trial391: 円グラフ */
    console.log(key, JSON.stringify(m)); r[`vert_${key}`] = !!m && m.n >= 2 && m.ch[1].x === m.ch[0].x && m.ch[1].y > m.ch[0].y && /column/.test(m.flow) && /^1\./.test(m.ch[0].t) && /^2\./.test(m.ch[1].t); }
  await page.screenshot({ path: '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad/rank_vert.jpg', type: 'jpeg', quality: 55, fullPage: false });
  r.noKibunOps = !(await page.evaluate(() => document.body.innerText.includes('気分'))) && (await page.evaluate(() => document.body.innerText.includes('体調割合')));
  await page.context().close(); }
// ② 画面を開いた回数: ホームのタイル → home:record、横のメニュー → side:print
{ const { page } = await open('dashboard', `localStorage.removeItem('tsumugiUseCount');`);
  await page.getByTestId('dash-tile-record').click(); await page.waitForTimeout(800);
  await page.locator('button:not([data-testid^="dash-tile"])', { hasText: /^連絡帳$/ }).first().click().catch(e => console.log('side click fail', e.message.slice(0, 80))); await page.waitForTimeout(800);
  const u = await page.evaluate(() => JSON.parse(localStorage.getItem('tsumugiUseCount') || '{}')); console.log('use', JSON.stringify(u));
  const ym = new Date().toISOString().slice(0, 7); const m = u[ym] || {}; r.useHome = m['home:record'] === 1; r.useSide = m['side:print'] === 1;
  await page.context().close(); }
// ③ 提供記録の列の見出しが「体調」・画面に「気分」が残らない(提供記録・分析(個人))
for (const view of ['record', 'dash_personal']) { const { page } = await open(view, `delete d.systemSettings.kibunDisabled;`);
  const has = await page.evaluate(() => document.body.innerText.includes('気分')); const th = view === 'record' ? await page.locator('#record-table thead th', { hasText: /^体調/ }).count() : 1;
  console.log('kibun', view, has, th); r[`noKibun_${view}`] = !has && th >= 1; await page.context().close(); }
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
