// 2026-11-01(ユーザー了承・10/30 柴又店の続き) 休止中に保存された先の日の「休止」の記録(残骸)を、開いたときに出席へ戻す
//   見本で: A=休止が終わった方(終了日=おととい) / B=休止中の方(終了日=来月)
//   記録: A 来週(基本利用日・1時間前に保存・特記「休止（…〜）」) → 出席・特記なし ／ A きのう → 触らない ／ A 来週の予定なしの日 → 触らない ／ A 付けたばかり(今) → 触らない ／ B 来週 → 触らない
//   開き直すとお知らせ「✓ 休止が終わった方の先の記録を出席に戻しました（1件）」・_fieldTs.status が付く・日誌(来週)で A が休止に出ない
//   実行: node scripts/chk_1101stalerec.mjs [--port 4175]
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4175'; })();
const r = {};
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
const toasts = []; page.on('console', m => { const t = m.text(); if (/提供記録の修復/.test(t)) toasts.push(t); });
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const S = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const t = new Date();
  const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; const lab = (x) => `${x.getMonth() + 1}月${x.getDate()}日`;
  const add = (n) => { const x = new Date(t); x.setDate(x.getDate() + n); return x; };
  d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [] }; d.holidays = []; d.monthlyShifts = {};
  const act = d.patients.filter(p => p.status === '利用中' && !p.endDate); const A = act[0], B = act[1];
  const n7 = add(7), n8 = add(8), y1 = add(-1), y2 = add(-2), n30 = add(30);
  A.scheduleAmPm = ['', '', '', '', '', '', '']; A.scheduleAmPm[n7.getDay()] = 'AM'; A.scheduleChangeHistory = []; A.startDate = '2025-01-01';
  A.status = '利用中'; A.pauseHistory = [{ reason: '入院', fromDate: iso(add(-20)), toDate: iso(y2) }];
  B.scheduleAmPm = ['', '', '', '', '', '', '']; B.scheduleAmPm[n7.getDay()] = 'AM'; B.scheduleChangeHistory = []; B.startDate = '2025-01-01';
  B.status = '休止'; B.pauseHistory = [{ reason: '入院', fromDate: iso(add(-20)), toDate: iso(n30) }];
  const old = Date.now() - 3600 * 1000; const mk = (id, pid, x, extra) => ({ id, patientId: pid, date: lab(x), year: x.getFullYear(), status: '休止', tokki: '', recorder: '', _savedAt: old, ...(extra || {}) });
  d.ticketRecords = (d.ticketRecords || []).filter(x => !(x && String(x.id).startsWith('tr_chk_sr_')));
  d.ticketRecords.push(mk('tr_chk_sr_a', A.id, n7, { tokki: `休止（${iso(add(-20)).replace(/-/g, '/')}〜）` }), mk('tr_chk_sr_past', A.id, y1), mk('tr_chk_sr_nosched', A.id, n8), mk('tr_chk_sr_fresh', A.id, add(14), { _savedAt: Date.now() }), mk('tr_chk_sr_b', B.id, n7));
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0');
  sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'home', pid: null, t: Date.now() }));
  return { A: A.id, B: B.id, An: A.name, iso7: iso(n7) }; });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(3500);
const after = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const g = (id) => d.ticketRecords.find(x => x.id === id) || null; return { a: g('tr_chk_sr_a'), past: g('tr_chk_sr_past'), nosched: g('tr_chk_sr_nosched'), fresh: g('tr_chk_sr_fresh'), b: g('tr_chk_sr_b') }; });
console.log('A 来週', after.a && [after.a.status, after.a.tokki, !!(after.a._fieldTs && after.a._fieldTs.status)], 'きのう', after.past && after.past.status, '予定なし', after.nosched && after.nosched.status, '付けたばかり', after.fresh && after.fresh.status, 'B 来週', after.b && after.b.status, 'ログ', toasts.length);
r.healed = !!after.a && after.a.status === '出席' && after.a.tokki === '' && !!(after.a._fieldTs && after.a._fieldTs.status) && after.a._savedAt > Date.now() - 60000;
r.keepPast = after.past && after.past.status === '休止'; r.keepNoSched = after.nosched && after.nosched.status === '休止'; r.keepFresh = after.fresh && after.fresh.status === '休止'; r.keepPaused = after.b && after.b.status === '休止';
r.logged = toasts.length >= 1;
// 日誌(来週)で A が休止に出ない
await page.evaluate((iso) => { sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'diary', pid: null, t: Date.now(), date: iso })); }, S.iso7);
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
const dateInput = page.locator('input[type="date"]:visible').first(); if (await dateInput.count()) { await dateInput.fill(S.iso7); await page.waitForTimeout(1200); }
const body = await page.evaluate(() => document.body.innerText);
const lineA = body.split('\n').filter(l => l.includes(S.An)).join(' | ');
console.log('日誌の A の行', JSON.stringify(lineA.slice(0, 160)));
r.diary = !!lineA && !/休止/.test(lineA);
await b.close();
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
