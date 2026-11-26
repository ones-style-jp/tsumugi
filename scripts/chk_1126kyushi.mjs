// 2026-11-26 1126d: 分析(個人)の休止一覧。休止の履歴の期間ごとに1行・日付は横に並べる・理由は履歴から(初日の記録に特記が無くても理由が出る)・履歴に無い休止は近い日をまとめる
//   使い方: node chk/chk_1126kyushi.mjs 4175
import { chromium } from 'playwright';
const PORT = process.argv[2] || '4175'; const BASE = `http://localhost:${PORT}`;
const b = await chromium.launch(); const R = []; const ok = (n, c, d) => { R.push([n, !!c]); console.log((c ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? ' ' + JSON.stringify(d) : '')); };
const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const seed = await page.evaluate(() => {
  // 分析(個人)は基本利用日でない日・先の日の記録を出さない。11/1 以降は休止の期間の外の「休止」は出席に戻る(healStalePauseRecords)ので、
  //   期間つきの休止=今月のきょうまでの基本利用日、履歴に無い休止=2026年10月の基本利用日に置く
  const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const t = new Date(); const Y = t.getFullYear(), M = t.getMonth() + 1; const mm = String(M).padStart(2, '0');
  const isB = (v) => v === 'AM' || v === 'PM' || v === '1日';
  const A = [...d.patients].filter(p => p.status === '利用中' && Array.isArray(p.scheduleAmPm)).sort((x, y) => y.scheduleAmPm.filter(isB).length - x.scheduleAmPm.filter(isB).length)[0];
  const pick = (y, m, lim) => { const r = []; for (let dd = 1; dd <= lim; dd++) if (isB(A.scheduleAmPm[new Date(y, m - 1, dd).getDay()])) r.push(dd); return r; };
  const bd = pick(Y, M, t.getDate()); const bo = pick(2026, 10, 31);
  if (bd.length < 5 || bo.length < 2) return { err: 'base days', bd, bo };
  const DN = '日月火水木金土';
  const rec = (y, m, dd, status, extra) => ({ id: `tr_${A.id}_${y}_${m}_${dd}`, patientId: A.id, name: A.name, kana: A.kana, date: `${m}月${dd}日`, year: y, dayOfWeek: DN[new Date(y, m - 1, dd).getDay()], status, exercises: {}, tokki: '', ...(extra || {}) });
  const iso = (dd) => `${Y}-${mm}-${String(dd).padStart(2, '0')}`;
  d.ticketRecords = (d.ticketRecords || []).filter(r => r.patientId !== A.id);
  d.ticketRecords.push(rec(Y, M, bd[0], '休止'), rec(Y, M, bd[1], '休止', { tokki: `旅行（${Y}/${mm}/${String(bd[0]).padStart(2, '0')}〜）` }), rec(Y, M, bd[2], '休止'), rec(Y, M, bd[3], '休止'), rec(Y, M, bd[4], '出席', { temp_AM: '36.5' }),
    rec(2026, 10, bo[0], '休止'), rec(2026, 10, bo[1], '休止'));
  d.patients = d.patients.map(p => p.id === A.id ? { ...p, pauseHistory: [{ reason: '旅行', fromDate: iso(bd[0]), toDate: iso(bd[3]) }] } : p);
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0');
  sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'dash_personal', pid: A.id, t: Date.now() }));
  return { M, pid: A.id, bd, bo };
});
console.log('seed', JSON.stringify(seed)); if (seed.err) { console.log('FAIL seed'); await b.close(); process.exit(1); }
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
// 期間を「全期間」にできれば全期間に
await page.locator('select.tsu-period-sel:visible').first().selectOption('12').catch(async () => { await page.locator('.tsu-period-tabs button', { hasText: '1年' }).first().click().catch(() => {}); }); await page.waitForTimeout(800);
if (!(await page.locator('[data-testid="kyushi-group"]').count())) { await page.locator('#sec-kyushi').click().catch(() => {}); await page.waitForTimeout(500); }
const groups = await page.locator('[data-testid="kyushi-group"]').evaluateAll(els => els.map(e => ({ period: e.querySelector('[data-testid="kyushi-period"]')?.innerText, reason: e.querySelector('[data-testid="kyushi-reason"]')?.innerText, dates: [...e.querySelectorAll('[data-testid="kyushi-dates"] > span')].map(s => s.innerText), datesRow: (() => { const sp = [...e.querySelectorAll('[data-testid="kyushi-dates"] > span')]; return sp.length > 1 ? Math.abs(sp[0].getBoundingClientRect().top - sp[1].getBoundingClientRect().top) < 4 : true; })() })));
console.log('groups', JSON.stringify(groups));
const M = seed.M; const g1 = groups.find(g => g.reason === '旅行') || {}, g2 = groups.find(g => g.reason !== '旅行') || {}; const bo = seed.bo;
ok('1 休止の記録 6 件が 2 つのまとまりになる', groups.length === 2, groups.length);
const bd = seed.bd;
ok('2 休止の履歴の期間が見出し', g1.period === `${M}月${bd[0]}日〜${M}月${bd[3]}日`, g1.period);
ok('3 理由は履歴から(初日の記録に特記が無くても「旅行」)', g1.reason === '旅行', g1.reason);
ok('4 その期間の日付 4 日が横に並ぶ', (g1.dates || []).length === 4 && g1.datesRow && g1.dates[0].startsWith(`${M}月${bd[0]}日`) && g1.dates[3].startsWith(`${M}月${bd[3]}日`), g1.dates);
ok('5 履歴に無い休止(続く2日)は近い日をまとめ、理由は「理由の記載なし」', g2.period === `10月${bo[0]}日〜10月${bo[1]}日` && g2.reason === '理由の記載なし' && (g2.dates || []).length === 2, g2);
await page.screenshot({ path: process.env.SHOT || '/dev/null', fullPage: false }).catch(() => {});
await b.close();
const bad = R.filter(x => !x[1]); console.log(bad.length ? `FAIL ${bad.length}: ${bad.map(x => x[0]).join(' / ')}` : 'ALL PASS'); process.exit(bad.length ? 1 : 0);
