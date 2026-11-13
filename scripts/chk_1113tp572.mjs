// 2026-11-13 trial572 送迎表: ①基本の送迎表→利用者マスタは「反映」ボタン(確認→全員分)・時間を打っただけでは反映しない
//   ②基本の送迎表は休止中の方も残す(「休止中」の印・休みの欄に出さない)。ふつうの週は従来どおり休止の方は出ない
//   ③長押しドラッグ: 指を動かしても画面全体を描き直さない(落とす先が変わったときだけ)・離したらすぐ反映
//   実行: node chk/chk_1113tp572.mjs [port]   (見本データ VITE_E2E_DEMO=1 のビルド)
import { chromium } from 'playwright';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
const b = await chromium.launch();
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const now = new Date(); const dow = now.getDay(); const today = iso(now);
const yest = (() => { const d = new Date(now); d.setDate(d.getDate() - 1); return iso(d); })();
const tplIso = (() => { const x = new Date('2099-01-05T00:00:00'); x.setDate(x.getDate() + (dow === 0 ? 6 : dow - 1)); return iso(x); })();
const dialogs = [];
async function start(viewport, date, n = 4) {
  const ctx = await b.newContext({ viewport, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage();
  page.on('dialog', d => { dialogs.push(d.message()); d.accept(); }); page.on('pageerror', e => { console.log('PAGEERROR', e.message.slice(0, 200)); fails++; });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
  const ids = await page.evaluate(([dow, tplIso, today, yest, date, n]) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.systemSettings = d.systemSettings || {}; d.holidays = []; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [0] }; d.systemSettings.tpBaseReflect = { pickup: true, drop: true };
    d.ticketRecords = (d.ticketRecords || []).filter(x => !(x && x.year === new Date().getFullYear() && String(x.date) === `${new Date().getMonth() + 1}月${new Date().getDate()}日`)); d.monthlyShifts = {};
    const all = (d.patients || []).filter(p => p.status === '利用中' && !p.endDate); const ps = all.slice(0, n); all.slice(n).forEach(p => { p.scheduleAmPm = ['', '', '', '', '', '', '']; });
    d.diarySettings = d.diarySettings || {}; d.diarySettings.cars = [{ id: 'car1', name: '1号車', type: '' }, { id: 'car2', name: '2号車', type: '' }]; d.transportPlans = {};
    ps.forEach((p, i) => { p.pauseHistory = []; p.scheduleChangeHistory = []; p.startDate = '2025-01-01'; p.scheduleAmPm = ['', '', '', '', '', '', '']; p.scheduleAmPm[dow] = 'AM'; p.pickupMinutes = 2; p.pickupType = 'fixed'; p.pickupTimes = ['', '', '', '', '', '', '']; p.pickupTimes[dow] = '08:30'; p.dropTimeOn = false; p.dropTimes = ['', '', '', '', '', '', '']; p.status = '利用中'; });
    // 2人目は休止中(終了日なし)
    ps[1].status = '休止'; ps[1].pauseHistory = [{ fromDate: yest, toDate: '', reason: '入院' }];
    const mk = () => ps.map((p, i) => ({ pid: p.id, t: `8:${String(30 + i).padStart(2, '0')}`, mark: false }));
    d.transportPlans[`${tplIso}_AM`] = { cars: { car1: mk() }, walkers: [], others: [], un: [], memo: '', driver: {}, dropAt: { [String(ps[0].id)]: '12:30' }, _savedAt: Date.now() - 86400000 };
    d.transportPlans[`${today}_AM`] = { cars: { car1: mk().filter((m, i) => i !== 1) }, walkers: [], others: [], un: [], memo: '', driver: {}, _savedAt: Date.now() - 86400000 };
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); localStorage.setItem('tsumugiTpDriveAck', String(Date.now()));
    sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, date, t: Date.now(), ampm: 'AM' })); return ps.map(p => p.id); }, [dow, tplIso, today, yest, date, n]);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
  return { page, ids }; }
const pat = (page, pid) => page.evaluate((pid) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const p = (d.patients || []).find(x => x.id === pid); return p ? { pickupTimes: p.pickupTimes, pickupType: p.pickupType, dropTimeOn: p.dropTimeOn, dropTimes: p.dropTimes } : null; }, pid);
const plan = (page, key) => page.evaluate((k) => (JSON.parse(localStorage.getItem('daycareAppData_v3')).transportPlans || {})[k] || null, key);
const typeTime = async (page, isoK, pid, v) => { const inp = page.locator(`[data-tprow][data-tppid="${pid}"][data-tpiso="${isoK}"] input`).first(); await inp.click(); await inp.fill(''); await inp.type(v, { delay: 20 }); await inp.press('Enter'); await page.waitForTimeout(600); };
// ---- ① 基本の送迎表 → 利用者マスタ は「反映」ボタン ----
{ const { page, ids } = await start({ width: 1366, height: 900 }, '2099-01-05');
  ok((await page.getByTestId('tp-base-head').count()) === 1 && (await page.getByTestId('tp-base-banner').count()) === 0, '基本の送迎表を開いた(説明の帯は無い・trial573)');
  ok((await page.getByTestId('tp-base-reflect-btn').count()) === 1, '上の段に「利用者マスタへ反映」ボタン(trial572/573)');
  await page.getByTestId('tp-more').click(); await page.waitForTimeout(300);
  ok((await page.getByTestId('tp-base-reflect-pickup').count()) === 1 && await page.getByTestId('tp-base-reflect-pickup').isChecked(), '「その他」の中に反映する項目(お迎え時間・既定は入)');
  await page.mouse.click(5, 5); await page.waitForTimeout(300); ok((await page.getByTestId('tp-more-menu').count()) === 0, 'その他を閉じた');
  await typeTime(page, tplIso, ids[0], '8:50');
  let p0 = await pat(page, ids[0]); let pl = await plan(page, `${tplIso}_AM`);
  ok(pl && Object.values(pl.cars).flat().find(m => m.pid === ids[0]).t === '8:50', 'コマに 8:50 が入る');
  ok(p0 && p0.pickupTimes[dow] === '08:30', `時間を打っただけではマスタは変わらない(${p0 && p0.pickupTimes[dow]})(自動反映はやめた)`);
  dialogs.length = 0; await page.getByTestId('tp-base-reflect-btn').click(); await page.waitForTimeout(900);
  ok(dialogs.length === 1 && /反映します/.test(dialogs[0]) && /4名/.test(dialogs[0]), `押すと「反映しますか」の確認(${(dialogs[0] || '').replace(/\n/g, ' ').slice(0, 80)})`);
  p0 = await pat(page, ids[0]); const p2 = await pat(page, ids[2]); const p3 = await pat(page, ids[3]);
  ok(p0 && p0.pickupTimes[dow] === '08:50', `反映 → 1人目のマスタのお迎え 08:50 (${p0 && p0.pickupTimes[dow]})`);
  ok(p2 && p2.pickupTimes[dow] === '08:32' && p3 && p3.pickupTimes[dow] === '08:33', `打っていない方も基本の送迎表の時間がマスタへ(${p2 && p2.pickupTimes[dow]} / ${p3 && p3.pickupTimes[dow]})`);
  ok(p0 && p0.dropTimeOn === true && p0.dropTimes[dow] === '12:30', `送りの時間 12:30 もマスタへ(基本の送り時間も設定する=入)(${JSON.stringify(p0 && [p0.dropTimeOn, p0.dropTimes[dow]])})`);
  ok(await page.getByText('利用者マスタに反映しました', { exact: false }).count() >= 1, '「反映しました」の知らせ');
  // 変わるものが無ければ確認を出さない
  dialogs.length = 0; await page.getByTestId('tp-base-reflect-btn').click(); await page.waitForTimeout(600);
  ok(dialogs.length === 0 && (await page.getByText('反映する時間はありません', { exact: false }).count()) >= 1, '同じ時間なら確認を出さず「反映する時間はありません」');
  // お迎えのチェックを外すと、お迎えは反映しない
  await page.getByTestId('tp-more').click(); await page.waitForTimeout(300); await page.getByTestId('tp-base-reflect-pickup').click(); await page.waitForTimeout(600); await page.mouse.click(5, 5); await page.waitForTimeout(300);
  await typeTime(page, tplIso, ids[2], '9:10'); dialogs.length = 0; await page.getByTestId('tp-base-reflect-btn').click(); await page.waitForTimeout(700);
  const p2b = await pat(page, ids[2]);
  ok(p2b && p2b.pickupTimes[dow] === '08:32', `お迎えのチェックを外すと 9:10 を入れて反映してもマスタは 08:32 のまま(${p2b && p2b.pickupTimes[dow]})`);
  // ---- ② 休止中の方は基本の送迎表に残る ----
  const pausedRow = page.locator(`[data-tprow][data-tppid="${ids[1]}"][data-tpiso="${tplIso}"]`);
  ok((await pausedRow.count()) >= 1, '休止中の方が基本の送迎表の車に残っている(trial572)');
  ok((await page.getByTestId('tp-paused-tag').count()) >= 1, '名前に「休止中」の印');
  const absText = await page.evaluate(() => document.body.innerText);
  ok(!/休み・休止になった方/.test(absText), '基本の送迎表に「休み・休止になった方」の知らせが出ない');
  await page.close();
}
// ---- ②' ふつうの週では休止の方は出ない(従来どおり) ----
{ const { page, ids } = await start({ width: 1366, height: 900 }, today);
  ok((await page.locator(`[data-tprow][data-tppid="${ids[1]}"][data-tpiso="${today}"]`).count()) === 0, 'ふつうの週では休止中の方は車に出ない');
  ok((await page.getByTestId('tp-paused-tag').count()) === 0, 'ふつうの週に「休止中」の印は出ない');
  // ---- ③ ドラッグ: 動かしている間に描き直さない・離したらすぐ反映 ----
  const r0 = page.locator(`[data-tprow][data-tppid="${ids[0]}"][data-tpiso="${today}"]`).first(); const bb = await r0.boundingBox();
  const carHead = page.locator(`[data-tprow][data-tpiso="${today}"][data-tpcid="car1"]`).first();
  await page.evaluate(() => { window.__rc = 0; const el = document.querySelector('[data-tprow]'); const root = el && el.closest('table, .tsu-tp-grid, main') || document.body; new MutationObserver(ms => { window.__rc += ms.length; }).observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] }); });
  await page.mouse.move(bb.x + 60, bb.y + bb.height / 2); await page.mouse.down(); await page.waitForTimeout(350);
  await page.mouse.move(bb.x + 70, bb.y + bb.height / 2 + 6, { steps: 3 }); await page.waitForTimeout(100);
  ok((await page.locator('body.tsumugi-dragging').count()) === 1, '長押しでドラッグが始まる');
  const g0 = await page.evaluate(() => { const g = [...document.querySelectorAll('div')].find(d => d.style && d.style.zIndex === '100002'); return g ? g.style.transform : ''; });
  const c0 = await page.evaluate(() => window.__rc);
  for (let i = 0; i < 20; i++) { await page.mouse.move(bb.x + 70 + i * 2, bb.y + bb.height / 2 + 6 + (i % 3), { steps: 1 }); await page.waitForTimeout(16); }
  const c1 = await page.evaluate(() => window.__rc);
  const g1 = await page.evaluate(() => { const g = [...document.querySelectorAll('div')].find(d => d.style && d.style.zIndex === '100002'); return g ? g.style.transform : ''; });
  ok(g0 && g1 && g0 !== g1, `札は指について動く (${g0} → ${g1})`);
  ok(c1 - c0 < 60, `同じ場所の中で動かしても表はほとんど描き直さない(変化 ${c1 - c0} 件)`);
  // 2号車の見出し(=2号車の行が無いので、2号車のコマの空き)へ落とす: 2号車のドロップ先を探す
  const car2 = page.locator(`[data-tpdrop="car2"][data-tpiso="${today}"]`).first();
  let tb = (await car2.count()) ? await car2.boundingBox() : null;
  if (tb) {
    await page.mouse.move(tb.x + Math.min(40, tb.width / 2), tb.y + tb.height / 2, { steps: 10 }); await page.waitForTimeout(200);
    const t0 = Date.now(); await page.mouse.up();
    const moved = await page.waitForFunction(([pid, iso]) => { const el = document.querySelector(`[data-tprow][data-tppid="${pid}"][data-tpiso="${iso}"]`); return el && el.getAttribute('data-tpcid') === 'car2'; }, [ids[0], today], { timeout: 15000 }).then(() => true).catch(() => false);
    ok(moved, `離すと2号車へ移る(${Date.now() - t0}ms)`);
    ok(Date.now() - t0 < 3000, '離してから反映まで3秒以内');
  } else { await page.mouse.up(); console.log('SKIP 2号車の落とし先が見つからない'); }
  await page.close();
}
await b.close();
console.log(fails ? `FAIL ${fails}` : 'ALL PASS'); process.exit(fails ? 1 : 0);
