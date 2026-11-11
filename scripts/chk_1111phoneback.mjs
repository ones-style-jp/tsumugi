// 2026-11-11 trial560: スマホ ①左端から右へスワイプ=前の画面に戻る(履歴・無ければホーム) ②上の帯を下へ引くと「今日の予定」(週の7日・予定・タスク・申し送り・上へ戻すと閉じる)
//   node chk/chk_1111phoneback.mjs [port]
import { chromium } from 'playwright';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => { console.log('PAGEERROR', e.message.slice(0, 200)); fails++; });
const swipe = (x1, y1, x2, y2) => page.evaluate(([x1, y1, x2, y2]) => { const el = document.elementFromPoint(x1, y1) || document.body; const mk = (type, x, y) => { const t = new Touch({ identifier: 1, target: el, clientX: x, clientY: y, pageX: x, pageY: y }); return new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true }); }; el.dispatchEvent(mk('touchstart', x1, y1)); el.dispatchEvent(mk('touchend', x2, y2)); }, [x1, y1, x2, y2]);
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(900); }
const today = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const t = new Date(); const iso = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; d.scheduleEvents = (d.scheduleEvents || []).filter(e => !String(e.id).startsWith('chk560_'));
  const pid = (d.patients.find(p => p.status === '利用中') || {}).id;
  d.scheduleEvents.push({ id: 'chk560_ev', date: iso, start: '10:30', end: '11:00', title: '検査の担当者会議', color: '#6366f1', patientId: pid, note: '' });
  d.scheduleEvents.push({ id: 'chk560_task', kind: 'task', date: iso, title: '検査のタスク（請求の確認）', color: '#059669', patientId: '', repeat: 'none', done: {} });
  d.scheduleEvents.push({ id: 'chk560_memo', kind: 'memo', date: iso, title: '検査の申し送り（午後は水分多め）', color: '#f97316', patientId: '', by: '検査', at: Date.now() });
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); localStorage.setItem('tsumugiTpDriveAck', String(Date.now()));
  sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'dashboard', pid: null, t: Date.now() })); return iso; });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1600); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 400 }).catch(() => {});
const title = () => page.locator('header.tsu-app-header h1').innerText();
ok(/ホーム/.test(await title()), `最初はホーム(${(await title()).trim()})`);
// ① 戻る: ホーム → 送迎表 → 日誌 → 左端から右へ → 送迎表 → もう一度 → ホーム → もう一度 → ホームのまま
await page.getByTestId('tsu-tab-transport').click(); await page.waitForTimeout(900); await page.getByTestId('tp-drive-ok').click({ timeout: 800 }).catch(() => {});
ok(/送迎表/.test(await title()), '送迎表へ');
await page.getByTestId('tsu-tab-diary').click(); await page.waitForTimeout(900);
ok(/日誌/.test(await title()), '日誌へ');
await swipe(8, 500, 160, 505); await page.waitForTimeout(900);
ok(/送迎表/.test(await title()), `左端から右へスワイプ → 1つ前(送迎表)に戻る(${(await title()).trim()})`);
await swipe(8, 500, 160, 505); await page.waitForTimeout(900);
ok(/ホーム/.test(await title()), `もう一度 → ホーム(${(await title()).trim()})`);
await swipe(8, 500, 160, 505); await page.waitForTimeout(600);
ok(/ホーム/.test(await title()), '履歴が無いときはホームのまま');
ok((await page.getByTestId('app-sidebar').getAttribute('data-side')) === 'right', 'サイドバーは右のまま(左端は戻るに使う)');
// 幅の広いスワイプ(端ではない)は戻らない
await page.getByTestId('tsu-tab-diary').click(); await page.waitForTimeout(900);
await swipe(120, 500, 300, 505); await page.waitForTimeout(700);
ok(/日誌/.test(await title()), '端ではない左→右スワイプでは戻らない(日誌のまま=日送り)');
// ①b trial562: 重なりがあれば、まずそれを閉じる(画面は変わらない)
await page.getByTestId('tsu-tab-menu').click(); await page.waitForTimeout(400);
await swipe(8, 500, 160, 505); await page.waitForTimeout(600);
ok((await page.getByTestId('tsu-phone-menu').count()) === 0 && /日誌/.test(await title()), 'メニューを開いていれば、左端からの戻るはメニューを閉じるだけ(日誌のまま)');
await swipe(384, 500, 240, 505); await page.waitForTimeout(700);
ok(/tsu-tabbar-hide/.test((await page.getByTestId('tsu-tabbar').getAttribute('class')) || ''), 'サイドバーを開く');
await swipe(8, 500, 160, 505); await page.waitForTimeout(700);
ok(!/tsu-tabbar-hide/.test((await page.getByTestId('tsu-tabbar').getAttribute('class')) || '') && /日誌/.test(await title()), 'サイドバーを開いていれば閉じるだけ(日誌のまま)');
// 自由枠を選ぶ小窓(メニューの下のボタンから)を開いて戻る → 小窓だけ閉じて画面はそのまま
await page.getByTestId('tsu-tab-menu').click(); await page.waitForTimeout(400); await page.getByTestId('tsu-phone-menu-tabpick').click(); await page.waitForTimeout(500);
{ const had = (await page.getByTestId('tsu-tabpick').count()) === 1; const before = (await title()).trim();
  await swipe(8, 500, 160, 505); await page.waitForTimeout(600);
  ok(had && (await page.getByTestId('tsu-tabpick').count()) === 0 && (await title()).trim() === before, `自由枠の小窓を開いて戻る → 小窓だけ閉じて画面はそのまま(${before})`); }
// ② 上の帯を下へ引く → 今日の予定
const hdr = await page.locator('header.tsu-app-header').boundingBox();
await swipe(200, Math.round(hdr.y + 20), 205, Math.round(hdr.y + 140)); await page.waitForTimeout(600);
const sheet = page.getByTestId('tsu-today-sheet');
ok((await sheet.count()) === 1, '上の帯を下へ引くと「今日の予定」の小窓が出る');
const tx = await sheet.innerText();
ok(/の予定/.test(tx) && (await page.locator('[data-testid^="tsu-today-day-"]').count()) === 7, '今日の日付と、この週の7日が出る');
ok(/検査の担当者会議/.test(tx) && /10:30〜11:00/.test(tx), '今日の予定(時間つき)が出る');
ok(/検査のタスク/.test(tx), '済んでいないタスクが出る');
ok(/検査の申し送り/.test(tx), '今日の申し送りが出る');
ok(/1件/.test(await page.getByTestId(`tsu-today-day-${today}`).innerText()), '今日の日に予定の件数(1件)');
await page.screenshot({ path: '/tmp/chk_1111phoneback_sheet.png' }).catch(() => {});
// 左端からの戻るでも閉じる(画面は変わらない)
{ const before = (await title()).trim(); await swipe(8, 500, 160, 505); await page.waitForTimeout(600);
  ok((await sheet.count()) === 0 && (await title()).trim() === before, '今日の予定が出ているときの戻るは小窓を閉じるだけ');
  await swipe(200, Math.round(hdr.y + 20), 205, Math.round(hdr.y + 140)); await page.waitForTimeout(600); }
// 上へ戻すと閉じる
const sb = await sheet.boundingBox();
await swipe(200, Math.round(sb.y + sb.height - 30), 205, Math.round(sb.y + 20)); await page.waitForTimeout(500);
ok((await sheet.count()) === 0, '上へ戻すと閉じる');
// 帯以外(本文)を下へ引いても出ない
await swipe(200, 400, 205, 560); await page.waitForTimeout(500);
ok((await sheet.count()) === 0, '本文を下へ引いても出ない');
// 日を押すとカレンダーのその日へ
await swipe(200, Math.round(hdr.y + 20), 205, Math.round(hdr.y + 140)); await page.waitForTimeout(600);
await page.getByTestId(`tsu-today-day-${today}`).click(); await page.waitForTimeout(1000);
ok(/カレンダー/.test(await title()), `日を押すとカレンダーへ(${(await title()).trim()})`);
ok((await sheet.count()) === 0, '小窓は閉じている');
await ctx.close(); await b.close();
console.log(fails ? `FAILS ${fails}` : 'ALL PASS'); process.exit(fails ? 1 : 0);
