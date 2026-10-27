// 2026-10-23 試験版 trial388: 送迎表 ①作成中で時間が「何分」まで無い方は黄色い枠 ②「送り（帰り）の車」は折りたたみ(既定は閉じ・押すと開く) ③確定後の文字は15px
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4173'; })();
const b = await chromium.launch(); const r = {}; const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const now = new Date(); const mon = new Date(now); mon.setDate(now.getDate() + (now.getDay() === 0 ? -6 : 1 - now.getDay())); mon.setHours(0, 0, 0, 0); const key = `${iso(mon)}_AM`;
const ids = await page.evaluate((key) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const ps = (d.patients || []).filter(p => p.status === '利用中').slice(0, 3); ps.forEach(p => { p.scheduleAmPm = ['', 'AM', '', '', '', '', '']; p.pickupTimes = ['', '08:30', '', '', '', '', '']; p.startDate = '2020-01-01'; p.endDate = ''; });
  d.diarySettings = d.diarySettings || {}; d.diarySettings.cars = [{ id: 'car1', name: '1号車', type: '' }, { id: 'car2', name: '2号車', type: '' }];
  d.transportPlans = d.transportPlans || {};
  d.transportPlans[key] = { cars: { car1: [{ pid: ps[0].id, t: '8:30', mark: false }, { pid: ps[1].id, t: '8:', mark: false }], car2: [{ pid: ps[2].id, t: '8:40', mark: false }] }, walkers: [], others: [], un: [], memo: '', dropMode: 'custom', drop: { cars: { car1: [{ pid: ps[0].id }], car2: [] }, walkers: [], others: [] }, arrive: { car1: '8:50' }, _savedAt: Date.now() };
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, t: Date.now() })); return ps.map(p => p.id); }, key);
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
const ok = await page.getByTestId(`tp-time-${ids[0]}`).first().getAttribute('data-notime'); const no = await page.getByTestId(`tp-time-${ids[1]}`).first().getAttribute('data-notime');
const noCls = await page.getByTestId(`tp-time-${ids[1]}`).first().getAttribute('class'); console.log('notime', ok, no, /border-amber-400/.test(noCls || ''));
r.yellowForNoMinutes = ok === '0' && no === '1' && /border-amber-400/.test(noCls || '');
const tg = page.getByTestId(`tp-dropbox-toggle-${iso(mon)}-AM`); r.toggleShown = await tg.count() === 1;
const closed = await page.locator(`[data-tpdrop="d:car1"]`).count(); await tg.click(); await page.waitForTimeout(400); const opened = await page.locator(`[data-tpdrop="d:car1"]`).count(); console.log('dropbox', closed, '→', opened);
r.collapsible = closed === 0 && opened === 1; const _ht = await tg.innerText(); r.headerCounts = !/1号車/.test(_ht) && /未定2名/.test(_ht) && /送りの車/.test(_ht) && !/席が決まっていない/.test(_ht); r.oneLine = (await tg.evaluate(e => e.getBoundingClientRect().height)) < 30;
await page.screenshot({ path: '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad/tp388.jpg', type: 'jpeg', quality: 55 });
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
