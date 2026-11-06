// 2026-11-06 trial527: 座席表(送り)の運転者「その他（名前を入力）」を選ぶと名前の小窓が座席表の前に出て、入れた名前が送りの運転者に入る
//   (以前は小窓が座席表の後ろ(zIndex 400 < 10000)に出て、何も反応しないように見えた)
//   実行: node scripts/chk_1106seatdriver.mjs --port 4175
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4175'; })();
const b = await chromium.launch(); const r = {};
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const day = new Date(); day.setDate(day.getDate() + 1); if (day.getDay() === 0) day.setDate(day.getDate() + 1); const iso = isoOf(day);
for (const [label, vp] of [['pc', { width: 1366, height: 900 }], ['ipad', { width: 1180, height: 820 }]]) {
  const page = await (await b.newContext({ viewport: vp, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.addInitScript(() => { try { localStorage.setItem('tsumugiTpDriveAck', String(Date.now())); } catch {} });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
  await page.evaluate((iso) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.systemSettings = d.systemSettings || {}; d.systemSettings.tpDropShown = true; d.diarySettings.cars = [{ id: 'c1', name: '1号車', type: '', cap: '6' }];
    const act = d.patients.filter(p => p.status === '利用中' && p.address).slice(0, 2); const dow = new Date(iso + 'T00:00:00').getDay(); act.forEach(p => { p.scheduleAmPm = ['', '', '', '', '', '', '']; p.scheduleAmPm[dow] = 'AM'; });
    d.transportPlans = { [`${iso}_AM`]: { cars: { c1: act.map((p, i) => ({ pid: p.id, t: `8:${30 + i * 5}` })) }, walkers: [], others: [], un: [], dropMode: 'custom',
      drop: { cars: { c1: act.map((p, i) => ({ pid: p.id, seat: i })) }, walkers: [], others: [], depart: {}, departAuto: {} }, _savedAt: Date.now() } };
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0');
    sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, date: iso, ampm: 'AM', t: Date.now() })); }, iso);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2200); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
  await page.getByTestId(`tp-seatbtn-${iso}-AM`).first().click(); await page.waitForTimeout(800);
  const sel = page.getByTestId('tp-seat-driver-c1');
  await sel.selectOption('__other__'); await page.waitForTimeout(400);
  const input = page.getByTestId('tp-seat-driver-c1-other-input');
  r[`${label}_shown`] = await input.isVisible().catch(() => false);
  // 小窓がいちばん前にあるか(入力欄の真ん中を指した要素が入力欄そのもの)
  r[`${label}_onTop`] = await input.evaluate(el => { const b = el.getBoundingClientRect(); return document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2) === el; }).catch(() => false);
  await input.click({ timeout: 2000 }).catch(() => {}); await page.keyboard.type('応援テスト'); await page.getByTestId('tp-seat-driver-c1-other-ok').click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(900);
  const saved = await page.evaluate((iso) => (((JSON.parse(localStorage.getItem('daycareAppData_v3')).transportPlans[`${iso}_AM`] || {}).drop || {}).driver || {}).c1 || '', iso);
  r[`${label}_saved`] = saved === '応援テスト';
  r[`${label}_label`] = (await page.getByTestId('tp-seat-driver-c1-label').innerText()).includes('応援テスト');
  r[`${label}_closed`] = (await page.getByTestId('tp-seat-driver-c1-other').count()) === 0 && (await page.getByTestId('tp-seat-modal').count()) > 0;
  await page.context().close();
}
console.log(r); const ok = Object.values(r).every(Boolean); console.log(ok ? 'PASS' : 'FAIL'); await b.close(); process.exit(ok ? 0 : 1);
