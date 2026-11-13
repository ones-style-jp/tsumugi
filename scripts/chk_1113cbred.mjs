// 2026-11-13 1113b: 送迎表の赤枠は「連絡帳で渡した時間(cbIssued)」を基準にする。配布の控え(_base)が無くても、渡した時間と今の時間が違えば赤枠・連絡済で消える・戻せば消える
//   node chk/chk_1113cbred.mjs [port]   (見本データ VITE_E2E_DEMO=1 のビルド)
import { chromium } from 'playwright';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const now = new Date(); const today = iso(now);
// 2日後(日曜なら3日後)を送迎日に
const tgt = new Date(now); tgt.setDate(tgt.getDate() + 2); if (tgt.getDay() === 0) tgt.setDate(tgt.getDate() + 1); const tIso = iso(tgt); const tDow = tgt.getDay();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage();
page.on('dialog', d => d.accept()); page.on('pageerror', e => { console.log('PAGEERROR', e.message.slice(0, 200)); fails++; });
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
const ids = await page.evaluate(([tIso, tDow, today]) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.systemSettings = d.systemSettings || {}; d.holidays = []; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [0] }; d.monthlyShifts = {};
  const all = (d.patients || []).filter(p => p.status === '利用中' && !p.endDate); const ps = all.slice(0, 3); all.slice(3).forEach(p => { p.scheduleAmPm = ['', '', '', '', '', '', '']; });
  d.diarySettings = d.diarySettings || {}; d.diarySettings.cars = [{ id: 'car1', name: '1号車', type: '' }, { id: 'car2', name: '2号車', type: '' }];
  ps.forEach(p => { p.pauseHistory = []; p.scheduleChangeHistory = []; p.startDate = '2025-01-01'; p.scheduleAmPm = ['', '', '', '', '', '', '']; p.scheduleAmPm[tDow] = 'AM'; p.pickupType = 'fixed'; p.pickupTimes = ['', '', '', '', '', '', '']; p.pickupTimes[tDow] = '13:05'; p.pickupMinutes = 2; });
  // 送迎表: 配布の控え(_base)は無し。A は 13:15 に変えてある・B は 13:05 のまま・C は渡していない(連絡帳の控えなし)で 13:20
  d.transportPlans = { [`${tIso}_AM`]: { cars: { car1: [{ pid: ps[0].id, t: '13:15', mark: false }, { pid: ps[1].id, t: '13:05', mark: false }, { pid: ps[2].id, t: '13:20', mark: false }] }, walkers: [], others: [], un: [], memo: '', driver: {}, _savedAt: Date.now() - 3600000 } };
  // 連絡帳の控え: A と B に「次回 M月D日 13時05分」を渡した記録(今日の記録に cbIssued)
  const [y, m, dd] = tIso.split('-').map(Number); const dDisp = `${m}月${dd}日`; const [, tm, td] = today.split('-').map(Number);
  d.ticketRecords = (d.ticketRecords || []).filter(r => !(r && String(r.date) === `${tm}月${td}日`));
  [ps[0], ps[1]].forEach((p, i) => { d.ticketRecords.push({ id: `cbred_${i}_${Date.now()}`, patientId: p.id, date: `${tm}月${td}日`, year: y, status: '出席', cbIssued: JSON.stringify({ d: dDisp, t: '13時05分', drop: '', ra: '', rp: '', at: Date.now() - 1800000 }), _savedAt: Date.now() - 1800000 }); });
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); localStorage.setItem('tsumugiTpDriveAck', String(Date.now()));
  sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, date: tIso, t: Date.now(), ampm: 'AM' })); return ps.map(p => p.id); }, [tIso, tDow, today]);
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
const dot = (pid) => page.getByTestId(`tp-dot-${tIso}-AM-${pid}`);
const isOn = async (pid) => (await dot(pid).count()) === 1 && (await dot(pid).getAttribute('data-on')) === '1'; // 変更なしでも同じ testid の空の印が置かれるので data-on で見る
ok((await isOn(ids[0])) && (await dot(ids[0]).getAttribute('data-done')) === '0', 'A: 連絡帳で 13:05 を渡したあと 13:15 に変えた → 赤枠(要連絡)が付く(配布の控えが無くても)(1113b)');
ok(!(await isOn(ids[1])), 'B: 渡した 13:05 のまま → 赤枠なし');
ok(!(await isOn(ids[2])), 'C: 連絡帳を渡していない方(控えなし) → 従来どおり赤枠なし');
ok(await dot(ids[0]).getAttribute('title').then(t => /連絡帳 13:05→13:15/.test(t || '')), `赤枠の説明に「連絡帳 13:05→13:15」(${await dot(ids[0]).getAttribute('title')})`);
// 連絡済にすると消える(赤枠は消え、チェックは緑)
await dot(ids[0]).click(); await page.waitForTimeout(600);
ok((await dot(ids[0]).getAttribute('data-done')) === '1', 'A: 連絡済を押すと済みになる');
const inp = page.locator(`[data-tprow][data-tppid="${ids[0]}"][data-tpiso="${tIso}"] input`).first();
// 時間を 13:05 に戻すと要連絡そのものが消える
await inp.click(); await inp.fill(''); await inp.type('13:05', { delay: 20 }); await inp.press('Enter'); await page.waitForTimeout(700);
ok(!(await isOn(ids[0])), 'A: 渡した時間(13:05)に戻すと要連絡が消える');
// もう一度 13:30 に変えると、連絡済は新しい変更には付かず、また赤枠
await inp.click(); await inp.fill(''); await inp.type('13:30', { delay: 20 }); await inp.press('Enter'); await page.waitForTimeout(700);
ok((await isOn(ids[0])) && (await dot(ids[0]).getAttribute('data-done')) === '0', 'A: さらに 13:30 に変えると、また未連絡の赤枠になる');
// 保存された控え(_chgAt)に A が入る
const chg = await page.evaluate((k) => ((JSON.parse(localStorage.getItem('daycareAppData_v3')).transportPlans || {})[k] || {})._chgAt || {}, `${tIso}_AM`);
ok(!!chg[ids[0]] || !!chg[String(ids[0])], `変えた時刻が控えられる(_chgAt: ${JSON.stringify(Object.keys(chg))})`);
// 要連絡の件数
const bodyText = await page.evaluate(() => document.body.innerText);
ok(/要連絡\s*1/.test(bodyText), `上の件数に「要連絡 1件」(${(bodyText.match(/要連絡[^\n]{0,8}/) || [''])[0]})`);
await b.close();
console.log(fails ? `FAIL ${fails}` : 'ALL PASS'); process.exit(fails ? 1 : 0);
