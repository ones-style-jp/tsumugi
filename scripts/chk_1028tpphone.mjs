// 2026-10-28(試験版) 送迎表のスマホ(1日表示)
//   ①上の帯: 日付は中身の幅だけ(狭い)・AM/PM の切り替えあり・横にはみ出さない(幅360でも)
//   ②AM を押すと午前だけ・PM を押すと午後だけ ③青い帯に日付がない(「編集はパソコン・iPadで」だけ)
//   ④「施設に到着」(目安)を出さない
//   実行: node scripts/chk_1028tpphone.mjs [--port 4175]
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4175'; })();
const b = await chromium.launch(); const r = {};
for (const W of [393, 360]) {
  const ctx = await b.newContext({ viewport: { width: W, height: 800 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => d.accept());
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const t = new Date(); const iso = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; const dow = t.getDay();
    d.systemSettings = d.systemSettings || {}; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [] }; d.holidays = [];
    d.diarySettings = d.diarySettings || {}; d.diarySettings.cars = [{ id: 'c1', name: '1号車', type: '', cap: '8' }, { id: 'c2', name: '2号車', type: '', cap: '8' }];
    const act = d.patients.filter(p => p.status === '利用中' && !p.endDate).slice(0, 12); act.forEach((p, i) => { p.scheduleAmPm = ['', '', '', '', '', '', '']; p.scheduleAmPm[dow] = i < 6 ? 'AM' : 'PM'; p.pauseHistory = []; p.scheduleChangeHistory = []; });
    const mk = (L) => ({ cars: { c1: L.slice(0, 3).map((p, i) => ({ pid: p.id, t: `8:${30 + i}` })), c2: L.slice(3, 6).map((p, i) => ({ pid: p.id, t: `8:${40 + i}` })) }, walkers: [], others: [], un: [], arrive: { c1: '8:57', c2: '8:59' }, arriveAuto: { c1: true }, _savedAt: Date.now() });
    d.transportPlans = { [`${iso}_AM`]: mk(act.slice(0, 6)), [`${iso}_PM`]: mk(act.slice(6, 12)) }; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0');
    sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, t: Date.now() })); });
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {}); await page.getByTestId('tp-drive-ok').click({ timeout: 800 }).catch(() => {}); await page.waitForTimeout(300);
  const bar = page.getByTestId('tp-phone-daybar');
  const fit = await bar.evaluate(el => ({ sw: el.scrollWidth, cw: el.clientWidth, right: Math.max(...[...el.children].map(c => c.getBoundingClientRect().right)) }));
  const dw = (await page.getByTestId('tp-phone-date').boundingBox())?.width || 999; console.log(W, 'bar', fit, 'date width', dw);
  r[`barFits${W}`] = fit.sw <= fit.cw + 1 && fit.right <= W; r[`dateNarrow${W}`] = dw < 100;
  if (W !== 393) { await ctx.close(); continue; }
  r.ampmToggle = (await page.getByTestId('tp-phone-ampm').count()) > 0;
  await page.getByTestId('tp-phone-ap-AM').click(); await page.waitForTimeout(300);
  r.amOnly = (await page.getByTestId('tp-dl-slot-AM').count()) === 1 && (await page.getByTestId('tp-dl-slot-PM').count()) === 0;
  const amCls = await page.getByTestId('tp-phone-ap-AM').getAttribute('class');
  await page.getByTestId('tp-phone-ap-PM').click(); await page.waitForTimeout(300);
  r.pmOnly = (await page.getByTestId('tp-dl-slot-PM').count()) === 1 && (await page.getByTestId('tp-dl-slot-AM').count()) === 0; r.activeColor = /bg-blue-600/.test(amCls || '');
  const band = await page.getByTestId('tp-day-band').innerText(); console.log('band', JSON.stringify(band));
  r.bandNoDate = !/\d+\/\d+/.test(band) && !/（[日月火水木金土]）/.test(band) && band.includes('編集はパソコン・iPadで');
  const list = await page.getByTestId('tp-day-list').innerText();
  r.noArrive = !list.includes('施設に到着') && (await page.locator('[data-testid^="tp-dl-arrive-"]').count()) === 0 && !list.includes('目安');
  await page.screenshot({ path: process.env.SHOT || '/dev/null' }).catch(() => {});
  await ctx.close();
}
await b.close();
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
