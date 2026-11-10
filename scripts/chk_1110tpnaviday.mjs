// 2026-11-10 trial546: 送迎表 1日版(スマホ)の車の見出しに「ナビ」(乗る人がいる車だけ・Google マップの経路案内が開く)
import { chromium } from 'playwright';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
const page = await ctx.newPage(); page.on('dialog', d => d.accept());
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(900); }
await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const t = new Date(); const iso = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; const dow = t.getDay();
  d.systemSettings = d.systemSettings || {}; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), address: '東京都新宿区西新宿2-8-1', closedDays: [] }; d.holidays = [];
  d.diarySettings = d.diarySettings || {}; d.diarySettings.cars = [{ id: 'c1', name: '1号車', type: '', cap: '8' }, { id: 'c2', name: '2号車', type: '', cap: '8' }];
  const act = d.patients.filter(p => p.status === '利用中' && !p.endDate).slice(0, 6); act.forEach((p, i) => { p.scheduleAmPm = ['', '', '', '', '', '', '']; p.scheduleAmPm[dow] = 'AM'; p.pauseHistory = []; p.scheduleChangeHistory = []; if (!p.address) p.address = '東京都新宿区西新宿1-1-1'; });
  const mk = (L) => ({ cars: { c1: L.slice(0, 3).map((p, i) => ({ pid: p.id, t: `8:${30 + i}` })), c2: L.slice(3, 6).map((p, i) => ({ pid: p.id, t: `8:${40 + i}` })) }, walkers: [], others: [], un: [], arrive: { c1: '8:57', c2: '8:59' }, driver: { c1: '見本A' }, _savedAt: Date.now() });
  d.transportPlans = { [`${iso}_AM`]: mk(act) }; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); localStorage.setItem('tsumugiTpDriveAck', String(Date.now()));
  sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, t: Date.now(), ampm: 'AM' })); });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 400 }).catch(() => {});
await page.getByTestId('tp-drive-ok').click({ timeout: 1000 }).catch(() => {});
await page.getByTestId('tp-phone-ap-AM').click({ timeout: 1000 }).catch(() => {}); await page.waitForTimeout(600);
const navi = page.locator('[data-testid^="tp-navi-day-"]'); const n = await navi.count();
ok(n >= 1, `1日版の車の見出しにナビ ${n}個`);
const bb = await navi.first().boundingBox(); ok(bb && bb.height >= 30, `押せる大きさ (h=${bb && Math.round(bb.height)})`);
const [pop] = await Promise.all([ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null), navi.first().click()]);
const url = pop ? pop.url() : ''; ok(/google\.com\/maps\/dir/.test(url) && /waypoints=/.test(url), `Google マップの経路案内が開く (${url.slice(0, 60)}…)`);
await page.screenshot({ path: `${process.env.S}/shots/t546/tp_day_navi.png` });
await b.close(); console.log(fails ? `FAILS ${fails}` : 'ALL PASS'); process.exit(fails ? 1 : 0);
