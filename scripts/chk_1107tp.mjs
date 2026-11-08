// 2026-11-07 trial529: 送迎表のダウンロード
//   ① 時間が変わった方の赤枠は、「連絡済」にチェックした方には付けない(付いていない方には付ける)
//   ② 利用者連絡先一覧は、その週に休みでも 利用中・休止中の方を全員(退所済みは出さない)
//   ③ 連絡先一覧の電話は 携帯と固定の両方
//   実行: node scripts/chk_1107tp.mjs [port]
import { chromium } from 'playwright';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
const b = await chromium.launch(); const r = {};
const page = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
const S = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const t = new Date(); if (t.getDay() === 0) t.setDate(t.getDate() + 1); /* 日曜は運行表の週(月〜土)に入らないので翌日で */ const dow = t.getDay(); const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  d.systemSettings = d.systemSettings || {}; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [] }; delete d.systemSettings.transportEnabled; d.holidays = []; d.transportPlans = {}; d.monthlyShifts = {};
  const act = d.patients.filter(p => p.status === '利用中' && !p.endDate); const ids = {}, names = {};
  const set = (k, i, sl) => { const p = act[i]; p.pauseHistory = []; p.scheduleAmPm = ['', '', '', '', '', '', '']; if (sl) p.scheduleAmPm[dow] = sl; p.scheduleChangeHistory = []; p.startDate = '2025-01-01'; p.name = `検${k}四郎`; p.kana = `けん${k}`; p.pickupCallTo = ''; ids[k] = p.id; names[k] = p.name; return p; };
  set('A', 0, 'AM').phoneMobile = '090-1111-2222'; act[0].phone = '03-3333-4444';
  set('B', 1, 'AM');
  const E = set('E', 2, ''); E.status = '休止'; E.pauseHistory = [{ fromDate: '2026-10-01', toDate: '', reason: '入院' }]; // 休止中・今週の送迎表にいない
  set('F', 3, ''); // 利用中・今週はいない(休み)
  const G = set('G', 4, ''); G.endDate = '2026-10-01'; // 退所済み
  act.slice(5).forEach(p => { p.scheduleAmPm = ['', '', '', '', '', '', '']; });
  const carId = ((d.diarySettings || {}).cars || [])[0]?.id || 'car1'; const today = iso(t); const now = Date.now();
  d.transportPlans[`${today}_AM`] = { cars: { [carId]: [{ pid: ids.A, t: '8:45', mark: false }, { pid: ids.B, t: '8:50', mark: false }] }, walkers: [], others: [], un: [], driver: {}, _savedAt: now - 60000,
    _base: { cars: { [carId]: [{ pid: ids.A, t: '8:30' }, { pid: ids.B, t: '8:40' }] }, walkers: [], others: [], driver: {} }, _baseAt: now - 86400000 * 2, _baseId: 'chk',
    _chgAt: { [ids.A]: now - 60000, [ids.B]: now - 60000 }, _telDone: { [ids.A]: { ck: String(now - 60000), on: true, t: now } } };
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiTpDriveAck', String(now));
  sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, date: today, t: Date.now(), ampm: 'AM' })); return { ids, names, today }; });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
const cap = async (content) => { await page.evaluate(() => { window.__ph = ''; window.addEventListener('setPrintHtml', e => { window.__ph = (e.detail && e.detail.html) || ''; }, { once: true }); });
  await page.locator('button:visible', { hasText: /^ダウンロード$/ }).first().click(); await page.waitForTimeout(400);
  if (content) { await page.locator('button:visible, label:visible', { hasText: content }).first().click(); await page.waitForTimeout(200); }
  await page.locator('button:visible', { hasText: /^ダウンロード$/ }).last().click(); await page.waitForTimeout(1500);
  const ph = await page.evaluate(() => window.__ph); await page.keyboard.press('Escape').catch(() => {}); await page.locator('button:visible', { hasText: /^(閉じる|×|✕)$/ }).last().click().catch(() => {}); await page.waitForTimeout(400); return ph; };
const rowOf = (html, name) => { const i = html.indexOf(name); if (i < 0) return ''; const s = html.lastIndexOf('<tr', i), e = html.indexOf('</tr>', i); return html.slice(s, e); };
const w = await cap(/^運行表のみ$/);
r.sheetHasBoth = w.includes(S.names.A) && w.includes(S.names.B);
r.doneNoRed = !!rowOf(w, S.names.A) && !/outline:2px solid #c82c35/.test(rowOf(w, S.names.A));
r.notDoneRed = /outline:2px solid #c82c35/.test(rowOf(w, S.names.B));
if (!r.doneNoRed || !r.notDoneRed) console.log('ROW A', rowOf(w, S.names.A).slice(0, 300), '\nROW B', rowOf(w, S.names.B).slice(0, 300));
const c = await cap(/^利用者連絡先一覧のみ$/);
r.listPaused = c.includes(S.names.E); r.listAbsentWeek = c.includes(S.names.F); r.listNoRetired = !c.includes(S.names.G);
r.bothPhones = c.includes('090-1111-2222') && c.includes('03-3333-4444');
console.log(r); const ok = Object.values(r).every(Boolean); console.log(ok ? 'PASS' : 'FAIL'); await b.close(); process.exit(ok ? 0 : 1);
