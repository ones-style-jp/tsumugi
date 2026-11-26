// 2026-11-26 1126b→1126c: モニタリングの「予定○回のうち○回」。予定=その月の基本利用日の数(休業日を除く・休止/欠席/先の日も数える)・利用=出席+振替+臨時(内訳)・別の年や基本日でない空の記録は数えない・文がです・ます
//   使い方: node chk/chk_1126mon.mjs 4175
import { chromium } from 'playwright';
const PORT = process.argv[2] || '4175'; const BASE = `http://localhost:${PORT}`;
const b = await chromium.launch(); const R = []; const ok = (n, c, d) => { R.push([n, !!c]); console.log((c ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? ' ' + JSON.stringify(d) : '')); };
const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const seed = await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const t = new Date(); const Y = t.getFullYear(), M = t.getMonth() + 1, D = t.getDate(); const dim = new Date(Y, M, 0).getDate();
  const A = d.patients.find(p => p.status === '利用中' && Array.isArray(p.scheduleAmPm) && p.scheduleAmPm.some(v => v === 'AM' || v === 'PM' || v === '1日'));
  const baseDows = A.scheduleAmPm.map((v, i) => (v === 'AM' || v === 'PM' || v === '1日') ? i : -1).filter(i => i >= 0);
  const baseDays = [], nonBase = [], future = [];
  for (let dd = 1; dd <= dim; dd++) { const dow = new Date(Y, M - 1, dd).getDay(); const isB = baseDows.includes(dow); if (dd <= D) { (isB ? baseDays : nonBase).push(dd); } else if (isB) future.push(dd); }
  if (baseDays.length < 4) return { err: 'base days < 4', baseDays };
  const DN = '日月火水木金土'; const rec = (dd, status, extra, year) => ({ id: `tr_${A.id}_${year || Y}_${M}_${dd}`, patientId: A.id, name: A.name, kana: A.kana, date: `${M}月${dd}日`, year: year || Y, dayOfWeek: DN[new Date(year || Y, M - 1, dd).getDay()], status, exercises: {}, _savedAt: Date.now(), ...(extra || {}) });
  // 今月の記録は A の分だけにする(他の方は外す)
  d.ticketRecords = (d.ticketRecords || []).filter(r => { const m = String(r.date || '').match(/^(\d+)月/); const sameM = m && parseInt(m[1]) === M && (r.year == null || Number(r.year) === Y); return !sameM; });
  const recs = [rec(baseDays[0], '出席', { temp_AM: '36.4' }), rec(baseDays[1], '出席', { temp_AM: '36.5' }), rec(baseDays[2], '出席', { temp_AM: '36.6' }), rec(baseDays[3], '欠席', { tokki: '体調不良' })];
  if (baseDays[4]) recs.push(rec(baseDays[4], '休止'));
  if (nonBase[0]) recs.push(rec(nonBase[0], '出席'));           // 基本日でない日の空の出席(自動でできた記録)
  if (nonBase[1]) recs.push(rec(nonBase[1], '欠席', { tokki: '用事' })); // 基本日でない日の欠席
  if (future[0]) recs.push(rec(future[0], '欠席', { tokki: '通院予定' })); // 先の日に入れた欠席
  if (nonBase[2]) recs.push(rec(nonBase[2], '振替', { temp_AM: '36.3', furikaeAmpm: 'AM' })); // 振替で来た日
  const holDay = baseDays[7] || null; d.holidays = holDay ? [{ date: `${Y}-${String(M).padStart(2, '0')}-${String(holDay).padStart(2, '0')}`, name: '見本の休業日' }] : []; // 基本利用日の 1 日を施設休業日に(予定から外れる)
  d.systemSettings = d.systemSettings || {}; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [0] };
  if (baseDows.includes(0)) return { err: 'base on sunday' };
  recs.push(rec(baseDays[0], '出席', { temp_AM: '36.7' }, Y - 1)); // 去年の同じ月
  d.ticketRecords.push(...recs); localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0');
  sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'monitoring', pid: null, t: Date.now() }));
  return { A: A.name, baseDays, nonBase: nonBase.slice(0, 3), future, kyushi: !!baseDays[4], expPlanned: baseDays.length + future.length - (baseDays[7] ? 1 : 0), holiday: baseDays[7] || null, furi: !!nonBase[2] };
});
console.log('seed', JSON.stringify(seed)); if (seed.err) { console.log('FAIL seed'); await b.close(); process.exit(1); }
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
// 一覧は「未作成」のうちは文を出さない。「確定」を押すと既定の文(自動の文)で保存される
await page.locator('button:visible', { hasText: /^✓ 確定$/ }).first().click(); await page.waitForTimeout(2000);
const texts = await page.locator('.tsu-mon-text').allInnerTexts(); const s1 = texts[0] || '', s3 = texts[3] || '';
ok('1 確定すると①に自動の文(予定○回のうち○回)が入る', /予定\d+回のうち/.test(s1), s1.slice(0, 120));
const expRe = new RegExp(`予定${seed.expPlanned}回のうち${seed.furi ? 4 : 3}回ご利用いただきました（出席3回${seed.furi ? '・振替1回' : ''}）`);
ok('2 予定はその月の基本利用日の数(休業日は除く・休止・欠席・先の日は数える)・利用は 出席3+振替1(基本日でない空の出席・去年は数えない)', expRe.test(s1), { exp: String(expRe), got: s1.slice(0, 140) });
ok('3 文は です・ます(「行いました」「できました」)で硬い言い切りがない', /行いました/.test(s1) && /できました/.test(s1) && !/できた。|提供。/.test(s1));
ok('4 ④の文も です・ます', /見られませんでした|でした。/.test(s3), s3.slice(0, 80));
await b.close();
const bad = R.filter(x => !x[1]); console.log(bad.length ? `FAIL ${bad.length}: ${bad.map(x => x[0]).join(' / ')}` : 'ALL PASS'); process.exit(bad.length ? 1 : 0);
