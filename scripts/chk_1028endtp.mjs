// 2026-10-28 ユーザー報告「10/27が最後の利用日で、利用終了日を27日にした。月間スケジュール・提供記録は出席なのに、送迎表だけ休み扱い」
//   見本の1人を毎日午前の利用にし、利用終了日を「昨日(日曜なら土曜)」にする。その日の送迎表(保存済み・運行表を出した後)に乗せ、提供記録は出席
//   ①その日を開いても「休み・休止になった方が送迎表に残っています」に出ない ②その日の午前の車に乗ったまま(休みに出ない・取り消し線なし)
//   ③利用終了日より後(今日)は送迎表に出ない(車にも未割当にも休みにも)
//   実行: node scripts/chk_1028endtp.mjs [--port 4175]
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4175'; })();
const b = await chromium.launch(); const r = {};
const ctx = await b.newContext({ viewport: { width: 393, height: 820 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
const page = await ctx.newPage(); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => d.accept());
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const iso = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
const now = new Date(); const T = iso(now); const dD = new Date(now); dD.setDate(dD.getDate() - 1); if (dD.getDay() === 0) dD.setDate(dD.getDate() - 1); const D = iso(dD);
const info = await page.evaluate(([D, T]) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3'));
  d.systemSettings = d.systemSettings || {}; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [0] }; d.holidays = [];
  d.diarySettings = d.diarySettings || {}; d.diarySettings.cars = [{ id: 'c1', name: '1号車', type: '', cap: '8' }];
  const p = (d.patients || []).find(x => x.status === '利用中' && !x.endDate && (x.name || '').trim()); if (!p) return null;
  p.scheduleAmPm = ['', 'AM', 'AM', 'AM', 'AM', 'AM', 'AM']; p.scheduleChangeHistory = []; p.pauseHistory = []; p.startDate = '2026-01-05'; p.endDate = D;
  const ym = (s) => s.slice(0, 7); d.monthlyShifts = d.monthlyShifts || {}; [D, T].forEach(s => { d.monthlyShifts[ym(s)] = d.monthlyShifts[ym(s)] || {}; d.monthlyShifts[ym(s)][p.id] = {}; });
  const md = (s) => `${+s.slice(5, 7)}月${+s.slice(8, 10)}日`;
  d.ticketRecords = (d.ticketRecords || []).filter(t => t.patientId !== p.id); d.ticketRecords.push({ id: `tr_${p.id}_end`, patientId: p.id, name: p.name, kana: p.kana || '', date: md(D), year: +D.slice(0, 4), status: '出席', tokki: '', _savedAt: Date.now() });
  const car = { c1: [{ pid: p.id, t: '9:00' }] };
  d.transportPlans = { ...(d.transportPlans || {}), [`${D}_AM`]: { cars: car, walkers: [], others: [], un: [], memo: '', _base: { cars: car, walkers: [], others: [] }, _baseAt: Date.now() - 3 * 86400000, _baseId: 'b1', _savedAt: Date.now() } };
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); return { pid: p.id, name: p.name }; }, [D, T]);
r.seed = !!info; if (!info) { console.log('NO SEED'); process.exit(1); }
console.log('end date', D, 'today', T);
await page.evaluate((D) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, date: D, t: Date.now() })), D);
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
const stale = page.getByTestId('tp-stale-modal'); const staleTxt = (await stale.count()) ? await stale.innerText() : ''; // 先に読む(ほかの「あとで」で閉じないように)
await page.getByTestId('tp-drive-ok').click({ timeout: 800 }).catch(() => {}); await page.waitForTimeout(300);
console.log('stale modal:', JSON.stringify(staleTxt.slice(0, 200)));
r.noStale = !staleTxt.includes(info.name);
if (await stale.count()) await page.locator('button', { hasText: /^あとで$/ }).first().click().catch(() => {});
if (await page.getByTestId('tp-phone-ap-AM').count()) { await page.getByTestId('tp-phone-ap-AM').click(); await page.waitForTimeout(400); }
const row = page.getByTestId(`tp-dl-${D}-AM-${info.pid}`);
r.inCar = (await row.count()) > 0 && (await row.getAttribute('data-rm')) === '0';
const slotTxt = await page.getByTestId('tp-dl-slot-AM').innerText().catch(() => '');
const absLine = (slotTxt.split('\n').find(l => l.startsWith('休み')) || '');
console.log('row', await row.count(), await row.getAttribute('data-rm').catch(() => ''), 'abs', JSON.stringify(absLine));
r.notAbsent = !absLine.includes(info.name);
// ③ 今日(利用終了日より後)
await page.evaluate((T) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, date: T, t: Date.now() })), T);
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {}); await page.getByTestId('tp-drive-ok').click({ timeout: 800 }).catch(() => {}); await page.waitForTimeout(300);
let todayHit = 0; for (const sl of ['AM', 'PM']) { if (await page.getByTestId(`tp-phone-ap-${sl}`).count()) { await page.getByTestId(`tp-phone-ap-${sl}`).click(); await page.waitForTimeout(300); }
  const txt = await page.getByTestId('tp-day-list').innerText().catch(() => ''); if (txt.includes(info.name)) todayHit++; }
r.goneAfterEnd = todayHit === 0;
await b.close();
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
