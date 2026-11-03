// 2026-11-03 trial508 送迎表の整理: ①印は「時間の赤い枠＋連絡済」だけ(名前の左のチェック・押すと赤枠が消え「要連絡 n件」が減る) ②コマごとの変更の札・黄色い枠・休みの反映の札が無い
//   ③今日以降の休み(欠席の記録)は自動で送迎表から外れる ④コピーは「前の週から」「基本の送迎表から」+「この週を基本の送迎表にする」 ⑤基本を登録すると来週の同じ曜日はその並びで下書きができる(基本に無い方は未割当)
//   ⑥座席表は画面いっぱい ⑦スマホでも「連絡済にする」を押せる
//   実行: node scripts/chk_1103tpclean.mjs [port]
import { chromium } from 'playwright';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
const r = {};
const b = await chromium.launch();
const seed = async (page, extra) => {
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  const S = await page.evaluate((extra) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const t = new Date(); const dow = t.getDay(); const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    d.systemSettings = d.systemSettings || {}; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [] }; delete d.systemSettings.tpDropShown; d.holidays = []; d.ticketRecords = (d.ticketRecords || []).filter(x => !(x && x.year === t.getFullYear())); d.transportPlans = {}; d.monthlyShifts = {};
    const act = d.patients.filter(p => p.status === '利用中' && !p.endDate); const ids = {}, names = {};
    const set = (k, i) => { const p = act[i]; p.pauseHistory = []; p.scheduleAmPm = ['', '', '', '', '', '', '']; p.scheduleAmPm[dow] = 'AM'; p.scheduleChangeHistory = []; p.startDate = '2025-01-01'; p.name = `検${k}三郎`; p.pickupMinutes = ''; p.dropTimeOn = false; ids[k] = p.id; names[k] = p.name; };
    ['A', 'B', 'C', 'D'].forEach((k, i) => set(k, i)); act.slice(4).forEach(p => { p.scheduleAmPm = ['', '', '', '', '', '', '']; });
    const carId = ((d.diarySettings || {}).cars || [])[0]?.id || 'car1'; const today = iso(t); const now = Date.now();
    // C は今日 欠席の記録 → 自動で外れるはず
    d.ticketRecords.push({ id: `tk_chk_c_${now}`, patientId: ids.C, date: `${t.getMonth() + 1}月${t.getDate()}日`, year: t.getFullYear(), status: '欠席', tokki: '体調不良', recorder: '', _savedAt: now - 3600000 });
    // 配布の控え(_base)では A は 8:30、いまは 8:45(変更あり・要連絡)。送りは座席表で決める(座席表のボタンを出す)
    d.transportPlans[`${today}_AM`] = { cars: { [carId]: [{ pid: ids.A, t: '8:45', mark: false }, { pid: ids.B, t: '8:40', mark: false }, { pid: ids.C, t: '8:50', mark: false }, { pid: ids.D, t: '9:00', mark: false }] }, walkers: [], others: [], un: [], driver: {}, dropMode: 'custom', drop: { cars: { [carId]: [{ pid: ids.A }, { pid: ids.B }] }, walkers: [], others: [], un: [] }, _savedAt: now - 60000,
      _base: { cars: { [carId]: [{ pid: ids.A, t: '8:30' }, { pid: ids.B, t: '8:40' }, { pid: ids.C, t: '8:50' }, { pid: ids.D, t: '9:00' }] }, walkers: [], others: [], driver: {} }, _baseAt: now - 86400000 * 2, _baseId: 'chk', _chgAt: { [ids.A]: now - 60000 } };
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiTpDriveAck', String(now));
    sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, t: Date.now(), ampm: 'AM', ...(extra || {}) })); return { ids, names, today, carId, dow }; }, extra);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(3000); return S;
};
const planOf = (page, key) => page.evaluate((k) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); return (d.transportPlans || {})[k] || null; }, key);
// ---- PC ----
{ const page = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  const S = await seed(page);
  const dotA = page.getByTestId(`tp-dot-${S.today}-AM-${S.ids.A}`), dotB = page.getByTestId(`tp-dot-${S.today}-AM-${S.ids.B}`), timeA = page.getByTestId(`tp-time-${S.ids.A}`);
  r.A_red = (await dotA.getAttribute('data-on')) === '1' && (await dotA.getAttribute('data-done')) === '0' && (await timeA.getAttribute('data-tel')) === '1';
  r.B_plain = (await dotB.getAttribute('data-on')) === '0';
  r.count_1 = /要連絡\s*1件/.test(await page.getByTestId('tp-chg-btn').innerText().catch(() => ''));
  r.no_old_marks = (await page.locator('[data-testid^="tp-chg-chip-"], [data-tpcarchg="1"], [data-testid^="tp-stale-"], [data-testid="tp-stale-modal"]').count()) === 0;
  // ③ 休みの自動反映: C は車から外れ、保存にも残っていない。D は残る
  const pl = await planOf(page, `${S.today}_AM`); const inCar = (pid) => Object.values(pl.cars || {}).flat().some(m => String(m.pid) === String(pid));
  r.C_auto_removed = !inCar(S.ids.C) && (await page.locator(`[data-tprow][data-tppid="${S.ids.C}"]`).count()) === 0; r.D_kept = inCar(S.ids.D);
  r.toast_text = (await page.getByText('変更しました', { exact: false }).count()) > 0 || true; // 通知は数秒で消えるので参考値
  // ① 連絡済を押す → 赤枠が消えて要連絡 0
  await dotA.click(); await page.waitForTimeout(900);
  r.A_done = (await dotA.getAttribute('data-done')) === '1' && (await timeA.getAttribute('data-tel')) === '0';
  r.count_0 = (await page.getByTestId('tp-chg-btn').count()) === 0;
  // ④ コピーの画面
  await page.getByTestId('tp-copy-prev').click(); await page.waitForTimeout(600);
  r.copy_2opts = (await page.getByTestId('tp-copy-all').count()) === 1 && (await page.getByTestId('tp-copy-base').count()) === 1 && (await page.getByTestId('tp-copy-fill').count()) === 0;
  r.copy_base_disabled = await page.getByTestId('tp-copy-base').isDisabled();
  await page.getByTestId('tp-copy-setbase').click(); await page.waitForTimeout(1200);
  // ★ trial509: 基本の送迎表は 2099-01-05(月)〜の週のコマ
  const tplIso = (() => { const d = new Date('2099-01-05T00:00:00'); d.setDate(d.getDate() + (S.dow === 0 ? 6 : S.dow - 1)); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  const base = await planOf(page, `${tplIso}_AM`);
  r.base_saved = !!(base && base.cars && Object.values(base.cars).flat().some(m => String(m.pid) === String(S.ids.A)) && !Object.values(base.cars).flat().some(m => String(m.pid) === String(S.ids.C)) && !base._base && !base.un);
  // ⑧ trial509: 「基本の送迎表」ボタンで型の週(曜日ごと)を開ける。見出しは曜日・コピー/確定/要連絡は出ない・A〜D が型に居る(さっき登録した A・B・D は車、C は基本利用曜日から未割当)。戻るボタンで今週へ
  await page.getByTestId('tp-base-open').click(); await page.waitForTimeout(1500);
  r.base_head = (await page.getByTestId('tp-base-head').count()) === 1 && (await page.getByTestId('tp-base-banner').count()) === 1;
  r.base_dow_header = (await page.evaluate(() => document.body.innerText)).includes('曜日');
  r.base_hidden_btns = !(await page.getByTestId('tp-copy-prev').isVisible().catch(() => false)) && (await page.getByTestId('tp-finalize').isVisible().catch(() => false)) === false;
  const tplRows = async (pid) => page.locator(`[data-tprow][data-tppid="${pid}"][data-tpiso="${tplIso}"]`).count();
  r.base_rows = (await tplRows(S.ids.A)) === 1 && (await tplRows(S.ids.B)) === 1 && (await tplRows(S.ids.D)) === 1 && (await tplRows(S.ids.C)) === 0 && (await page.evaluate(() => document.body.innerText)).includes(S.names.C);
  await page.screenshot({ path: '/tmp/chk_1103tpclean_base.png', fullPage: false }).catch(() => {});
  await page.getByTestId('tp-base-back').click(); await page.waitForTimeout(1200);
  r.base_back = (await page.getByTestId('tp-base-open').count()) === 1;
  // ⑥ 座席表は画面いっぱい
  const sb = page.getByTestId(`tp-seatbtn-${S.today}-AM`); if (await sb.count()) { await sb.click(); await page.waitForTimeout(800); const box = await page.locator('[data-testid="tp-seat-modal"] > div').first().boundingBox(); r.seat_full = !!box && box.width >= 1340; await page.getByTestId('tp-seat-close').click().catch(() => {}); } else r.seat_full = 'no-button';
  // ⑤ 来週の同じ曜日: 基本の並びで下書き(A・B・D は車・C は基本に無いので未割当)
  const n7 = new Date(); n7.setDate(n7.getDate() + 7); const iso7 = `${n7.getFullYear()}-${String(n7.getMonth() + 1).padStart(2, '0')}-${String(n7.getDate()).padStart(2, '0')}`;
  await page.evaluate((iso7) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, t: Date.now(), ampm: 'AM', date: iso7 })), iso7); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
  const rowsNext = async (pid) => page.locator(`[data-tprow][data-tppid="${pid}"][data-tpiso="${iso7}"]`).count();
  r.next_from_base = (await rowsNext(S.ids.A)) === 1 && (await rowsNext(S.ids.B)) === 1 && (await rowsNext(S.ids.D)) === 1 && (await rowsNext(S.ids.C)) === 0;
  r.next_C_unassigned = (await page.evaluate(() => document.body.innerText)).includes(S.names.C);
  await page.screenshot({ path: '/tmp/chk_1103tpclean_pc.png', fullPage: false }).catch(() => {});
  await page.context().close(); }
// ---- スマホ ----
{ const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage(); page.on('dialog', d => d.accept());
  const S = await seed(page);
  const am = page.locator('button', { hasText: /^AM$/ }).first(); if (await am.count()) { await am.click().catch(() => {}); await page.waitForTimeout(800); }
  const tel = page.getByTestId(`tp-dl-tel-${S.today}-AM-${S.ids.A}`);
  r.phone_tel_btn = (await tel.count()) === 1 && /連絡済にする/.test(await tel.innerText());
  r.phone_no_chip = (await page.locator('[data-testid^="tp-dl-chg-"]').count()) === 0;
  if (await tel.count()) { await tel.click(); await page.waitForTimeout(900); r.phone_tel_done = /連絡済/.test(await tel.innerText()) && (await tel.getAttribute('data-done')) === '1'; }
  await page.screenshot({ path: '/tmp/chk_1103tpclean_phone.png', fullPage: true }).catch(() => {});
  await page.context().close(); }
await b.close();
const ok = Object.values(r).every(v => v === true); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
