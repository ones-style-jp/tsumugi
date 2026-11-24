// 2026-11-24 trial625: 申し送り・予定・タスクの削除で「この日の分だけ消す／すべて消す」を選べる・合言葉の欄に自動入力させない
//   ① 3日続く申し送り(今日〜あさって)を今日の欄から削除 → 小窓 → この日だけ → 開始があすに縮む・今日の欄から消える
//   ② 3日続く予定の 2日目(あす)の続きを月の表から開いて削除 → この日だけ → skipDates=[あす]・月の表の印が 2 つになる・詳細に「消した日」
//   ③ 毎日のタスクの回を削除 → この日だけ → skipDates に入り、その日の表から消える(ほかの日は残る)
//   ④ 1 日だけの申し送りは小窓を出さず、従来の確認(confirm)で消える
//   ⑤ 「すべて消す」→ 記録ごと消え、墓石(deletedIds)が付く
//   ⑥ 管理局 外部サービス設定の合言葉の欄: type=text・自動入力の抑止(name/autocomplete)・文字は伏せる(text-security)
//   node chk/chk_1124delscope.mjs [port]   (見本データ VITE_E2E_DEMO=1 のビルド)
import { chromium } from 'playwright';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = iso(new Date()); const plus = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const dow = (s) => new Date(`${s}T00:00:00`).getDay();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 860 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
const page = await ctx.newPage(); let confirms = 0; page.on('dialog', d => { confirms++; console.log('DIALOG', d.message().slice(0, 60)); d.accept(); }); page.on('pageerror', e => { console.log('PAGEERROR', e.message.slice(0, 200)); fails++; });
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(900); }
// 月の表は今日の月 → 3 日が月をまたぐと印の数が合わないので、必要なら日をずらさずに見る日だけ選ぶ(今日〜あさってが同じ月でないときは ② の印の数の検査を飛ばす)
const sameMonth = plus(2).slice(0, 7) === today.slice(0, 7);
await page.evaluate(({ today, p1, p2 }) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const now = Date.now();
  d.scheduleEvents = [
    { id: 'memo_t1', kind: 'memo', color: '#f97316', date: today, endDate: p2, title: '検査 申し送り 3日', patientId: '', by: '', at: new Date().toISOString(), _savedAt: now },
    { id: 'memo_t2', kind: 'memo', color: '#f97316', date: today, title: '検査 申し送り 1日', patientId: '', by: '', at: new Date().toISOString(), _savedAt: now },
    { id: 'ev_t1', date: today, endDate: p2, title: '検査 予定 3日', start: '', end: '', note: '', color: '#6366f1', _savedAt: now },
    { id: 'ev_t2', kind: 'task', date: today, repeat: 'daily', repeatEvery: 1, title: '検査 毎日タスク', start: '', end: '', color: '#059669', _savedAt: now },
  ]; d.deletedIds = {}; d.holidays = []; if (d.systemSettings && d.systemSettings.facilityInfo) d.systemSettings.facilityInfo.closedDays = [0];
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'schedule', pid: null, t: Date.now() })); }, { today, p1: plus(1), p2: plus(2) });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
const evs = () => page.evaluate(() => (JSON.parse(localStorage.getItem('daycareAppData_v3')).scheduleEvents || []));
const ev = async (id) => (await evs()).find(e => e.id === id);
// 今日を選ぶ(今日の申し送りの印を押す)
await page.getByTestId(`sch-memo-chip-${today}`).click().catch(() => {}); await page.waitForTimeout(400);
ok((await page.getByTestId('memo-rdel-memo_t1').count()) === 1 && (await page.getByTestId('memo-rdel-memo_t2').count()) === 1, '今日の欄に 3日の申し送りと 1日の申し送りが出る');
// ① 3日続く申し送り → この日だけ
await page.getByTestId('memo-rdel-memo_t1').click(); await page.waitForTimeout(300);
ok((await page.getByTestId('del-scope').count()) === 1, '3日続く申し送りの削除で「この日だけ／すべて」の小窓が出る');
ok(/〜.*の毎日/.test(await page.getByTestId('del-scope').innerText()), '小窓に「いつからいつまで」が書いてある');
await page.getByTestId('del-scope-day').click(); await page.waitForTimeout(800);
{ const m = await ev('memo_t1'); ok(!!m && m.date === plus(1) && m.endDate === plus(2) && !m.skipDates, `今日の分だけ消す → 開始があす(${plus(1)})に縮む・endDate はそのまま (${JSON.stringify(m && [m.date, m.endDate, m.skipDates])})`); }
ok((await page.getByTestId('memo-rdel-memo_t1').count()) === 0, '今日の欄からは消える');
ok((await page.getByTestId(`sch-memo-chip-${plus(1)}`).count()) === 1, 'あすの印は残る');
// ④ 1 日だけの申し送りは従来の confirm
confirms = 0; await page.getByTestId('memo-rdel-memo_t2').click(); await page.waitForTimeout(600);
ok(confirms === 1 && (await page.getByTestId('del-scope').count()) === 0 && !(await ev('memo_t2')), '1日だけの申し送りは小窓なし・従来の確認で消える');
// ② 3日続く予定の 2日目 → この日だけ
const chip2 = page.locator('[title="検査 予定 3日"]').nth(1);
if (sameMonth && (await page.locator('[title="検査 予定 3日"]').count()) >= 2) {
  await chip2.click(); await page.waitForTimeout(400);
  await page.locator('button:visible', { hasText: /^削除$/ }).last().click(); await page.waitForTimeout(300);
  ok((await page.getByTestId('del-scope').count()) === 1, '続く予定の 2日目の削除で小窓が出る');
  ok((await page.getByTestId('del-scope-day').innerText()).includes(`${Number(plus(1).slice(5, 7))}/${Number(plus(1).slice(8, 10))}`), '「この日だけ」のボタンに あすの日付');
  await page.getByTestId('del-scope-day').click(); await page.waitForTimeout(800);
  { const e = await ev('ev_t1'); ok(!!e && e.date === today && e.endDate === plus(2) && Array.isArray(e.skipDates) && e.skipDates.join() === plus(1), `途中の日は skipDates に入る (${JSON.stringify(e && [e.date, e.endDate, e.skipDates])})`); }
  ok((await page.locator('[title="検査 予定 3日"]').count()) === 2, '月の表の印は 3→2 に');
  await page.locator('[title="検査 予定 3日"]').first().click(); await page.waitForTimeout(400);
  ok((await page.getByTestId('sch-evd-skipped').count()) === 1, '詳細に「消した日」が出る');
  // ⑤ すべて消す
  await page.locator('button:visible', { hasText: /^削除$/ }).last().click(); await page.waitForTimeout(300);
  confirms = 0; await page.getByTestId('del-scope-all').click(); await page.waitForTimeout(800);
  { const e = await ev('ev_t1'); const td = await page.evaluate(() => ((JSON.parse(localStorage.getItem('daycareAppData_v3')).deletedIds || {}).scheduleEvents || {})); ok(!e && !!td.ev_t1 && confirms === 0, '「すべて消す」→ 記録ごと消え 墓石が付く・確認は聞き直さない'); }
  ok((await page.locator('[title="検査 予定 3日"]').count()) === 0, '月の表から消える');
} else console.log('SKIP ② (月をまたぐ)');
// ③ 毎日のタスクの回 → この日だけ(日曜は営業日でないので避ける)
const tDay = dow(plus(1)) === 0 ? plus(2) : plus(1);
const tChips = page.locator('[title="検査 毎日タスク"]'); // 月の表の印(title=題名)
const nBefore = await tChips.count();
if (sameMonth && nBefore >= 2) {
  // tDay の回を開く(月の表の印は日付順)
  const idx = dow(plus(1)) === 0 ? 2 : 1;
  await tChips.nth(Math.min(idx, nBefore - 1)).click(); await page.waitForTimeout(400);
  await page.locator('button:visible', { hasText: /^削除$/ }).last().click(); await page.waitForTimeout(300);
  ok((await page.getByTestId('del-scope').count()) === 1 && /繰り返し（毎日/.test(await page.getByTestId('del-scope').innerText()), '繰り返しタスクの削除で小窓(繰り返し（毎日）)');
  await page.getByTestId('del-scope-day').click(); await page.waitForTimeout(800);
  { const t = await ev('ev_t2'); ok(!!t && t.repeat === 'daily' && Array.isArray(t.skipDates) && t.skipDates.length === 1 && t.skipDates[0] === tDay, `タスクは skipDates=[${tDay}] (${JSON.stringify(t && t.skipDates)})`); }
  ok((await tChips.count()) === nBefore - 1, `月の表のタスクの印が 1 つ減る (${nBefore}→${await tChips.count()})`);
} else console.log('SKIP ③', nBefore);
// ⑥ 合言葉の欄
await page.goto(`http://localhost:${PORT}/#hqservices`, { waitUntil: 'networkidle' }); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500); // 同じ文書の中で # だけ変えても画面は切り替わらない → 読み直す
await page.getByText('外部サービス設定（全店共通').first().click().catch(() => {}); await page.waitForTimeout(400); // 見出しを押して開く
{ const el = page.getByTestId('hq-secret'); ok((await el.count()) === 1, '外部サービス設定の合言葉の欄がある');
  if (await el.count()) { const a = await el.evaluate(x => ({ type: x.type, name: x.name, ac: x.getAttribute('autocomplete'), sec: getComputedStyle(x).webkitTextSecurity }));
    ok(a.type === 'text' && a.name === 'tsu-hq-secret' && a.ac === 'off' && a.sec === 'disc', `合言葉の欄は type=text・name=tsu-hq-secret・autocomplete=off・文字を伏せる (${JSON.stringify(a)})`); } }
await b.close(); console.log(fails ? `FAIL ${fails}` : 'ALL PASS'); process.exit(fails ? 1 : 0);
