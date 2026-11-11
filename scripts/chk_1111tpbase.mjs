// 2026-11-11 trial556 送迎表: ①基本の送迎表で入れた お迎え時間/送りの時間 を利用者マスタの基本の時間にも反映(チェックで選ぶ・店舗の設定 tpBaseReflect)
//   ②ふつうの週で入れた時間はマスタに反映しない ③長押しドラッグ中に端へ持っていくと一緒にスクロールする(iPad)
//   実行: node chk/chk_1111tpbase.mjs [port]   (見本データ VITE_E2E_DEMO=1 のビルド)
import { chromium } from 'playwright';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
const b = await chromium.launch();
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const now = new Date(); const dow = now.getDay(); const today = iso(now);
const tplIso = (() => { const x = new Date('2099-01-05T00:00:00'); x.setDate(x.getDate() + (dow === 0 ? 6 : dow - 1)); return iso(x); })();
async function start(viewport, date, n = 4) {
  const ctx = await b.newContext({ viewport, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', hasTouch: viewport.width < 1200 }); const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => { console.log('PAGEERROR', e.message.slice(0, 200)); fails++; });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
  const ids = await page.evaluate(([dow, tplIso, today, date, n]) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.systemSettings = d.systemSettings || {}; d.holidays = []; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [] }; delete d.systemSettings.tpBaseReflect; d.systemSettings.tpDropShown = true;
    d.ticketRecords = (d.ticketRecords || []).filter(x => !(x && x.year === new Date().getFullYear() && String(x.date) === `${new Date().getMonth() + 1}月${new Date().getDate()}日`));
    const all = (d.patients || []).filter(p => p.status === '利用中' && !p.endDate); const ps = all.slice(0, n); all.slice(n).forEach(p => { p.scheduleAmPm = ['', '', '', '', '', '', '']; });
    d.diarySettings = d.diarySettings || {}; d.diarySettings.cars = [{ id: 'car1', name: '1号車', type: '' }, { id: 'car2', name: '2号車', type: '' }]; d.transportPlans = {};
    ps.forEach((p, i) => { p.pauseHistory = []; p.scheduleChangeHistory = []; p.startDate = '2025-01-01'; p.scheduleAmPm = ['', '', '', '', '', '', '']; p.scheduleAmPm[dow] = 'AM'; p.pickupMinutes = 2; p.pickupType = i === 1 ? '' : 'fixed'; p.pickupTimes = ['', '', '', '', '', '', '']; p.pickupTimes[dow] = '08:30'; p.dropTimeOn = false; p.dropTimes = ['', '', '', '', '', '', '']; p.name = `検${i + 1}太郎`; });
    const mk = (t0) => ps.map((p, i) => ({ pid: p.id, t: `${8}:${String(30 + i).padStart(2, '0')}`, mark: false }));
    d.transportPlans[`${tplIso}_AM`] = { cars: { car1: mk() }, walkers: [], others: [], un: [], memo: '', driver: {}, _savedAt: Date.now() - 86400000 };
    d.transportPlans[`${today}_AM`] = { cars: { car1: mk() }, walkers: [], others: [], un: [], memo: '', driver: {}, _savedAt: Date.now() - 86400000 };
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); localStorage.setItem('tsumugiTpDriveAck', String(Date.now()));
    sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, date, t: Date.now(), ampm: 'AM' })); return ps.map(p => p.id); }, [dow, tplIso, today, date, n]);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
  return { page, ids }; }
const pat = (page, pid) => page.evaluate((pid) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const p = (d.patients || []).find(x => x.id === pid); return p ? { pickupTimes: p.pickupTimes, pickupType: p.pickupType, dropTimes: p.dropTimes, dropTimeOn: !!p.dropTimeOn } : null; }, pid);
const plan = (page, key) => page.evaluate((k) => (JSON.parse(localStorage.getItem('daycareAppData_v3')).transportPlans || {})[k] || null, key);
const typeTime = async (page, isoK, pid, v) => { const inp = page.locator(`[data-tprow][data-tppid="${pid}"][data-tpiso="${isoK}"] input`).first(); await inp.click(); await inp.fill(''); await inp.type(v, { delay: 20 }); await inp.press('Enter'); await page.waitForTimeout(900); };
const keypadTime = async (page, digits) => { for (const k of digits) { await page.locator('[data-testid="tsu-kp"] button', { hasText: new RegExp('^' + k + '$') }).last().click(); await page.waitForTimeout(50); } await page.locator('[data-testid="tsu-kp"] button', { hasText: /^(決定|確定)$/ }).last().click(); await page.waitForTimeout(900); };
// ---- ① 基本の送迎表 → 利用者マスタ ----
{ const { page, ids } = await start({ width: 1366, height: 900 }, '2099-01-05');
  ok((await page.getByTestId('tp-base-banner').count()) === 1, '基本の送迎表を開いた');
  const cbP = page.getByTestId('tp-base-reflect-pickup'), cbD = page.getByTestId('tp-base-reflect-drop');
  ok((await cbP.count()) === 1 && await cbP.isChecked() && (await cbD.count()) === 1 && await cbD.isChecked(), '帯に「お迎え時間」「送りの時間」のチェック(既定はどちらも入)');
  await typeTime(page, tplIso, ids[0], '8:50');
  let p0 = await pat(page, ids[0]); let pl = await plan(page, `${tplIso}_AM`);
  ok(p0 && p0.pickupTimes[dow] === '08:50' && p0.pickupType === 'fixed', `お迎え 8:50 → マスタの基本のお迎え時間 ${JSON.stringify(p0 && p0.pickupTimes[dow])}`);
  ok(pl && Object.values(pl.cars).flat().find(m => m.pid === ids[0]).t === '8:50', '基本の送迎表のコマにも 8:50 が残る(同じ保存)');
  await typeTime(page, tplIso, ids[1], '9:05');
  const p1 = await pat(page, ids[1]);
  ok(p1 && p1.pickupTimes[dow] === '09:05' && p1.pickupType === 'fixed', `お迎えの種類が未設定の方は「固定」にして入れる ${JSON.stringify(p1 && [p1.pickupTimes[dow], p1.pickupType])}`);
  // 送りの時間(行の「送--:--」→ テンキー 12:30)
  await page.getByTestId(`tp-dat-${ids[0]}`).first().click(); await page.waitForTimeout(400);
  ok((await page.getByTestId('tsu-kp').count()) === 1, '送りの時間のテンキーが開く');
  await keypadTime(page, ['1', '2', '3', '0']);
  p0 = await pat(page, ids[0]); pl = await plan(page, `${tplIso}_AM`);
  ok(p0 && p0.dropTimeOn === true && p0.dropTimes[dow] === '12:30', `送り 12:30 → マスタの基本の送り時間 ${JSON.stringify(p0 && [p0.dropTimeOn, p0.dropTimes[dow]])}(設定するが入になる)`);
  ok(pl && (pl.dropAt || {})[String(ids[0])] === '12:30', 'コマの送りの時間にも 12:30');
  // チェックを外す → 反映しない
  await cbP.click(); await page.waitForTimeout(700);
  ok(await page.evaluate(() => JSON.parse(localStorage.getItem('daycareAppData_v3')).systemSettings.tpBaseReflect.pickup === false), 'お迎えのチェックを外すと店舗の設定に保存');
  await typeTime(page, tplIso, ids[2], '9:10');
  const p2 = await pat(page, ids[2]); pl = await plan(page, `${tplIso}_AM`);
  ok(p2 && p2.pickupTimes[dow] === '08:30', `外したあとは お迎え 9:10 を入れてもマスタは 08:30 のまま(${p2 && p2.pickupTimes[dow]})`);
  ok(pl && Object.values(pl.cars).flat().find(m => m.pid === ids[2]).t === '9:10', 'コマには 9:10 が入る');
  await cbD.click(); await page.waitForTimeout(700);
  await page.getByTestId(`tp-dat-${ids[1]}`).first().click(); await page.waitForTimeout(400); await keypadTime(page, ['1', '2', '4', '5']);
  const p1b = await pat(page, ids[1]);
  ok(p1b && p1b.dropTimeOn === false && !p1b.dropTimes[dow], '送りのチェックを外すと 12:45 を入れてもマスタは変わらない');
  await cbP.click(); await cbD.click(); await page.waitForTimeout(600); // 戻す
  // ② ふつうの週では反映しない
  await page.getByTestId('tp-base-back').click(); await page.waitForTimeout(1500);
  await typeTime(page, today, ids[3], '9:20');
  const p3 = await pat(page, ids[3]);
  ok(p3 && p3.pickupTimes[dow] === '08:30', `今週の送迎表で 9:20 を入れてもマスタは 08:30 のまま(${p3 && p3.pickupTimes[dow]})`);
  await page.screenshot({ path: '/tmp/chk_1111tpbase_pc.png' }).catch(() => {});
  await page.context().close(); }
// ---- ③ iPad: 長押しドラッグ中の自動スクロール ----
{ const { page, ids } = await start({ width: 1080, height: 810 }, today, 18);
  const nameBtn = page.locator(`[data-tprow][data-tppid="${ids[0]}"][data-tpiso="${today}"] button[data-tpdrag]`).first();
  // 名前の行から見て、いちばん近い縦にスクロールできる枠(送迎表の中の箱)
  const sch = await nameBtn.evaluateHandle(el => { let e = el.parentElement; while (e && e !== document.body) { const cs = getComputedStyle(e); if (/(auto|scroll)/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 30) return e; e = e.parentElement; } return document.scrollingElement; });
  const dims = await sch.evaluate(el => ({ sh: el.scrollHeight, ch: el.clientHeight, top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom, cls: String(el.className).slice(0, 60) }));
  ok(dims.sh > dims.ch + 200, `送迎表の箱は縦にスクロールする作り(${dims.sh}/${dims.ch} ${dims.cls})`);
  const scTop = () => sch.evaluate(el => el.scrollTop);
  await nameBtn.scrollIntoViewIfNeeded(); const bb = await nameBtn.boundingBox();
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down(); await page.waitForTimeout(350);
  ok((await page.locator('text=青い線の位置に入ります').count()) === 1, '長押しでつかんだ');
  const x = bb.x + bb.width / 2; const y0 = bb.y + bb.height / 2;
  for (let i = 1; i <= 8; i++) await page.mouse.move(x, y0 + ((dims.bottom - 12) - y0) * i / 8);
  const t0 = await scTop(); await page.waitForTimeout(900); const t1 = await scTop();
  ok(t1 > t0 + 40, `下の端に持っていくと箱が下へスクロールする(${t0} → ${t1})`);
  for (let i = 1; i <= 8; i++) await page.mouse.move(x, (dims.bottom - 12) + ((dims.top + 12) - (dims.bottom - 12)) * i / 8);
  await page.waitForTimeout(900); const t2 = await scTop();
  ok(t2 < t1 - 40, `上の端に持っていくと上へ戻る(${t1} → ${t2})`);
  await page.mouse.move(x, (dims.top + dims.bottom) / 2); await page.waitForTimeout(400); const t3 = await scTop(); await page.waitForTimeout(400);
  ok(Math.abs((await scTop()) - t3) < 2, '真ん中に戻すと止まる');
  await page.mouse.up(); await page.waitForTimeout(600);
  ok((await page.locator('text=青い線の位置に入ります').count()) === 0, '離すとドラッグが終わる');
  await page.screenshot({ path: '/tmp/chk_1111tpbase_ipad.png' }).catch(() => {});
  await page.context().close(); }
await b.close();
console.log(fails ? `FAILS ${fails}` : 'ALL PASS'); process.exit(fails ? 1 : 0);
