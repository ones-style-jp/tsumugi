// 2026-11-27 1127d / trial649 の検査: 休止の履歴を消したあとの状態
//   a 休止予定(開始日が先)を消す → 利用中(前は 履歴のない「休止」が残って、その場で休止中になっていた)
//   b いまの休止を消す → 利用中(前から)
//   c 前の(終わった)休止を消す・いまの休止は残る → 休止のまま
//   d 休止予定を「編集」の小窓から消す → 利用中(その場で保存・休止予定の帯も「現在休止中」も出ない)
//   実行: node chk/chk_1127pausedel.mjs [port]
import { chromium } from 'playwright';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
page.on('dialog', d => d.accept()); page.on('pageerror', e => { console.log('PAGEERROR', e.message.slice(0, 200)); fails++; });
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addD = (n) => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate() + n); };
const seed = (idx, hist) => page.evaluate(({ idx, hist }) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const p = d.patients.filter(x => !x.endDate)[idx]; p.status = '休止'; p.pauseHistory = hist; p.statusUpdatedAt = Date.now() - 1000; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); return p.id; }, { idx, hist });
const open = async (pid) => { await page.evaluate((pid) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'master', pid, ampm: 'AM', t: Date.now() })), pid); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {}); await page.locator('button:visible', { hasText: /^サービス提供内容$/ }).first().click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(1000); };
const get = (pid) => page.evaluate((pid) => { const p = JSON.parse(localStorage.getItem('daycareAppData_v3')).patients.find(x => x.id === pid); return { status: p.status, n: (p.pauseHistory || []).length }; }, pid);
const del = page.locator('button[title="この休止履歴を削除"]:visible');
// a 休止予定を消す
let pid = await seed(2, [{ fromDate: iso(addD(5)), toDate: '', reason: '入院' }]); await open(pid);
ok(await page.locator('[data-testid="pause-planned"]').count() === 1, 'a 休止予定の帯が出ている');
await del.first().click(); await page.waitForTimeout(2500); let g = await get(pid);
ok(g.status === '利用中' && g.n === 0, `a 休止予定を消す → ${g.status}・履歴 ${g.n}件(期待 利用中・0件)`);
// b いまの休止を消す
pid = await seed(3, [{ fromDate: iso(addD(-2)), toDate: '', reason: '入院' }]); await open(pid);
await del.first().click(); await page.waitForTimeout(2500); g = await get(pid);
ok(g.status === '利用中' && g.n === 0, `b いまの休止を消す → ${g.status}・履歴 ${g.n}件(期待 利用中・0件)`);
// c 前の休止だけを消す(一覧は新しい順 → 2つ目のごみ箱)
pid = await seed(4, [{ fromDate: iso(addD(-60)), toDate: iso(addD(-40)), reason: '旅行' }, { fromDate: iso(addD(-2)), toDate: '', reason: '入院' }]); await open(pid);
ok(await del.count() === 2, `c 履歴が2件出ている → ${await del.count()}`);
await del.nth(1).click(); await page.waitForTimeout(2500); g = await get(pid);
ok(g.status === '休止' && g.n === 1, `c 前の休止を消しても、いまの休止は残る → ${g.status}・履歴 ${g.n}件(期待 休止・1件)`);
// d 休止予定を「編集」の小窓から消す
pid = await seed(5, [{ fromDate: iso(addD(5)), toDate: '', reason: '入院' }]); await open(pid);
await page.locator('button[title="この休止履歴を編集"]:visible').first().click(); await page.waitForTimeout(600);
await page.locator('div.fixed', { hasText: '休止履歴の編集' }).last().locator('button', { hasText: /^削除$/ }).click(); await page.waitForTimeout(2500);
const body = await page.locator('body').innerText(); g = await get(pid);
ok(await page.locator('[data-testid="pause-planned"]').count() === 0 && !/現在休止中/.test(body), 'd 編集の小窓から休止予定を消す → 休止予定の帯も「現在休止中」も出ない');
ok(g.status === '利用中' && g.n === 0, `d 小窓の削除は、その場で保存される → ${g.status}・履歴 ${g.n}件(期待 利用中・0件)`);
await b.close(); console.log(fails ? `FAIL ${fails}` : 'ALL PASS'); process.exit(fails ? 1 : 0);
