// 2026-10-30(試験版) ユーザー要望のまとめ
//   ①カレンダーの予定・タスクに「複製」: 押すと緑の帯 → 日を押すと写し(続けて何日でも)・同じ日にもう一度は作らない・「終わる」で戻る
//     写しは1回分(繰り返しなし)・タスクの済みは引き継がない・ご家族へのお知らせは配信しない(notify:false)・日付で選ぶ・パソコンは札をドラッグ
//   ②「追加」→「＋ 予定」 ③スマホの帯: ドラッグの札なし・日を押すと写し・横にはみ出さない・押す所44px・日付の欄16px
//   ④スマホの送迎表: 送りの車の名前を出さない(徒歩は出す)・送りの時間は入れた方だけ待ち合わせ場所の右に「送 12:30」(目安は「頃」)・「送りの時間 非表示」なら出さない
//   ⑤戻るボタンの「←」をなくした(分析（個人）の「一覧に戻る」・スマホは「一覧」)・ほかの戻る/閉じるの矢印も
//   実行: node scripts/chk_1030copy.mjs [--port 4175]
import { chromium, webkit } from 'playwright';
import { readFileSync } from 'node:fs';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4175'; })();
const r = {};
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const enter = async (page) => { await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); } };
const go = async (page, view, extra) => { await page.evaluate(([v, x]) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: null, t: Date.now(), ...(x || {}) })), [view, extra]); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 400 }).catch(() => {}); };
const data = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('daycareAppData_v3')));
const seedCal = (page) => page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const t = new Date(); const iso = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [] }; d.holidays = [];
  const P = d.patients.find(p => p.status === '利用中' && !p.endDate);
  d.scheduleEvents = [
    { id: 'ev_c1', date: iso, start: '10:00', end: '11:00', title: '見本の会議', note: '', color: '#3b82f6', patientId: P.id, notify: true, _savedAt: Date.now() },
    { id: 'tk_c1', kind: 'task', date: iso, start: '', end: '', title: '見本の締めのタスク', note: '', color: '#059669', repeat: 'weekly', repeatEvery: 1, done: { [iso]: { by: '見本 職員', at: 1 } }, notify: false, _savedAt: Date.now() },
  ];
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0');
  sessionStorage.setItem('tsumugiActiveRecorder', JSON.stringify({ id: 'demo_rec', name: '見本 職員', roleLabel: '介護職員' }));
  return { iso, P: P.id }; });
const copiesOf = async (page, id) => ((await data(page)).scheduleEvents || []).filter(e => e.copyOf === id);
// 今の月の日で、今日と違う日を2つ(週の繰り返しのタスクと重ならない日)
const pickDays = (page, iso) => page.evaluate((iso) => { const t = new Date(`${iso}T00:00:00`); const all = [...document.querySelectorAll('[data-testid="sch-month-grid"] [data-ds]')].map(x => x.getAttribute('data-ds')).filter(ds => ds.slice(0, 7) === iso.slice(0, 7) && ds !== iso && Math.round((new Date(`${ds}T00:00:00`) - t) / 86400000) % 7 !== 0); return [all[0], all[all.length - 1]]; }, iso);

// ===== ①② パソコン =====
{ const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
  const alerts = []; page.on('dialog', d => { alerts.push(d.message()); d.accept(); }); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  await enter(page); const S = await seedCal(page); await go(page, 'schedule');
  r.addLabel = (await page.getByTestId('sch-event-add').innerText()).trim() === '＋ 予定' && (await page.getByTestId('sch-task-add').innerText()).trim() === '＋ タスク';
  const [A, B] = await pickDays(page, S.iso);
  await page.getByTestId('sch-copy-ev_c1').click(); await page.waitForTimeout(300);
  const bar = await page.getByTestId('sch-copy-bar').innerText(); const hasDrag = await page.getByTestId('sch-copy-drag').count();
  await page.locator(`[data-testid="sch-month-grid"] [data-ds="${A}"]`).click(); await page.waitForTimeout(600);
  await page.locator(`[data-testid="sch-month-grid"] [data-ds="${B}"]`).click(); await page.waitForTimeout(600);
  await page.locator(`[data-testid="sch-month-grid"] [data-ds="${A}"]`).click(); await page.waitForTimeout(600); // 同じ日にもう一度 → 作らない
  let C = await copiesOf(page, 'ev_c1'); const stillBar = await page.getByTestId('sch-copy-bar').count();
  console.log('① 帯', JSON.stringify(bar.split('\n')[0]), 'ドラッグの札', hasDrag, '写し', JSON.stringify(C.map(e => ({ date: e.date, start: e.start, notify: e.notify, pid: e.patientId, rep: e.repeat || null }))), 'お知らせ', JSON.stringify(alerts));
  r.tapCopy = /「見本の会議」を複製しています/.test(bar) && hasDrag === 1 && C.length === 2 && C.map(e => e.date).sort().join() === [A, B].sort().join() && C.every(e => e.start === '10:00' && e.end === '11:00' && e.notify === false && e.patientId === S.P && !e.repeat && e.id !== 'ev_c1' && e.title === '見本の会議') && stillBar === 1 && alerts.some(m => /すでにあります/.test(m));
  const D0 = await data(page); r.noAnnounce = !(D0.familyPersonalAnnouncements || []).some(a => C.some(e => a._fromSchedule === e.id));
  await page.getByTestId('sch-copy-end').click(); await page.waitForTimeout(300);
  await page.locator(`[data-testid="sch-month-grid"] [data-ds="${B}"]`).click(); await page.waitForTimeout(500);
  r.endCopy = (await page.getByTestId('sch-copy-bar').count()) === 0 && (await copiesOf(page, 'ev_c1')).length === 2 && (await page.locator(`[data-ds="${B}"]`).getAttribute('data-sel')) === '1';
  // タスク: 予定の確認の画面から複製 → 日付で選ぶ(来月) → 札をドラッグ
  await page.locator(`[data-testid="sch-month-grid"] [data-ds="${S.iso}"] div[title^="見本の締めのタスク"]`).click(); await page.waitForTimeout(400);
  await page.getByTestId('sch-evd-copy').click(); await page.waitForTimeout(300);
  const bar2 = await page.getByTestId('sch-copy-bar').innerText();
  const far = await page.evaluate((iso) => { const t = new Date(`${iso}T00:00:00`); t.setDate(t.getDate() + 40); const s = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; return s; }, S.iso);
  await page.getByTestId('sch-copy-date').fill(far); await page.getByTestId('sch-copy-date-go').click(); await page.waitForTimeout(700);
  const farCell = await page.locator(`[data-testid="sch-month-grid"] [data-ds="${far}"]`).innerText().catch(() => '');
  const near = await page.evaluate(([far, iso]) => { const t = new Date(`${iso}T00:00:00`); const all = [...document.querySelectorAll('[data-testid="sch-month-grid"] [data-ds]')].map(x => x.getAttribute('data-ds')).filter(ds => ds.slice(0, 7) === far.slice(0, 7) && ds !== far && Math.round((new Date(`${ds}T00:00:00`) - t) / 86400000) % 7 !== 0); return all[Math.floor(all.length / 2)]; }, [far, S.iso]); // 週の繰り返しの日は避ける
  await page.dragAndDrop('[data-testid="sch-copy-drag"]', `[data-testid="sch-month-grid"] [data-ds="${near}"]`); await page.waitForTimeout(700);
  C = await copiesOf(page, 'tk_c1');
  console.log('① タスク 帯', JSON.stringify(bar2.split('\n').slice(0, 2)), '写し', JSON.stringify(C.map(e => ({ date: e.date, kind: e.kind, rep: e.repeat || null, done: e.done || null }))), '来月のマス', JSON.stringify(farCell.slice(0, 30)));
  r.taskCopy = /写しは1回分です/.test(bar2) && C.length === 2 && C.some(e => e.date === far) && C.some(e => e.date === near) && C.every(e => e.kind === 'task' && !e.repeat && !e.done && e.color === '#059669') && farCell.includes('見本の締めのタスク');
  const tk = ((await data(page)).scheduleEvents || []).find(e => e.id === 'tk_c1'); r.srcKept = !!tk && tk.repeat === 'weekly' && !!tk.done;
  await page.getByTestId('sch-copy-end').click(); await page.waitForTimeout(200);
  // ⑤ 分析（個人）の一覧に戻る(パソコン)
  await go(page, 'dash_personal', { pid: S.P }); const backPc = await page.locator('.tsu-o-back').first().innerText().catch(() => '(なし)');
  console.log('⑤ パソコン', JSON.stringify(backPc)); r.backPc = backPc.trim() === '一覧に戻る';
  await b.close(); }

// ===== ③ スマホ(タップ) =====
{ const b = await webkit.launch(); const vp = { width: 390, height: 844 };
  const page = await (await b.newContext({ viewport: vp, screen: vp, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1' })).newPage(); page.on('dialog', d => d.accept());
  await enter(page); const S = await seedCal(page); await go(page, 'schedule');
  const [A] = await pickDays(page, S.iso);
  await page.getByTestId('sch-copy-ev_c1').tap(); await page.waitForTimeout(500);
  const m = await page.evaluate(() => { const bar = document.querySelector('[data-testid="sch-copy-bar"]'); const i = document.querySelector('[data-testid="sch-copy-date"]'); const hs = ['sch-copy-end', 'sch-copy-date-go'].map(t => Math.round(document.querySelector(`[data-testid="${t}"]`).getBoundingClientRect().height)); const rc = bar.getBoundingClientRect();
    return { right: Math.round(rc.right), top: Math.round(rc.top), drag: !!document.querySelector('[data-testid="sch-copy-drag"]'), fs: getComputedStyle(i).fontSize, ih: Math.round(i.getBoundingClientRect().height), hs, sw: document.documentElement.scrollWidth, txt: bar.innerText.split('\n').slice(0, 2) }; });
  await page.locator(`[data-testid="sch-month-grid"] [data-ds="${A}"]`).tap(); await page.waitForTimeout(700);
  const C = await copiesOf(page, 'ev_c1'); console.log('③ スマホ', JSON.stringify(m), '写し', JSON.stringify(C.map(e => e.date)));
  r.phone = !m.drag && m.right <= vp.width && m.sw <= vp.width && m.fs === '16px' && m.ih >= 44 && m.hs.every(h => h >= 44) && /日を押してください/.test(m.txt.join()) && C.length === 1 && C[0].date === A && m.top >= 0 && m.top < vp.height;
  await go(page, 'dash_personal', { pid: S.P }); const backPh = await page.locator('.tsu-o-back').first().innerText().catch(() => '(なし)');
  console.log('⑤ スマホ', JSON.stringify(backPh)); r.backPhone = backPh.trim() === '一覧';
  await b.close(); }

// ===== ④ スマホの送迎表 =====
{ const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 393, height: 800 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept());
  await enter(page);
  const seedTp = (shown) => page.evaluate((shown) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const t = new Date(); const iso = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; const dow = t.getDay();
    d.systemSettings = d.systemSettings || {}; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [] }; d.holidays = []; d.systemSettings.tpDropShown = shown;
    d.diarySettings = d.diarySettings || {}; d.diarySettings.cars = [{ id: 'c1', name: '1号車', type: '', cap: '8' }, { id: 'c2', name: '2号車', type: '', cap: '8' }];
    const act = d.patients.filter(p => p.status === '利用中' && !p.endDate).slice(0, 6); act.forEach((p, i) => { p.scheduleAmPm = ['', '', '', '', '', '', '']; p.scheduleAmPm[dow] = 'AM'; p.pauseHistory = []; p.scheduleChangeHistory = []; p.pickupPlace = i < 2 ? '玄関前' : ''; });
    const id = (i) => act[i].id; const M = (i, tm) => ({ pid: id(i), t: tm });
    d.transportPlans = { [`${iso}_AM`]: { cars: { c1: [M(0, '8:30'), M(1, '8:35'), M(2, '8:40')], c2: [M(3, '8:31'), M(4, '8:36'), M(5, '8:41')] }, walkers: [], others: [], un: [],
      dropMode: 'custom', drop: { cars: { c1: [{ pid: id(1) }, { pid: id(2) }], c2: [{ pid: id(0) }, { pid: id(4) }, { pid: id(5) }] }, walkers: [{ pid: id(3) }], others: [] },
      dropAt: { [String(id(0))]: '12:24', [String(id(1))]: '12:30', [String(id(4))]: '12:40' }, dropAtAuto: { [String(id(4))]: true }, _savedAt: Date.now() } };
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); return { iso, ids: act.map(p => p.id) }; }, shown);
  const open = async () => { await go(page, 'transport'); await page.getByTestId('tp-drive-ok').click({ timeout: 800 }).catch(() => {}); await page.waitForTimeout(300); await page.getByTestId('tp-phone-ap-AM').click().catch(() => {}); await page.waitForTimeout(300); };
  let T = await seedTp(true); await open();
  const rowOf = (pid) => page.evaluate(([iso, pid]) => { const el = document.querySelector(`[data-testid="tp-dl-${iso}-AM-${pid}"]`); if (!el) return null; const da = el.querySelector(`[data-testid="tp-dl-dat-${iso}-AM-${pid}"]`); const tg = el.querySelector(`[data-testid="tp-dl-tag-${iso}-AM-${pid}"]`);
    return { txt: el.innerText.replace(/\n/g, ' '), dat: da ? da.innerText : '', afterPlace: !!da && !!da.previousElementSibling && da.previousElementSibling.getAttribute('title') === '待ち合わせ場所', tag: tg ? tg.innerText : '' }; }, [T.iso, pid]);
  const R = []; for (const pid of T.ids) R.push(await rowOf(pid));
  const list = await page.getByTestId('tp-day-list').innerText();
  console.log('④', JSON.stringify(R.map(x => x && { dat: x.dat, afterPlace: x.afterPlace, tag: x.tag })));
  r.tpNoCar = !/送[12]号車/.test(list) && R.every(x => x && !/[12]号車/.test(x.tag));
  r.tpDropAt = R[0].dat === '送 12:24' && R[0].afterPlace && R[1].dat === '送 12:30' && R[1].afterPlace && R[2].dat === '' && R[4].dat === '送 12:40頃' && R[3].tag === '送徒歩';
  T = await seedTp(false); await open();
  r.tpHidden = (await page.locator('[data-testid^="tp-dl-dat-"]').count()) === 0 && (await page.locator(`[data-testid="tp-dl-${T.iso}-AM-${T.ids[0]}"]`).count()) === 1;
  await b.close(); }

// ⑤ 戻る・閉じるのボタンに矢印が残っていない(元の文)
{ const src = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf-8');
  const left = src.split('\n').filter(l => !/^\s*\/\//.test(l) && (/←\s*(<span[^>]*>)?[^\s<]*(戻る|一覧に|閉じる)/.test(l) || /<ArrowLeft[^>]*\/>\s*戻る/.test(l) || /<ChevronLeft[^>]*\/>\s*(閉じる|戻る)/.test(l)));
  console.log('⑤ 矢印の残り', left.length, left.map(l => l.trim().slice(0, 80))); r.noArrow = left.length === 0; }
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
