// 2026-10-30 ユーザー提案「ホームに、その日みんなに伝える利用者のこと(転倒・注射で運動少なめ など)をメモで共有。先の日に見せることも」
//   決定: 表示はその日だけ＋「あすにも出す」／支援経過表はチェックしたものだけ／まずメモを試験版へ
//   ①ホーム: 書く(利用者つき・支援経過表にも残す)→今日の申し送りに出る・支援経過表に1行(書いた日・書いた人・memoId)
//   ②全体(利用者なし)も書ける ③先の日の分は今日に出ず「これからの申し送り」に出る ④あすにも出す→次の営業日に写し・ボタンは「…にも出しています」
//   ⑤直す→内容が変わる・支援経過表の行は変わらない ⑥今日の予定(ホーム)にメモが混ざらない・前からの予定はそのまま
//   ⑦カレンダー: 日のマスに「申し送り n」・その日の申し送りに出る・予定の一覧にメモが出ない・予定を消してもメモは残る
//   ⑧提供記録入力: 申し送りのある方の名前に印・押すと内容(先の日の分は印なし) ⑨削除→消える・墓石 ⑩予定の通知の数にメモを入れない
//   ⑪スマホ: 横にはみ出さない・押す所44px・本文16px・書く画面は全面 ⑫iPad: 書く画面が真ん中
//   実行: node scripts/chk_1030memo.mjs [--port 4175]
import { chromium, webkit } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4175'; })();
const r = {};
const T1 = '見本の申し送り 朝に注射のため運動は軽めに', T1b = '見本の申し送り 注射のため運動は軽めに(直した)', T2 = '見本の全体連絡 午後に避難訓練の打ち合わせ', T3 = '見本の申し送り あすは入浴なし';
const seed = async (page) => page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const dow = new Date().getDay(); const t = new Date(); const iso = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [] }; d.holidays = [];
  const ps = d.patients.filter(p => p.status === '利用中' && !p.endDate); ps.forEach((p, i) => { p.scheduleAmPm = ['', '', '', '', '', '', '']; if (i < 3) p.scheduleAmPm[dow] = 'AM'; p.pauseHistory = []; });
  d.scheduleEvents = (d.scheduleEvents || []).filter(e => e.kind !== 'memo'); d.scheduleEvents.push({ id: 'ev_chk_keep', date: iso, start: '10:00', end: '11:00', title: '見本の予定', note: '', color: '#3b82f6', _savedAt: Date.now() });
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0');
  sessionStorage.setItem('tsumugiActiveRecorder', JSON.stringify({ id: 'demo_rec', name: '見本 職員', roleLabel: '介護職員' }));
  return { P: ps[0].id, Pn: ps[0].name, P2: ps[1].id, iso, ev0: d.scheduleEvents.filter(e => e.kind !== 'memo').length }; });
const go = async (page, view, extra) => { await page.evaluate(([v, x]) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: null, t: Date.now(), ...(x || {}) })), [view, extra]); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2200); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 400 }).catch(() => {}); };
const data = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('daycareAppData_v3')));
const memos = async (page) => ((await data(page)).scheduleEvents || []).filter(e => e.kind === 'memo');
const write = async (page, { pid, text, sp, next }) => {
  await page.getByTestId('home-memo-add').click(); await page.waitForTimeout(400);
  if (pid != null) await page.getByTestId('memo-pt').selectOption(String(pid));
  await page.getByTestId('memo-text').fill(text); if (sp) await page.getByTestId('memo-sp').check(); if (next) await page.getByTestId('memo-date-next').click();
  await page.getByTestId('memo-save').click(); await page.waitForTimeout(900); };

const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept());
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const S = await seed(page); const tomorrow = await page.evaluate(() => { const t = new Date(); t.setDate(t.getDate() + 1); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; });
await go(page, 'dashboard');
r.empty = /今日の申し送りはありません/.test(await page.getByTestId('home-memos').innerText());
// ① 利用者つき＋支援経過表
await write(page, { pid: S.P, text: T1, sp: true });
let M = await memos(page); const m1 = M.find(m => m.title === T1);
let D = await data(page); let sp = ((D.patients.find(p => p.id === S.P).personalFile || {}).supportProgress || []).filter(x => x.memoId === (m1 && m1.id));
console.log('①', JSON.stringify(m1 && { date: m1.date, by: m1.by, spId: !!m1.spId }), '支援経過表', JSON.stringify(sp.map(x => ({ date: x.date, staff: x.staff, content: x.content }))));
r.write = !!m1 && m1.date === S.iso && m1.by === '見本 職員' && m1.patientId === S.P && !!m1.spId && sp.length === 1 && sp[0].content === T1 && sp[0].date === S.iso && sp[0].staff === '見本 職員';
r.writeShow = (await page.getByTestId(`memo-row-${m1.id}`).innerText()).includes(`${S.Pn} 様`);
// ② 全体
await write(page, { text: T2 }); M = await memos(page); const m2 = M.find(m => m.title === T2);
r.zentai = !!m2 && !m2.patientId && (await page.getByTestId(`memo-row-${m2.id}`).innerText()).includes('全体') && (await page.locator('[data-testid="home-memos-today"] [data-testid^="memo-row-"]').count()) === 2;
// ③ 先の日
await write(page, { pid: S.P2, text: T3, next: true }); M = await memos(page); const m3 = M.find(m => m.title === T3);
const todayN = await page.locator('[data-testid="home-memos-today"] [data-testid^="memo-row-"]').count();
const upTxt = await page.getByTestId('home-memos-upcoming').innerText(); await page.getByTestId('home-memos-upcoming').click(); await page.waitForTimeout(300);
const upList = await page.getByTestId('home-memos-upcoming-list').innerText();
console.log('③', m3 && m3.date, '今日の数', todayN, upTxt, JSON.stringify(upList.split('\n').slice(0, 3)));
r.future = !!m3 && m3.date === tomorrow && todayN === 2 && /これからの申し送り 1件/.test(upTxt) && upList.includes(T3) && /^あす /.test(upList);
// ④ あすにも出す
const nb = page.getByTestId(`memo-next-${m1.id}`); const nbTxt0 = await nb.innerText(); await nb.click(); await page.waitForTimeout(900);
M = await memos(page); const c1 = M.find(m => m.copyOf === m1.id);
const nbTxt1 = await page.getByTestId(`memo-next-${m1.id}`).innerText(); const nbDis = await page.getByTestId(`memo-next-${m1.id}`).isDisabled();
console.log('④', nbTxt0, '→', nbTxt1, nbDis, JSON.stringify(c1 && { date: c1.date, fromDate: c1.fromDate, spId: c1.spId || null }));
r.copy = nbTxt0 === 'あすにも出す' && !!c1 && c1.date === tomorrow && c1.fromDate === S.iso && !c1.spId && c1.title === T1 && nbTxt1 === 'あすにも出しています' && nbDis;
// ⑤ 直す
await page.getByTestId(`memo-edit-${m1.id}`).click(); await page.waitForTimeout(400);
const spDone = await page.getByTestId('memo-sp-done').count(); await page.getByTestId('memo-text').fill(T1b); await page.getByTestId('memo-save').click(); await page.waitForTimeout(900);
M = await memos(page); D = await data(page); sp = ((D.patients.find(p => p.id === S.P).personalFile || {}).supportProgress || []).filter(x => x.memoId === m1.id);
r.edit = spDone === 1 && M.find(m => m.id === m1.id).title === T1b && sp.length === 1 && sp[0].content === T1 && (await page.getByTestId(`memo-text-${m1.id}`).innerText()) === T1b;
// ⑥ 今日の予定にメモが混ざらない
const evTxt = await page.locator('[data-testid="home-today-events"]').innerText().catch(() => '');
r.homeEvents = evTxt.includes('見本の予定') && !evTxt.includes('見本の申し送り') && !evTxt.includes('見本の全体連絡');
// ⑦ カレンダー
await go(page, 'schedule');
const chip = await page.getByTestId(`sch-memo-chip-${S.iso}`).innerText().catch(() => '');
const dayRows = await page.locator('[data-testid="sch-day-memos"] [data-testid^="memo-row-"]').count();
const occ = await page.evaluate((t) => document.body.innerText.split(t).length - 1, T1b);
console.log('⑦ マス', chip, 'その日の申し送り', dayRows, '本文が出ている数', occ);
r.cal = chip === '申し送り 2' && dayRows === 2 && occ === 1;
const clicked = await page.evaluate(() => { const bs = [...document.querySelectorAll('button')].filter(x => x.innerText.trim() === '削除' && !x.closest('[data-testid="sch-day-memos"]')); const bt = bs.find(x => { const row = x.parentElement; return row && row.innerText.includes('見本の予定'); }); if (!bt) return false; bt.click(); return true; }); await page.waitForTimeout(900);
D = await data(page); const evLeft = (D.scheduleEvents || []).filter(e => e.kind !== 'memo'); M = await memos(page);
console.log('⑦ 予定を消した後: 予定', evLeft.length, '(前', S.ev0, ') メモ', M.length, '墓石', !!(D.deletedIds && D.deletedIds.scheduleEvents && D.deletedIds.scheduleEvents.ev_chk_keep));
r.calDel = clicked && evLeft.length === S.ev0 - 1 && !evLeft.some(e => e.id === 'ev_chk_keep') && M.length === 4;
// ⑧ 提供記録入力
await go(page, 'record', { ampm: 'AM' });
const badge = await page.getByTestId(`rv-memo-${S.P}`).count(); const badge2 = await page.getByTestId(`rv-memo-${S.P2}`).count();
if (badge) { await page.getByTestId(`rv-memo-${S.P}`).first().click(); await page.waitForTimeout(500); }
const ptm = await page.getByTestId('pt-memos').innerText().catch(() => '');
console.log('⑧ 印', badge, '(先の日の方', badge2, ')', JSON.stringify(ptm.split('\n').slice(0, 2)));
r.record = badge >= 1 && badge2 === 0 && ptm.includes(T1b) && /申し送り（/.test(ptm);
// ⑨ 削除
await go(page, 'dashboard'); await page.getByTestId(`memo-edit-${m2.id}`).click(); await page.waitForTimeout(400); await page.getByTestId('memo-del').click(); await page.waitForTimeout(900);
D = await data(page); M = await memos(page);
r.del = !M.some(m => m.id === m2.id) && !!(D.deletedIds && D.deletedIds.scheduleEvents && D.deletedIds.scheduleEvents[m2.id]) && (await page.getByTestId(`memo-row-${m2.id}`).count()) === 0;
await b.close();
// ⑩ 予定の通知(前日の17時)にメモを数えない
{ const { planStore } = await import(new URL('../api/_push_plan.js', import.meta.url).href);
  const now = Date.UTC(2026, 9, 30, 8, 30); // 10/30 17:30(日本時間)
  const its = planStore({ storeId: 's', events: [{ id: 'a', date: '2026-10-31', start: '10:00', color: '#3b82f6' }, { id: 'm', kind: 'memo', date: '2026-10-31', title: 'x', color: '#f97316' }], colorLabels: [], cfg: null }, now, {});
  const d1 = its.find(x => x.kind === 'dayBefore'); console.log('⑩', d1 && d1.title); r.push = !!d1 && /1件/.test(d1.title); }
// ⑪ スマホ ⑫ iPad
for (const [lab, vp, ua] of [['スマホ', { width: 390, height: 844 }, 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1'], ['iPad', { width: 1080, height: 810 }, 'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1']]) {
  const b2 = await webkit.launch(); const pg = await (await b2.newContext({ viewport: vp, screen: vp, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', isMobile: true, hasTouch: true, userAgent: ua })).newPage(); pg.on('dialog', d => d.accept());
  await pg.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await pg.waitForTimeout(800);
  if (await pg.getByText('担当者を選択', { exact: false }).count()) { await pg.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await pg.waitForTimeout(800); }
  const S2 = await seed(pg); await go(pg, 'dashboard');
  await pg.getByTestId('home-memo-add').click(); await pg.waitForTimeout(500);
  const ed = await pg.evaluate(() => { const e = document.querySelector('[data-testid="memo-editor"] > div'); const t = document.querySelector('[data-testid="memo-text"]'); const s = document.querySelector('[data-testid="memo-save"]'); const pt = document.querySelector('[data-testid="memo-pt"]'); const rc = e.getBoundingClientRect();
    return { w: Math.round(rc.width), left: Math.round(rc.left), fs: getComputedStyle(t).fontSize, saveH: Math.round(s.getBoundingClientRect().height), ptH: Math.round(pt.getBoundingClientRect().height), ptFs: getComputedStyle(pt).fontSize }; });
  await pg.getByTestId('memo-pt').selectOption(String(S2.P)); await pg.getByTestId('memo-text').fill(T1); await pg.getByTestId('memo-save').tap(); await pg.waitForTimeout(900);
  const row = await pg.evaluate(() => { const r = document.querySelector('[data-testid="home-memos-today"] [data-testid^="memo-row-"]'); if (!r) return null; const t = r.querySelector('[data-testid^="memo-text-"]'); const bs = [...r.querySelectorAll('button')].map(b => Math.round(b.getBoundingClientRect().height)); const add = document.querySelector('[data-testid="home-memo-add"]');
    return { fs: getComputedStyle(t).fontSize, btnH: bs, addH: Math.round(add.getBoundingClientRect().height), sw: document.documentElement.scrollWidth, hs: (document.querySelector('[data-testid="home-scroll"]') || {}).scrollWidth, hc: (document.querySelector('[data-testid="home-scroll"]') || {}).clientWidth }; });
  console.log(lab, '書く画面', JSON.stringify(ed), '行', JSON.stringify(row));
  if (lab === 'スマホ') r.phone = ed.w === 390 && ed.fs === '16px' && ed.saveH >= 44 && ed.ptH >= 44 && ed.ptFs === '16px' && !!row && row.fs === '16px' && row.btnH.every(h => h >= 44) && row.addH >= 44 && row.sw <= 390 && row.hs <= row.hc;
  else r.ipad = ed.w === 480 && Math.abs(ed.left - (1080 - 480) / 2) <= 2 && ed.fs === '16px' && ed.ptFs === '16px' && ed.ptH >= 40 && ed.saveH >= 40 && !!row && row.btnH.every(h => h >= 40) && row.sw <= 1080;
  await b2.close(); }
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
