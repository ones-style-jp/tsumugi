// 2026-11-05 1105b(安定版・不具合修正): お迎え時間を入れていない方(提供時間からの目安「8時」)は送迎表で 8:-- と出す(8:00 と出ていた)・入れた方は 8:30 のまま
//   実行: node scripts/chk_1105notime.mjs [port]
import { chromium } from 'playwright';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4173';
const b = await chromium.launch(); const r = {};
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const now = new Date(); const mon = new Date(now); mon.setDate(now.getDate() + (now.getDay() === 0 ? -6 : 1 - now.getDay())); mon.setHours(0, 0, 0, 0); const key = `${iso(mon)}_AM`;
const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
const ids = await page.evaluate((key) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.holidays = []; d.systemSettings = d.systemSettings || {}; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [] };
  const ps = (d.patients || []).filter(p => p.status === '利用中' && p.address).slice(0, 2); const dow = new Date(key.slice(0, 10) + 'T00:00:00').getDay();
  ps.forEach(p => { p.scheduleAmPm = ['', '', '', '', '', '', '']; p.scheduleAmPm[dow] = 'AM'; }); ps[0].pickupType = 'fixed'; ps[0].pickupTimes = ['', '', '', '', '', '', '']; ps[0].pickupTimes[dow] = '8:30'; ps[1].pickupType = ''; ps[1].pickupTimes = [];
  d.diarySettings = d.diarySettings || {}; d.diarySettings.cars = [{ id: 'car1', name: '1号車', type: '' }]; d.transportPlans = {};
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); localStorage.setItem('tsumugiTpDriveAck', String(Date.now())); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, date: key.slice(0, 10), ampm: 'AM', t: Date.now() })); return ps.map(p => p.id); }, key);
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
const txt = await page.evaluate(() => document.body.innerText);
r.has_dash = /8:--/.test(txt); r.no_800 = !/\b8:00\b/.test(txt); r.kept_830 = /8:30/.test(txt);
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close(); process.exit(Object.values(r).every(Boolean) ? 0 : 1); void ids;
