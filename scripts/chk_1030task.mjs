// 2026-10-30 ユーザー提案「カレンダーに予定＋タスク。チェックを押せば完了・押さなければずっと残る・日常業務や月末業務も」(②タスク・trial475)
//   ①カレンダー: 「＋ タスク」で書く → kind:'task'・緑・その日の欄に四角・月のマスに□
//   ②ホーム: 本日の業務に四角つきで出る → 押すと済み(誰が)・ホームから消える・カレンダーは✓と取り消し線・戻すとまた出る
//   ③期限切れ: 繰り返しなしの古いタスクはずっと残る(期限切れ M/D)・毎日のタスクは営業日だけ(定休日は出ない)・済んでいない回が残る・毎日は先の回を出さない(今週/今月が毎日の分で埋まらない)
//   ④先の日のタスクは今週/今月の欄・ホームの予定(今日の予定)にタスクが混ざらない・前からの予定はそのまま
//   ⑤毎月（最終営業日）: 期日が今月の最終営業日になる・翌月の最終営業日にも出る
//   ⑥表示設定でタスクを止められる ⑦スマホ: 四角は44px・はみ出さない
//   実行: node scripts/chk_1030task.mjs [--port 4175]
import { chromium, webkit } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4175'; })();
const r = {};
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const add = (s, n) => { const d = new Date(`${s}T00:00:00`); d.setDate(d.getDate() + n); return iso(d); };
const T = new Date(); const TODAY = iso(T);
const lastBiz = (y, m) => { for (let d = new Date(y, m, 0).getDate(); d >= 1; d--) { const x = new Date(y, m - 1, d); if (x.getDay() !== 0) return iso(x); } }; // 定休日=日曜
const seed = async (page) => page.evaluate(([TODAY, OLD, D3]) => {
  const d = JSON.parse(localStorage.getItem('daycareAppData_v3'));
  d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [0] }; d.holidays = []; d.systemSettings.homeTasks = {};
  d.scheduleEvents = (d.scheduleEvents || []).filter(e => e.kind !== 'task' && e.kind !== 'memo' && e.id !== 'ev_chk_keep');
  d.scheduleEvents.push({ id: 'ev_chk_keep', date: TODAY, start: '10:00', end: '11:00', title: '見本の予定', note: '', color: '#3b82f6', _savedAt: Date.now() });
  d.scheduleEvents.push({ id: 'task_chk_old', kind: 'task', date: OLD, title: '見本の古いタスク', color: '#059669', _savedAt: Date.now() });
  d.scheduleEvents.push({ id: 'task_chk_daily', kind: 'task', date: D3, repeat: 'daily', repeatEvery: 1, title: '見本の毎日のタスク', color: '#059669', _savedAt: Date.now() });
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0');
  sessionStorage.setItem('tsumugiActiveRecorder', JSON.stringify({ id: 'demo_rec', name: '見本 職員', roleLabel: '介護職員' })); }, [TODAY, add(TODAY, -40), add(TODAY, -3)]);
const go = async (page, view) => { await page.evaluate((v) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: null, t: Date.now() })), view); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2200); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 400 }).catch(() => {});
  if (view === 'dashboard') for (const tier of ['today', 'week', 'month']) { const m = page.getByTestId(`home-tasks-more-${tier}`); if (await m.count()) { await m.click(); await page.waitForTimeout(200); } } }; // 5件より多いと「他n件」にたたまれる
const data = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('daycareAppData_v3')));
const tasksOf = async (page) => ((await data(page)).scheduleEvents || []).filter(e => e.kind === 'task');
const enter = async (page) => { await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800); if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); } };

const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage(); page.on('dialog', d => d.accept());
await enter(page); await seed(page); await go(page, 'schedule');
// ① カレンダーで書く
await page.getByTestId('sch-task-add').click(); await page.waitForTimeout(400);
const kindOn = await page.getByTestId('sch-kind-task').evaluate(el => getComputedStyle(el).borderTopWidth);
await page.locator('input[placeholder^="やること"]').fill('見本のタスク 請求の確認'); await page.getByTestId('sch-modal-save').click(); await page.waitForTimeout(900);
let TK = await tasksOf(page); const t1 = TK.find(t => t.title === '見本のタスク 請求の確認');
const chip = await page.locator(`[data-ds="${TODAY}"]`).innerText();
console.log('①', JSON.stringify(t1 && { date: t1.date, color: t1.color, end: t1.end }), '枠', kindOn, 'マス', JSON.stringify(chip.split('\n').slice(0, 6)));
r.write = !!t1 && t1.date === TODAY && t1.color === '#059669' && !t1.end && kindOn === '2px' && (await page.getByTestId(`sch-task-check-${t1.id}`).count()) === 1 && /□見本のタスク 請求の確認/.test(chip.replace(/\n/g, ''));
// ② ホームで済みにする
await go(page, 'dashboard');
const key = `task_${t1.id}_${TODAY}`; const inToday = await page.locator(`[data-testid="home-tasks-today"] [data-testid="home-task-${key}"]`).count();
const evTxt = await page.locator('[data-testid="home-today-events"]').innerText().catch(() => '');
await page.getByTestId(`home-task-check-${key}`).click(); await page.waitForTimeout(900);
TK = await tasksOf(page); const d1 = (TK.find(t => t.id === t1.id).done || {})[TODAY];
const gone = (await page.getByTestId(`home-task-${key}`).count()) === 0;
console.log('② 本日に出た', inToday, '済み', JSON.stringify(d1), '消えた', gone, '今日の予定', JSON.stringify(evTxt.split('\n').slice(0, 3)));
r.homeDone = inToday === 1 && !!d1 && !d1.off && d1.by === '見本 職員' && gone;
r.homeEvents = evTxt.includes('見本の予定') && !evTxt.includes('見本のタスク') && !evTxt.includes('見本の毎日');
await go(page, 'schedule');
const doneTxt = await page.getByTestId(`sch-task-done-${t1.id}`).innerText().catch(() => '');
const chip2 = await page.locator(`[data-ds="${TODAY}"]`).evaluate((el) => { const c = [...el.querySelectorAll('div')].find(x => /見本のタスク 請求の確認/.test(x.textContent) && x.children.length === 0 || (/見本のタスク 請求の確認/.test(x.textContent) && /^[✓□]/.test(x.textContent))); return c ? { t: c.textContent, deco: getComputedStyle(c).textDecorationLine } : null; });
console.log('② カレンダー', doneTxt, JSON.stringify(chip2)); r.calDone = /済み（見本 職員）/.test(doneTxt) && !!chip2 && /^✓/.test(chip2.t) && chip2.deco === 'line-through';
await page.getByTestId(`sch-task-check-${t1.id}`).click(); await page.waitForTimeout(800);
TK = await tasksOf(page); const d2 = (TK.find(t => t.id === t1.id).done || {})[TODAY];
await go(page, 'dashboard'); const back = await page.getByTestId(`home-task-${key}`).count();
console.log('② 戻した', JSON.stringify(d2), 'ホームにまた出る', back); r.undo = !!d2 && d2.off === true && back === 1;
// ③ 期限切れ・毎日(営業日だけ)
const oldKey = `task_task_chk_old_${add(TODAY, -40)}`; const oldTxt = await page.getByTestId(`home-task-${oldKey}`).innerText().catch(() => '');
const want = []; for (let k = -3; k <= 0; k++) { const s = add(TODAY, k); if (new Date(`${s}T00:00:00`).getDay() !== 0) want.push(s); }
const got = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="home-task-task_task_chk_daily_"]')].map(x => x.dataset.testid.slice(-10)));
console.log('③ 古い', JSON.stringify(oldTxt.split('\n')), '毎日 出た', JSON.stringify(got), '期待', JSON.stringify(want));
r.old = /見本の古いタスク/.test(oldTxt) && /期限切れ（/.test(oldTxt);
r.daily = JSON.stringify(got.slice().sort()) === JSON.stringify(want.slice().sort());
// ④ 先の日(あす以降・今週/今月の欄)
await go(page, 'schedule');
const fut = add(TODAY, 1); await page.locator(`[data-ds="${fut}"]`).click().catch(() => {});
let futOk = true;
if (await page.locator(`[data-ds="${fut}"]`).count()) { await page.getByTestId('sch-task-add').click(); await page.waitForTimeout(300); await page.locator('input[placeholder^="やること"]').fill('見本の先のタスク'); await page.getByTestId('sch-modal-save').click(); await page.waitForTimeout(800);
  TK = await tasksOf(page); const tf = TK.find(t => t.title === '見本の先のタスク'); await go(page, 'dashboard');
  const inWeek = await page.locator(`[data-testid="home-tasks-week"] [data-testid="home-task-task_${tf.id}_${fut}"]`).count(), inMonth = await page.locator(`[data-testid="home-tasks-month"] [data-testid="home-task-task_${tf.id}_${fut}"]`).count(), inTod = await page.locator(`[data-testid="home-tasks-today"] [data-testid="home-task-task_${tf.id}_${fut}"]`).count();
  console.log('④', tf && tf.date, '今週', inWeek, '今月', inMonth, '本日', inTod); futOk = !!tf && tf.date === fut && inTod === 0 && (inWeek + inMonth) === 1; }
r.future = futOk;
// ⑤ 毎月（最終営業日）
await go(page, 'schedule'); await page.getByTestId('sch-task-add').click(); await page.waitForTimeout(300);
await page.locator('input[placeholder^="やること"]').fill('見本の月末のタスク');
await page.locator('select').filter({ has: page.locator('option[value="monthly_lastbiz"]') }).selectOption('monthly_lastbiz'); await page.waitForTimeout(300);
const note = await page.getByTestId('sch-lastbiz-note').innerText().catch(() => '');
await page.getByTestId('sch-modal-save').click(); await page.waitForTimeout(800);
TK = await tasksOf(page); const tm = TK.find(t => t.title === '見本の月末のタスク');
const LB = lastBiz(T.getFullYear(), T.getMonth() + 1); const nY = T.getMonth() === 11 ? T.getFullYear() + 1 : T.getFullYear(), nM = T.getMonth() === 11 ? 1 : T.getMonth() + 2; const LB2 = lastBiz(nY, nM);
await page.getByTestId('sch-next-month').click(); await page.waitForTimeout(500);
const nextCell = await page.locator(`[data-ds="${LB2}"]`).innerText().catch(() => ''); const dayBefore = await page.locator(`[data-ds="${add(LB2, -1)}"]`).innerText().catch(() => '');
console.log('⑤', tm && tm.date, '期待', LB, '翌月', LB2, JSON.stringify(nextCell.split('\n').slice(0, 4)), note);
r.lastbiz = !!tm && tm.repeat === 'monthly_lastbiz' && tm.date === LB && /見本の月末のタスク/.test(nextCell) && !/見本の月末のタスク/.test(dayBefore) && /最後の日/.test(note);
// ⑥ 表示設定で止める
await go(page, 'dashboard'); await page.getByTestId('home-tasks-cfg').click(); await page.waitForTimeout(300);
await page.getByTestId('home-tasks-cfg-tasks').locator('input[type=checkbox]').first().uncheck(); await page.waitForTimeout(800);
const nOff = await page.locator('[data-testid^="home-task-task_"]').count(); await page.getByTestId('home-tasks-cfg-tasks').locator('input[type=checkbox]').first().check(); await page.waitForTimeout(800);
const nOn = await page.locator('[data-testid^="home-task-task_"]').count(); console.log('⑥ 止めた', nOff, '戻した', nOn); r.cfg = nOff === 0 && nOn > 0;
await b.close();
// ⑦ スマホ
{ const b2 = await webkit.launch(); const vp = { width: 390, height: 844 }; const pg = await (await b2.newContext({ viewport: vp, screen: vp, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1' })).newPage(); pg.on('dialog', d => d.accept());
  await enter(pg); await seed(pg); await go(pg, 'dashboard');
  const m = await pg.evaluate(() => { const c = document.querySelector('[data-testid^="home-task-check-task_"]'); const hs = document.querySelector('[data-testid="home-scroll"]'); return c ? { h: Math.round(c.getBoundingClientRect().height), w: Math.round(c.getBoundingClientRect().width), sw: document.documentElement.scrollWidth, hs: hs.scrollWidth, hc: hs.clientWidth } : null; });
  await go(pg, 'schedule'); const cm = await pg.evaluate(() => { const c = document.querySelector('[data-testid^="sch-task-check-"]'); return c ? Math.round(c.getBoundingClientRect().height) : 0; });
  console.log('⑦ スマホ', JSON.stringify(m), 'カレンダーの四角', cm); r.phone = !!m && m.h >= 44 && m.w >= 44 && m.sw <= 390 && m.hs <= m.hc && cm >= 44; await b2.close(); }
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
