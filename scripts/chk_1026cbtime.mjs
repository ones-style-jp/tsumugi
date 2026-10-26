// 2026-10-26 試験版 trial416: ①連絡帳(各種入力→次回予定): 送迎表を使う店舗でも時間を入れられ、保存すると次回の送迎表の時間が変わる ②日付は読むだけ・「月間で変える」→利用者マスタ→「連絡帳に戻る」 ③送迎表: 7日以内の配置は開いただけで配布の控え(_base)が残る
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4173'; })();
const b = await chromium.launch(); const r = {};
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = new Date(); today.setHours(0, 0, 0, 0); if (today.getDay() === 0) today.setDate(today.getDate() + 1);
const tmr = new Date(today); tmr.setDate(today.getDate() + 1); if (tmr.getDay() === 0) tmr.setDate(tmr.getDate() + 1);
const d3 = new Date(today); d3.setDate(today.getDate() + 3); if (d3.getDay() === 0) d3.setDate(d3.getDate() + 1);
async function start(view, prep) {
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
  const pid = await page.evaluate(([view, prep, todayIso, tmrIso, d3Iso]) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.systemSettings = d.systemSettings || {}; const ps = (d.patients || []).filter(p => p.status === '利用中' && p.address).slice(0, 2);
    const dows = [todayIso, tmrIso, d3Iso].map(x => new Date(x + 'T00:00:00').getDay()); ps.forEach(p => { p.scheduleAmPm = ['', '', '', '', '', '', '']; dows.forEach(w => { p.scheduleAmPm[w] = 'AM'; }); p.pickupMinutes = 2; });
    d.diarySettings = d.diarySettings || {}; d.diarySettings.cars = [{ id: 'car1', name: '1号車', type: '' }]; d.transportPlans = d.transportPlans || {};
    d.transportPlans[`${tmrIso}_AM`] = { cars: { car1: [{ pid: ps[0].id, t: '8:30', mark: false }, { pid: ps[1].id, t: '8:40', mark: false }] }, walkers: [], others: [], un: [], memo: '', _savedAt: Date.now() };
    d.transportPlans[`${d3Iso}_AM`] = { cars: { car1: [{ pid: ps[0].id, t: '8:30', mark: false }] }, walkers: [], others: [], un: [], memo: '', _savedAt: Date.now() };
    (new Function('d', prep || ''))(d); localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); localStorage.setItem('tsumugiTpDriveAck', String(Date.now()));
    sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view, pid: null, date: todayIso, ampm: 'AM', t: Date.now() })); return ps[0].id; }, [view, prep, iso(today), iso(tmr), iso(d3)]);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
  return { page, pid }; }
const plans = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('daycareAppData_v3')).transportPlans);
// ① ② 連絡帳
{ const { page, pid } = await start('print', "");
  await page.getByTestId('cb-input-hub').click(); await page.waitForTimeout(500);
  r.hubNextCard = (await page.getByTestId('cb-hub-next').count()) === 1; await page.getByTestId('cb-hub-next').click(); await page.waitForTimeout(700);
  const mon = page.getByTestId(`cb-next-month-${pid}`); r.dateReadOnly = (await mon.count()) === 1 && (await mon.getAttribute('readonly')) !== null;
  const tbox = page.getByTestId(`cb-next-time-${pid}`); r.timeInputs = (await tbox.locator('input').count()) === 2;
  await tbox.locator('input').nth(0).fill('9'); await tbox.locator('input').nth(1).fill('15'); await page.waitForTimeout(300);
  await page.locator('button:visible', { hasText: /^保存/ }).last().click(); await page.waitForTimeout(1200);
  const pl = await plans(page); const m = ((pl[`${iso(tmr)}_AM`] || {}).cars || {}).car1 || []; const me = m.find(x => x.pid === pid);
  r.tpUpdated = !!me && me.t === '9:15' && ((pl[`${iso(tmr)}_AM`] || {})._cbT || {})[pid] === '9:15'; if (!r.tpUpdated) console.log('PL', JSON.stringify(pl[`${iso(tmr)}_AM`]).slice(0, 300));
  // 日付 → 月間(利用者マスタ) → 連絡帳に戻る
  await page.getByTestId('cb-input-hub').click().catch(() => {}); await page.waitForTimeout(400); if (!(await page.getByTestId(`cb-next-monthly-${pid}`).count())) { await page.getByTestId('cb-hub-next').click(); await page.waitForTimeout(600); }
  await page.getByTestId(`cb-next-monthly-${pid}`).click(); await page.waitForTimeout(1200);
  r.toMaster = (await page.getByTestId('master-back-print').count()) === 1;
  await page.getByTestId('master-back-print').click(); await page.waitForTimeout(1200); r.backToPrint = (await page.getByTestId('cb-input-hub').count()) === 1 && (await page.getByTestId('master-back-print').count()) === 0;
  r.reopenNext = (await page.getByTestId(`cb-next-month-${pid}`).count()) === 1; /* trial418: 戻ったら次回予定の小窓が開いている */
  const pnl = page.locator('.tsu-cap-dvh.max-w-4xl').first(); r.noHScroll = (await pnl.count()) === 1 && await pnl.evaluate(e => { const b = e.querySelector('.overflow-y-auto') || e; return b.scrollWidth <= b.clientWidth + 2; });
  r.oneUndec = !/未定（空欄）/.test(await pnl.innerText()) && (await page.getByTestId(`cb-next-undec-${pid}`).count()) === 1;
  await page.context().close(); }
// ②' スマホ幅: 次回予定の小窓が横に見切れない
{ const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', hasTouch: true }); const page = await ctx.newPage(); page.on('dialog', d => d.accept());
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
  await page.evaluate((todayIso) => { localStorage.setItem('tsumugiSidebarOpen', '0'); sessionStorage.setItem('tsumugiCbReopenNext', '1'); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'print', pid: null, date: todayIso, ampm: 'AM', t: Date.now() })); }, iso(today));
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
  const pnl = page.locator('.tsu-cap-dvh.max-w-4xl').first(); r.phoneNoHScroll = (await pnl.count()) === 1 && await pnl.evaluate(e => { const b = e.querySelector('.overflow-y-auto') || e; return b.scrollWidth <= b.clientWidth + 2; }); if (!r.phoneNoHScroll) console.log('PHONE', await pnl.count());
  await ctx.close(); }
// ③ 送迎表の自動の控え
{ const { page } = await start('transport', "");
  await page.waitForTimeout(1500); const pl = await plans(page); const p3 = pl[`${iso(d3)}_AM`] || {};
  r.autoBase = !!(p3._base && p3._baseAt && p3._base.cars && p3._base.cars.car1 && p3._base.cars.car1.length === 1); if (!r.autoBase) console.log('P3', JSON.stringify(p3).slice(0, 200));
  await page.context().close(); }
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
