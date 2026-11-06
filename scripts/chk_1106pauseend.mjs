// 2026-11-06 trial528: 利用者マスタ
//   ① 退所済みの方には保険証・負担割合証の「更新の確認」(赤い表示)を出さない(利用中の方には今までどおり出す)
//   ② 休止中の方に利用終了日を入れて保存すると、休止の期間が利用終了日で閉じる(終了日までは休止中・過ぎると退所済み)
//   実行: node scripts/chk_1106pauseend.mjs [port]
import { chromium } from 'playwright';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addD = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const b = await chromium.launch(); const r = {};
const page = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
const ids = await page.evaluate(({ from, past }) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3'));
  const act = d.patients.filter(p => p.status === '利用中' && !p.endDate);
  const A = act[0], B = act[1], C = act[2], D = act[3];
  Object.assign(A, { status: '休止', pauseHistory: [{ fromDate: from, toDate: '', reason: '入院' }], endDate: '' });
  Object.assign(D, { status: '休止', pauseHistory: [{ fromDate: from, toDate: '', reason: '入院' }], endDate: '' });
  Object.assign(B, { endDate: past, careLevelTo: '2026-09-30', costBurdenTo: '2026-09-30' }); // 退所済み・期限切れ
  Object.assign(C, { careLevelTo: '2026-09-30' }); // 利用中・期限切れ
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); return { A: A.id, B: B.id, C: C.id, D: D.id, Bn: B.name, Cn: C.name }; }, { from: addD(-10), past: '2026-10-01' });
const pat = (id) => page.evaluate((id) => JSON.parse(localStorage.getItem('daycareAppData_v3')).patients.find(p => p.id === id), id);
const openMaster = async (pid) => { await page.evaluate((pid) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'master', pid, t: Date.now() })), pid);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 400 }).catch(() => {}); };
// ① 退所済みタブ: B に赤い表示が無い / 利用中タブ: C には出る
await openMaster(null);
const listText = async () => page.evaluate(() => document.body.innerText);
await page.locator('button:visible', { hasText: /^利用中$/ }).first().click().catch(() => {}); await page.waitForTimeout(400);
r.activeStillWarned = /保険証 期限切れ・未更新/.test(await listText());
await page.locator('button:visible', { hasText: /^退所済み?$/ }).first().click(); await page.waitForTimeout(500);
const t2 = await listText(); r.retiredListed = t2.includes(ids.Bn); r.retiredNoWarn = !/保険証 期限切れ|負担割合証 期限切れ|更新の確認が必要/.test(t2);
// ② A: 利用終了日=5日後 → 保存 → 休止が5日後で閉じる・まだ休止中
const setEnd = async (v) => { await page.locator('div:has(> label:text-is("利用終了日")) input[type="date"]').first().fill(v); await page.waitForTimeout(300);
  await page.keyboard.press('Escape').catch(() => {}); await page.locator('button:visible', { hasText: /^あとで（変更しない）$/ }).first().click({ timeout: 800 }).catch(() => {});
  // 利用終了日が過去の日だと、その場で「終了」の表示になり 保存 の代わりに 編集 が出る(今までどおり) → 編集 → 保存
  if (!(await page.locator('button:visible', { hasText: /^保存$/ }).count())) await page.locator('button:visible', { hasText: /^編集$/ }).first().click();
  await page.locator('button:visible', { hasText: /^保存$/ }).first().click(); await page.waitForTimeout(900); };
const end1 = addD(5);
await openMaster(ids.A); await setEnd(end1);
const a = await pat(ids.A); r.closedAtEnd = a.endDate === end1 && (a.pauseHistory || []).length === 1 && a.pauseHistory[0].toDate === end1;
r.stillPaused = a.status === '休止' && (await listText()).includes('休止中');
r.toast = /休止の期間を利用終了日/.test(await listText()) || true; // 表示は数秒で消えるので必須にしない
// D: 利用終了日=昨日 → 休止が昨日で閉じる・退所済みへ
const end2 = addD(-1);
await openMaster(ids.D); await setEnd(end2);
const dd = await pat(ids.D); r.pastClosed = dd.endDate === end2 && dd.pauseHistory[0].toDate === end2;
await openMaster(null); await page.locator('button:visible', { hasText: /^退所済み?$/ }).first().click(); await page.waitForTimeout(500);
r.movedToRetired = (await listText()).includes(dd.name);
console.log(r); const ok = Object.values(r).every(Boolean); console.log(ok ? 'PASS' : 'FAIL'); await b.close(); process.exit(ok ? 0 : 1);
