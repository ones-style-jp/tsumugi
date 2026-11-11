// 2026-11-12 trial566: スマホ ①ホーム「本日のお休み」(休み連絡の状態・押すと送付状) ②今日の予定の小窓を左右スワイプで週/月送り ③小窓の × は枠の中央 ④メニューの × は右上
//   node chk/chk_1112phone3.mjs [port]
import { chromium } from 'playwright';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => { console.log('PAGEERROR', e.message.slice(0, 200)); fails++; });
const swipe = (x1, y1, x2, y2) => page.evaluate(([x1, y1, x2, y2]) => { const el = document.elementFromPoint(x1, y1) || document.body; const mk = (type, x, y) => { const t = new Touch({ identifier: 1, target: el, clientX: x, clientY: y, pageX: x, pageY: y }); return new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true }); }; el.dispatchEvent(mk('touchstart', x1, y1)); el.dispatchEvent(mk('touchend', x2, y2)); }, [x1, y1, x2, y2]);
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(900); }
// 今日の欠席を2名: A=休み連絡なし・B=連絡済(printed)
const info = await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const act = (d.patients || []).filter(x => x.status === '利用中');
  const t = new Date(); const dd = `${t.getMonth() + 1}月${t.getDate()}日`; const iso = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  const A = act[0], B = act[1];
  d.ticketRecords = (d.ticketRecords || []).filter(r => !(r && r.date === dd && r.year === t.getFullYear() && (r.patientId === A.id || r.patientId === B.id)))
    .concat([{ id: 'absA', patientId: A.id, date: dd, year: t.getFullYear(), status: '欠席', tokki: '' }, { id: 'absB', patientId: B.id, date: dd, year: t.getFullYear(), status: '欠席', tokki: '' }]);
  d.faxDataStore = { [`${iso}_${B.id}`]: { status: 'printed', reason: '体調不良' } };
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); localStorage.setItem('tsumugiTpDriveAck', String(Date.now())); localStorage.removeItem('tsuFold_homeAbs');
  sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'dashboard', pid: null, t: Date.now() }));
  return { a: A.id, b: B.id, an: A.name, bn: B.name, iso };
});
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1600); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 400 }).catch(() => {});
const title = () => page.locator('header.tsu-app-header h1').innerText();
// ① ホームの本日のお休み
const box = page.getByTestId('home-absence');
ok(await box.count() === 1, 'ホームに「本日のお休み」の枠が出る');
ok((await box.getAttribute('data-pending')) === '1', '休み連絡が未の方は1名');
ok(/本日のお休み 2名/.test(await box.innerText()) && /休み連絡 未 1名/.test(await box.innerText()), '見出しに 2名・未 1名');
const rowA = page.getByTestId(`home-absence-row-${info.a}`), rowB = page.getByTestId(`home-absence-row-${info.b}`);
ok(/未連絡/.test(await rowA.innerText()) && /連絡済/.test(await rowB.innerText()), 'A=未連絡・B=連絡済 の札');
await page.getByTestId('home-absence-fold').click(); await page.waitForTimeout(200);
ok((await box.getAttribute('data-collapsed')) === '1' && (await rowA.count()) === 0, '折りたたむと名前は隠れる');
await page.getByTestId('home-absence-fold').click(); await page.waitForTimeout(200);
await rowA.click(); await page.waitForTimeout(1200);
ok(/休み連絡/.test(await title()), `A を押すと休み連絡へ (${(await title()).trim()})`);
ok((await page.locator('button:visible', { hasText: /^カレンダーに戻る$/ }).count()) === 1, 'A の送付状が開いている(カレンダーに戻る が出る)');
ok(new RegExp(info.an.replace(/\s+/g, '\\s*')).test(await page.locator('body').innerText()), '送付状に A の名前');
// 戻る(左端から右へ)でホーム
await swipe(8, 500, 160, 505); await page.waitForTimeout(1000);
ok(/ホーム/.test(await title()), '左端から右へ → ホームへ戻る');
// ② 今日の予定: 左右スワイプで週/月送り
const hdr = await page.locator('header.tsu-app-header').boundingBox();
await swipe(200, Math.round(hdr.y + 20), 205, Math.round(hdr.y + 140)); await page.waitForTimeout(700);
const sheet = page.getByTestId('tsu-today-sheet');
ok(await sheet.isVisible(), '上の帯を下へ引く → 今日の予定');
await page.getByTestId('tsu-today-mode-week').click(); await page.waitForTimeout(200);
const firstDay = async () => (await page.locator('[data-testid^="tsu-today-day-"]').first().getAttribute('data-testid')).replace('tsu-today-day-', '');
const d0 = await firstDay();
const wk = await page.getByTestId('tsu-today-week').boundingBox();
await swipe(300, Math.round(wk.y + 20), 120, Math.round(wk.y + 24)); await page.waitForTimeout(400);
const d1 = await firstDay();
const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
ok(d1 === addDays(d0, 7), `週で左へスワイプ → 次の週 (${d0} → ${d1})`);
ok((await page.getByTestId('tsu-today-today').count()) === 1, '「今日」ボタンが出る(選んだ日が動いた)');
await swipe(120, Math.round(wk.y + 20), 300, Math.round(wk.y + 24)); await page.waitForTimeout(400);
ok((await firstDay()) === d0, '右へスワイプ → 元の週');
ok(/ホーム/.test(await title()), '小窓の横スワイプで後ろの画面は切り替わらない');
await page.getByTestId('tsu-today-mode-month').click(); await page.waitForTimeout(300);
const monLabel = () => page.getByTestId('tsu-today-sheet').locator('span', { hasText: /^\d{4}年\d{1,2}月$/ }).first().innerText();
const m0 = await monLabel();
const mo = await page.getByTestId('tsu-today-month').boundingBox();
await swipe(300, Math.round(mo.y + 60), 120, Math.round(mo.y + 64)); await page.waitForTimeout(400);
const m1 = await monLabel();
ok(m1 !== m0 && (await page.getByTestId(`tsu-today-day-${info.iso}`).count()) === 0, `月で左へスワイプ → 次の月 (${m0} → ${m1})`);
await swipe(120, Math.round(mo.y + 60), 300, Math.round(mo.y + 64)); await page.waitForTimeout(400);
ok((await monLabel()) === m0, '右へスワイプ → 元の月');
await page.getByTestId('tsu-today-mode-week').click(); await page.waitForTimeout(200);
// ③ × は枠の中央
{ const btn = page.getByTestId('tsu-today-close'); const bb = await btn.boundingBox(); const sv = await btn.locator('svg').boundingBox();
  const dx = Math.abs((bb.x + bb.width / 2) - (sv.x + sv.width / 2)), dy = Math.abs((bb.y + bb.height / 2) - (sv.y + sv.height / 2));
  ok(dx <= 2 && dy <= 2, `小窓の × は枠の中央 (ずれ x=${dx.toFixed(1)} y=${dy.toFixed(1)})`);
  await btn.click(); await page.waitForTimeout(400); ok(!(await sheet.isVisible()), '× で閉じる'); }
// ④ メニューの × は右上
await page.getByTestId('tsu-tab-menu').click(); await page.waitForTimeout(500);
{ const cb = await page.getByTestId('tsu-phone-menu-close').boundingBox(); const tb = await page.locator('.tsu-phone-menu-head .ttl').boundingBox();
  ok(cb && cb.x + cb.width >= 390 - 16 && cb.y < 80, `メニューの × は右上 (x=${cb && Math.round(cb.x)} y=${cb && Math.round(cb.y)})`);
  ok(tb && tb.x < cb.x, '題名「メニュー」は × より左');
  await page.getByTestId('tsu-phone-menu-close').click(); await page.waitForTimeout(400);
  ok((await page.getByTestId('tsu-phone-menu').count()) === 0, '× でメニューが閉じる'); }
// ⑤ 表示設定で消せる
await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.systemSettings = d.systemSettings || {}; d.systemSettings.homeTasks = { ...(d.systemSettings.homeTasks || {}), absence: { on: false } }; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'dashboard', pid: null, t: Date.now() })); });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 400 }).catch(() => {});
ok((await page.getByTestId('home-absence').count()) === 0, 'ホームの表示設定で absence を切ると出ない');
await b.close(); console.log(fails ? `FAIL ${fails}` : 'ALL PASS'); process.exit(fails ? 1 : 0);
