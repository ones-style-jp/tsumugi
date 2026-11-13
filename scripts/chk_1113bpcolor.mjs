// 2026-11-13 1113c: スマホの提供記録入力の血圧は 上/下 を別々に色分け(片方が高くても両方赤くならない)
//   node chk/chk_1113bpcolor.mjs [port]
import { chromium } from 'playwright';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => { console.log('PAGEERROR', e.message.slice(0, 200)); fails++; });
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(900); }
const info = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const now = new Date(); const dow = now.getDay(); const dateStr = `${now.getMonth() + 1}月${now.getDate()}日`;
  const ps = (d.patients || []).filter(p => p.status === '利用中' && !p.endDate).slice(0, 2); (d.patients || []).forEach(p => { if (!ps.includes(p)) p.scheduleAmPm = ['', '', '', '', '', '', '']; });
  ps.forEach(p => { p.pauseHistory = []; p.scheduleAmPm = ['', '', '', '', '', '', '']; p.scheduleAmPm[dow] = 'AM'; p.startDate = '2025-01-01'; });
  d.ticketRecords = (d.ticketRecords || []).filter(r => !(r && String(r.date) === dateStr));
  // A: 上が高い(160)・下は普通(70) / B: 上は普通(120)・下が高い(100)
  d.ticketRecords.push({ id: `bp_a_${Date.now()}`, patientId: ps[0].id, date: dateStr, year: now.getFullYear(), status: '出席', bpUpSt_AM: '160', bpDnSt_AM: '70', _savedAt: Date.now() });
  d.ticketRecords.push({ id: `bp_b_${Date.now()}`, patientId: ps[1].id, date: dateStr, year: now.getFullYear(), status: '出席', bpUpSt_AM: '120', bpDnSt_AM: '100', _savedAt: Date.now() });
  d.holidays = []; d.systemSettings = d.systemSettings || {}; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [] };
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0');
  sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'record', pid: null, t: Date.now(), ampm: 'AM' })); return ps.map(p => p.id); });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2200); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
// 1人1行の一覧(たたんだ状態・広がるのは押した1人だけ) → 1人ずつ広げて読む
const cls = async (pid, which) => page.evaluate(([pid, which]) => { const el = document.querySelector(`[data-testid^="rv-bp-${pid}-bpSt_combo"] [data-bp-${which}]`); return el ? { cls: el.className, text: el.textContent } : null; }, [pid, which]);
const expand = async (pid) => { const row = page.getByTestId(`rv-crow-${pid}`); if (await row.count()) { await row.first().click(); await page.waitForTimeout(600); } };
await expand(info[0]); const a_up = await cls(info[0], 'up'), a_dn = await cls(info[0], 'dn');
await expand(info[1]); const b_up = await cls(info[1], 'up'), b_dn = await cls(info[1], 'dn');
const isRed = (c) => !!c && /red|rose|orange|amber/.test(c.cls);
ok(!!a_up && !!a_dn, `A: 上と下が別々の要素で出る (${JSON.stringify([a_up && a_up.text, a_dn && a_dn.text])})`);
ok(isRed(a_up) && !isRed(a_dn), `A: 上160は赤系・下70は赤くない (${a_up && a_up.cls} / ${a_dn && a_dn.cls})`);
ok(!isRed(b_up) && isRed(b_dn), `B: 上120は赤くない・下100は赤系 (${b_up && b_up.cls} / ${b_dn && b_dn.cls})`);
await b.close();
console.log(fails ? `FAIL ${fails}` : 'ALL PASS'); process.exit(fails ? 1 : 0);
