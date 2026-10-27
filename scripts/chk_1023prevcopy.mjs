// 2026-10-23 試験版: 前週コピー(全部上書き)で、前の週で手で決めた到着は「手で決めた」のまま写る(次の保存で計算し直されない)。前の週で目安だったものは目安のまま
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4173'; })();
const b = await chromium.launch(); const r = {}; const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const now = new Date(); const mon = new Date(now); mon.setDate(now.getDate() + (now.getDay() === 0 ? -6 : 1 - now.getDay())); mon.setHours(0, 0, 0, 0); const prevMon = new Date(mon); prevMon.setDate(mon.getDate() - 7);
const keyNow = `${iso(mon)}_AM`, keyPrev = `${iso(prevMon)}_AM`;
const ids = await page.evaluate(([keyPrev, keyNow]) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const ps = (d.patients || []).filter(p => p.status === '利用中').slice(0, 2); ps.forEach(p => { p.scheduleAmPm = ['', 'AM', '', '', '', '', '']; p.pickupTimes = ['', '08:30', '', '', '', '', '']; p.startDate = '2020-01-01'; p.endDate = ''; });
  d.diarySettings = d.diarySettings || {}; d.diarySettings.cars = [{ id: 'car1', name: '1号車', type: '' }, { id: 'car2', name: '2号車', type: '' }];
  d.transportPlans = d.transportPlans || {}; delete d.transportPlans[keyNow];
  d.transportPlans[keyPrev] = { cars: { car1: [{ pid: ps[0].id, t: '8:30', mark: false }], car2: [{ pid: ps[1].id, t: '8:35', mark: false }] }, walkers: [], others: [], un: [], memo: '', arrive: { car1: '8:50', car2: '8:55' }, arriveAuto: { car2: true }, _savedAt: Date.now() - 86400000 };
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, t: Date.now() })); return ps.map(p => p.id); }, [keyPrev, keyNow]);
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
await page.getByTestId('tp-copy-prev').click(); await page.waitForTimeout(500); await page.getByTestId('tp-copy-all').click(); await page.waitForTimeout(1500);
const pl = await page.evaluate((k) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const p = (d.transportPlans || {})[k]; return p ? { arrive: p.arrive, auto: p.arriveAuto, cars: Object.keys(p.cars || {}).map(c => (p.cars[c] || []).length) } : null; }, keyNow);
console.log('copied', JSON.stringify(pl));
r.copied = !!pl && pl.cars.join(',') === '1,1'; r.handKept = !!pl && pl.arrive && pl.arrive.car1 === '8:50' && !(pl.auto || {}).car1; r.autoKept = !!pl && pl.arrive && pl.arrive.car2 === '8:55' && !!(pl.auto || {}).car2;
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
