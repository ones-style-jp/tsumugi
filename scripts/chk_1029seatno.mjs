// 2026-10-29 ユーザー報告「送迎表の送りで、タントに人がいて、ほかの車からドラッグしていくと、タントに3人しかいないのに順番が3・4・5になる。車に配置された人の中だけで番号を」
//   3人乗りの車(c1)に、席の無い方2人(席未定)・席のある方2人。もう1台(c2)の方を c1 の空いている席へ長押しで運ぶ
//   ①運ぶ前: c1 の丸の番号は 1・2(席の無い方は数えない) ②運んだ後: 1・2・3 ③送りの順番の一覧は 席のある方が先で 1〜3、席の無い方はその後ろ
//   ④保存した並びも席のある方が先 ⑤席から外すと、その方は後ろへ(番号は 1・2)
//   実行: node scripts/chk_1029seatno.mjs [--port 4175]
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4175'; })();
const b = await chromium.launch(); const r = {};
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const day = new Date(); day.setDate(day.getDate() + 1); if (day.getDay() === 0) day.setDate(day.getDate() + 1); const iso = isoOf(day);
const page = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.addInitScript(() => { try { localStorage.setItem('tsumugiTpDriveAck', String(Date.now())); } catch {} });
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
const ids = await page.evaluate((iso) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.systemSettings = d.systemSettings || {}; d.diarySettings.cars = [{ id: 'c1', name: '1号車', type: '', cap: '3' }, { id: 'c2', name: '2号車', type: '', cap: '6' }];
  const act = d.patients.filter(p => p.status === '利用中' && p.address).slice(0, 5); const dow = new Date(iso + 'T00:00:00').getDay(); act.forEach((p) => { p.scheduleAmPm = ['', '', '', '', '', '', '']; p.scheduleAmPm[dow] = 'AM'; });
  const [A, B, C, D, F] = act.map(p => p.id);
  d.transportPlans = { [`${iso}_AM`]: { cars: { c1: [A, B, C, D].map((pid, i) => ({ pid, t: `8:${30 + i * 5}` })), c2: [{ pid: F, t: '8:50' }] }, walkers: [], others: [], un: [], dropMode: 'custom',
    drop: { cars: { c1: [{ pid: A }, { pid: B }, { pid: C, seat: 0 }, { pid: D, seat: 1 }], c2: [{ pid: F, seat: 0 }] }, walkers: [], others: [], depart: {}, departAuto: {} }, _savedAt: Date.now() } };
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0');
  sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, date: iso, ampm: 'AM', t: Date.now() })); return { A, B, C, D, F }; }, iso);
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2200); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
const plan = () => page.evaluate((iso) => JSON.parse(localStorage.getItem('daycareAppData_v3')).transportPlans[`${iso}_AM`], iso);
const nums = () => page.locator('[data-testid="tp-seatcar-c1"] [data-testid="tp-seat-no"]').allInnerTexts();
await page.getByTestId(`tp-seatbtn-${iso}-AM`).first().click(); await page.waitForTimeout(800);
const n0 = await nums(); console.log('運ぶ前', n0); r.beforeOnlySeated = n0.join(',') === '1,2';
// 2号車の方を 1号車の空いている席(2)へ
const src = page.locator('[data-testid="tp-seatcar-c2"] [data-tpdrag="1"]').first(); const sb = await src.boundingBox(); const tb = await page.getByTestId('tp-seat-c1-2').boundingBox();
await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2); await page.mouse.down(); await page.waitForTimeout(500);
await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, { steps: 12 }); await page.waitForTimeout(200); await page.mouse.up(); await page.waitForTimeout(900);
const n1 = await nums(); console.log('運んだ後', n1); r.afterOneToThree = n1.join(',') === '1,2,3';
const p1 = await plan(); const L1 = (p1.drop.cars.c1 || []).map(m => m.pid); console.log('保存の並び', L1.join(','));
r.savedSeatFirst = L1.slice(0, 3).join(',') === [ids.C, ids.D, ids.F].join(',') && L1.slice(3).join(',') === [ids.A, ids.B].join(',');
// 送りの順番の一覧
await page.locator('[data-testid="tp-seatcar-c1"] [data-testid="tp-seat-no"]').first().click(); await page.waitForTimeout(500);
const rows = await page.locator('[data-testid="tp-seat-order"] [data-testid^="tp-ord-row-"]').evaluateAll(els => els.map(e => e.getAttribute('data-testid').replace('tp-ord-row-', '') + ':' + (e.querySelector('span.rounded-full') || {}).textContent));
console.log('送りの順番', rows); r.orderPanel = rows.join(',') === [`${ids.C}:1`, `${ids.D}:2`, `${ids.F}:3`, `${ids.A}:4`, `${ids.B}:5`].join(',');
// 一覧で 3番の方をひとつ前へ → 席のある方の中で入れ替わる
await page.getByTestId(`tp-ord-up-${ids.F}`).click(); await page.waitForTimeout(700);
const L2 = ((await plan()).drop.cars.c1 || []).map(m => m.pid); r.reorderWithinSeated = L2.slice(0, 3).join(',') === [ids.C, ids.F, ids.D].join(','); console.log('入れ替え後', L2.join(','));
await page.getByTestId('tp-ord-close').click().catch(() => {}); await page.waitForTimeout(300);
// 席から外す → 後ろへ・番号は 1・2
await page.getByTestId('tp-seat-c1-0').locator('button[aria-label="席から外す"]').click(); await page.waitForTimeout(800);
const n3 = await nums(); const L3 = ((await plan()).drop.cars.c1 || []).map(m => m.pid); console.log('外した後', n3, L3.join(','));
r.unseatGoesBack = [...n3].sort().join(',') === '1,2' && /* 画面の丸は席の位置の順に並ぶ(番号は送りの順) */ L3.slice(0, 2).join(',') === [ids.F, ids.D].join(',') && L3.includes(ids.C) && L3.indexOf(ids.C) >= 2;
await b.close();
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
