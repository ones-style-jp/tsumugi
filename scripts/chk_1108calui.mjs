// 2026-11-08 trial530: カレンダーの予定の入力画面(スマホのカレンダーアプリ風)
//   ① 上の段に ×・予定/タスク・保存、日時のカードに 開始(日付・時刻)・終了(日付・時刻)・終日・繰り返し
//   ② 時刻を入れて保存 → start/end が入り endDate なし(終了の日付が開始と同じ)
//   ③ 終日をONにすると時刻の欄が消え、保存すると start/end が空。終日の予定を編集で開くと終日がON
//   ④ タスクに切り替えると 終了・終日の行が消える。繰り返しを選ぶと終了の日付は押せない
//   ⑤ スマホは下から出る全幅の紙(画面の下端に付く)。画面写真 cal_form_phone.png / cal_form_pc.png
//   実行: node scripts/chk_1108calui.mjs [port]
import { chromium } from 'playwright';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
const OUT = process.env.S || '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad';
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = iso(new Date());
const b = await chromium.launch(); const r = {};
const mk = async (phone) => { const ctx = await b.newContext(phone ? { viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' } : { viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
  const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.scheduleEvents = []; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'schedule', pid: null, t: Date.now() })); });
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
  return page; };
const evs = (page) => page.evaluate(() => (JSON.parse(localStorage.getItem('daycareAppData_v3')).scheduleEvents || []));
// ---- PC ----
const page = await mk(false);
await page.locator('button:visible', { hasText: /^予定を追加$/ }).first().click(); await page.waitForTimeout(400);
const has = async (id) => (await page.getByTestId(id).count()) === 1;
r.parts = (await has('sch-modal-close')) && (await has('sch-kind-event')) && (await has('sch-kind-task')) && (await has('sch-modal-save')) && (await has('sch-start-date')) && (await has('sch-start-time')) && (await has('sch-end-date')) && (await has('sch-end-time')) && (await has('sch-allday')) && (await has('sch-repeat'));
r.alldayOff = (await page.getByTestId('sch-allday').getAttribute('aria-checked')) === 'false';
await page.getByTestId('sch-modal').screenshot({ path: `${OUT}/cal_form_pc.png` });
// ② 時刻を入れて保存
await page.locator('input[placeholder^="タイトル"]').fill('入力画面の見本');
await page.getByTestId('sch-start-date').fill(today); await page.getByTestId('sch-start-time').fill('10:00'); await page.getByTestId('sch-end-time').fill('11:00');
r.endDefaultsSame = (await page.getByTestId('sch-end-date').inputValue()) === today;
await page.getByTestId('sch-modal-save').click(); await page.waitForTimeout(700);
let e1 = (await evs(page)).find(e => e.title === '入力画面の見本');
r.savedTimes = !!e1 && e1.date === today && e1.start === '10:00' && e1.end === '11:00' && !e1.endDate && e1._allDay === undefined;
// ③ 終日
await page.locator('button:visible', { hasText: /^予定を追加$/ }).first().click(); await page.waitForTimeout(300);
await page.locator('input[placeholder^="タイトル"]').fill('終日の見本'); await page.getByTestId('sch-start-date').fill(today);
await page.getByTestId('sch-allday').click(); await page.waitForTimeout(150);
r.alldayHidesTime = (await page.getByTestId('sch-start-time').count()) === 0 && (await page.getByTestId('sch-end-time').count()) === 0 && (await page.getByTestId('sch-allday').getAttribute('aria-checked')) === 'true';
await page.getByTestId('sch-modal-save').click(); await page.waitForTimeout(700);
const e2 = (await evs(page)).find(e => e.title === '終日の見本');
r.savedAllDay = !!e2 && !e2.start && !e2.end && e2._allDay === undefined;
// 編集で開くと終日ON(月の表の予定を押して「編集」)
await page.getByText('終日の見本').first().click(); await page.waitForTimeout(400);
await page.locator('button:visible', { hasText: /^編集$/ }).last().click(); await page.waitForTimeout(400);
r.editAllDayOn = (await page.getByTestId('sch-allday').getAttribute('aria-checked')) === 'true' && (await page.getByTestId('sch-modal-del').count()) === 1;
// ④ タスクに切り替え → 終了・終日なし。戻して繰り返しを毎週 → 終了の日付は押せない
await page.getByTestId('sch-kind-task').click(); await page.waitForTimeout(150);
r.taskRows = (await page.getByTestId('sch-end-date').count()) === 0 && (await page.getByTestId('sch-allday').count()) === 0 && (await page.getByTestId('sch-start-date').count()) === 1;
await page.getByTestId('sch-kind-event').click(); await page.waitForTimeout(150);
await page.getByTestId('sch-repeat').selectOption('weekly'); await page.waitForTimeout(150);
r.repeatDisablesEnd = await page.getByTestId('sch-end-date').isDisabled();
await page.getByTestId('sch-modal-close').click(); await page.waitForTimeout(300);
r.closed = (await page.getByTestId('sch-modal').count()) === 0;
await page.context().close();
// ---- スマホ ----
const ph = await mk(true);
await ph.locator('button:visible', { hasText: /^予定を追加$/ }).first().click().catch(async () => { await ph.getByTestId('sch-task-add').click(); }); await ph.waitForTimeout(500);
const box = await ph.getByTestId('sch-modal').boundingBox();
r.phoneSheet = !!box && Math.abs((box.y + box.height) - 932) < 3 && box.width >= 428;
r.phoneTapSize = await ph.getByTestId('sch-modal-save').evaluate(el => el.getBoundingClientRect().height >= 40);
await ph.getByTestId('sch-start-time').fill('10:00'); await ph.waitForTimeout(100);
await ph.screenshot({ path: `${OUT}/cal_form_phone.png` });
await ph.context().close();
console.log(r); const ok = Object.values(r).every(Boolean); console.log(ok ? 'PASS' : 'FAIL'); await b.close(); process.exit(ok ? 0 : 1);
