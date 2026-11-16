// 2026-11-13 trial574: カレンダーの入力画面から「申し送り」を選べる・申し送りに「いつまで表示」(endDate)・期間の各日にホームとカレンダーに出る
//   node chk/chk_1113memo.mjs [port]   (見本データ VITE_E2E_DEMO=1 のビルド)
import { chromium } from 'playwright';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = iso(new Date()); const plus = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 860 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
const page = await ctx.newPage(); page.on('dialog', d => { console.log('DIALOG', d.message().slice(0, 80)); d.accept(); }); page.on('pageerror', e => { console.log('PAGEERROR', e.message.slice(0, 200)); fails++; });
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(900); }
await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.scheduleEvents = []; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'schedule', pid: null, t: Date.now() })); });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
const evs = () => page.evaluate(() => (JSON.parse(localStorage.getItem('daycareAppData_v3')).scheduleEvents || []));
// ① 予定を追加 → 切り替えに「申し送り」
await page.locator('button:visible', { hasText: /^予定を追加$/ }).first().click(); await page.waitForTimeout(400);
ok((await page.getByTestId('sch-kind-event').count()) === 1 && (await page.getByTestId('sch-kind-task').count()) === 1 && (await page.getByTestId('sch-kind-memo').count()) === 1, '入力画面の切り替えは 予定／タスク／申し送り(trial574)');
await page.getByTestId('sch-kind-memo').click(); await page.waitForTimeout(400);
ok((await page.getByTestId('sch-modal').count()) === 0 && (await page.getByTestId('memo-editor').count()) === 1, '申し送りを選ぶと申し送りの入力画面に切り替わる');
ok((await page.getByTestId('memo-date').inputValue()) === today, `表示する日はカレンダーで選んでいた日(${today})`);
ok((await page.getByTestId('memo-end').count()) === 1, '「いつまで」の欄がある');
// ② 内容と いつまで(2日後) を入れて保存
await page.getByTestId('memo-text').fill('検査用の申し送り（期間つき）');
await page.getByTestId('memo-end').fill(plus(2)); await page.waitForTimeout(200);
ok(/から.*まで、毎日ホームに出ます/.test(await page.getByTestId('memo-editor').innerText()), '説明が「〜から〜まで、毎日ホームに出ます」に変わる');
await page.getByTestId('memo-save').click(); await page.waitForTimeout(800);
{ const L = (await evs()).filter(e => e.kind === 'memo'); ok(L.length === 1 && L[0].date === today && L[0].endDate === plus(2), `保存した申し送りに date=${today}・endDate=${plus(2)} (${JSON.stringify(L.map(e => [e.date, e.endDate]))})`); }
ok((await page.getByTestId(`sch-memo-chip-${today}`).count()) === 1 && (await page.getByTestId(`sch-memo-chip-${plus(1)}`).count()) === 1 && (await page.getByTestId(`sch-memo-chip-${plus(2)}`).count()) === 1, '月のカレンダーに 今日・あす・あさって の3日とも申し送りの印');
ok((await page.getByTestId(`sch-memo-chip-${plus(3)}`).count()) === 0, '期間の次の日には出ない');
// ③ いつまで を外して保存 → その日だけ
await page.getByTestId(`sch-memo-chip-${today}`).click().catch(() => {}); await page.waitForTimeout(300);
const editBtn = page.locator('[data-testid="sch-day-memos"] button', { hasText: /^編集$/ }).first();
if (await editBtn.count()) {
  await editBtn.click(); await page.waitForTimeout(400);
  ok((await page.getByTestId('memo-end').inputValue()) === plus(2), '編集を開くと「いつまで」に保存した日が入っている');
  await page.getByTestId('memo-end-clear').click(); await page.waitForTimeout(200); await page.getByTestId('memo-save').click(); await page.waitForTimeout(800);
  { const L = (await evs()).filter(e => e.kind === 'memo'); ok(L.length === 1 && !L[0].endDate, '「その日だけ」に戻すと endDate が消える'); }
  ok((await page.getByTestId(`sch-memo-chip-${plus(1)}`).count()) === 0, 'あすの印は消える');
  // もう一度 期間を付けておく(ホームの確認用)
  await editBtn.click(); await page.waitForTimeout(400); await page.getByTestId('memo-end').fill(plus(2)); await page.getByTestId('memo-save').click(); await page.waitForTimeout(800);
} else console.log('SKIP 編集ボタンが見つからない');
// ④ ホーム: 今日の申し送りに出る
await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'dashboard', pid: null, t: Date.now() })));
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
ok((await page.getByTestId('home-memos-today').count()) === 1 && /検査用の申し送り/.test(await page.getByTestId('home-memos-today').innerText()), 'ホームの「今日の申し送り」に出る');
// ⑤ 開始が あす・終わりが あさって の申し送りは今日は出ず「これからの申し送り」に
await page.evaluate(([d1, d2]) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.scheduleEvents = [...(d.scheduleEvents || []), { id: 'memo_test_future', kind: 'memo', color: '#f97316', date: d1, endDate: d2, title: 'あすからの申し送り', patientId: '', by: '', at: new Date().toISOString(), _savedAt: Date.now() }]; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); }, [plus(1), plus(2)]);
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
ok(!/あすからの申し送り/.test(await page.getByTestId('home-memos-today').innerText()), '開始があすの申し送りは今日は出ない');
ok((await page.getByTestId('home-memos-upcoming').count()) === 1, '「これからの申し送り」に数えられる');
await b.close();
console.log(fails ? `FAIL ${fails}` : 'ALL PASS'); process.exit(fails ? 1 : 0);
