// 2026-10-26 試験版 trial408: 送迎表「送りの時間 非表示」のとき ①座席表に「家に着く目安を入れる」と各席の「着」が出ない(PDFにも「着」なし) ②座席表のダウンロードの「PDFができました」が座席表より前面 ③日ごとの運行表は送りを迎えの下に(縦・車名と氏名・時間なし)。表示のときは従来どおり(横・時間あり)
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4173'; })();
const b = await chromium.launch(); const r = {};
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const now = new Date(); const mon = new Date(now); mon.setDate(now.getDate() + (now.getDay() === 0 ? -6 : 1 - now.getDay())); mon.setHours(0, 0, 0, 0); const key = `${iso(mon)}_AM`;
async function start(prep) {
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
  const ids = await page.evaluate(([key, prep]) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.systemSettings = d.systemSettings || {}; const ps = (d.patients || []).filter(p => p.status === '利用中' && p.address).slice(0, 3); ps.forEach(p => { p.schedule = p.schedule || {}; });
    d.diarySettings = d.diarySettings || {}; d.diarySettings.cars = [{ id: 'car1', name: '1号車', type: '' }, { id: 'car2', name: '2号車', type: '' }]; d.transportPlans = d.transportPlans || {};
    const dow = new Date(key.slice(0, 10) + 'T00:00:00').getDay(); ps.forEach((p) => { p.scheduleAmPm = ['', '', '', '', '', '', '']; p.scheduleAmPm[dow] = 'AM'; p.pickupMinutes = 2; });
    d.transportPlans[key] = { cars: { car1: [{ pid: ps[0].id, t: '8:30', mark: false }, { pid: ps[1].id, t: '8:40', mark: false }], car2: [{ pid: ps[2].id, t: '8:40', mark: false }] }, walkers: [], others: [], un: [], memo: '', arrive: { car1: '8:50' }, driver: { car1: '', car2: '' },
      dropMode: 'custom', drop: { cars: { car1: [{ pid: ps[0].id, seat: 0 }, { pid: ps[1].id, seat: 1 }], car2: [{ pid: ps[2].id, seat: 0 }] }, walkers: [], others: [], depart: { car1: '12:10' } }, dropAt: { [ps[0].id]: '12:20' }, dropAtAuto: { [ps[0].id]: true }, _savedAt: Date.now() };
    (new Function('d', prep || ''))(d); localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); localStorage.setItem('tsumugiTpDriveAck', String(Date.now())); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, date: key.slice(0, 10), ampm: 'AM', t: Date.now() })); return ps.map(p => p.id); }, [key, prep]);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
  await page.evaluate(() => { window.__ph = []; window.addEventListener('setPrintHtml', e => { window.__ph.push(e.detail); }); });
  return { page, ids }; }
const openSeat = async (page) => { await page.getByTestId(`tp-seatbtn-${iso(mon)}-AM`).first().click().catch(async () => { await page.getByTestId(`tp-fb-seatbtn-${iso(mon)}-AM`).first().click(); }); await page.waitForTimeout(900); };
const dailyHtml = async (page) => { await page.locator('button:visible', { hasText: /^ダウンロード$/ }).first().click(); await page.waitForTimeout(500); await page.locator('button', { hasText: /日ごと（A4横/ }).click(); await page.waitForTimeout(300); await page.locator('button:visible', { hasText: /^ダウンロード$/ }).last().click(); await page.waitForTimeout(1500); const ph = await page.evaluate(() => window.__ph); const d0 = ph.find(x => /運行表_/.test(x.title)); return d0 ? d0.html : ''; };
// A. 送りの時間 非表示
{ const { page } = await start("d.systemSettings.tpDropShown = false;");
  await openSeat(page);
  r.hidEstBtn = (await page.getByTestId('tp-seat-at-est').count()) === 0 && (await page.getByTestId('tp-seat-depart-est').count()) === 0; /* trial431: 出発の目安のボタンもなくした(自動で入れ直す) */
  r.hidBadges = (await page.locator('[data-testid^="tp-seat-at-"]').count()) === 0;
  await page.getByTestId('tp-seat-dl').click(); await page.waitForTimeout(1200);
  const ph = await page.evaluate(() => window.__ph); const seat = ph.find(x => /座席表/.test(x.title));
  r.hidSeatPdfNoAt = !!seat && !/class="at"/.test(seat.html);
  const z = await page.evaluate(() => { const pj = document.querySelector('[data-testid="pdf-job"]'); const sm = document.querySelector('[data-testid="tp-seat-modal"]'); return { pj: pj ? Number(getComputedStyle(pj).zIndex) : -1, sm: sm ? Number(getComputedStyle(sm).zIndex) : -1 }; });
  r.pdfJobOnTop = z.pj > z.sm && z.sm >= 10000; if (!r.pdfJobOnTop) console.log('Z', JSON.stringify(z));
  console.log('A1', JSON.stringify(r));
  await page.context().close(); }
{ const { page } = await start("d.systemSettings.tpDropShown = false;");
  const h = await dailyHtml(page);
  r.hidDailyStacked = /data-tp-stack="1"/.test(h) && /午前　送り/.test(h) && /1号車/.test(h) && !/>12:20</.test(h);
  if (!r.hidDailyStacked) console.log('DAILY', h.slice(0, 300), h.length);
  await page.context().close(); }
// B. 送りの時間 表示(従来どおり)
{ const { page } = await start("d.systemSettings.tpDropShown = true;");
  await openSeat(page);
  r.shownEstBtn = (await page.getByTestId('tp-seat-at-est').count()) === 1 && (await page.locator('[data-testid^="tp-seat-at-"]').count()) >= 3;
  await page.getByTestId('tp-seat-close').click().catch(() => {}); await page.waitForTimeout(400);
  const h = await dailyHtml(page);
  r.shownDailySide = !/data-tp-stack="1"/.test(h) && /午前　送り/.test(h) && />12:20</.test(h);
  if (!r.shownDailySide) console.log('DAILY2', h.slice(0, 300), h.length);
  await page.context().close(); }
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
