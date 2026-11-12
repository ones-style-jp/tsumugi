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
ok(/休み連絡がまだの方/.test(await box.innerText()) && /1名/.test(await page.getByTestId('home-absence-pending').innerText()), '見出しに「休み連絡がまだの方」・1名');
const rowA = page.getByTestId(`home-absence-row-${info.a}`), rowB = page.getByTestId(`home-absence-row-${info.b}`);
ok(/未連絡/.test(await rowA.innerText()) && (await rowB.count()) === 0, 'A=未連絡 の札・B(連絡済)は出ない(trial567)');
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
// ④ trial568: メニューは右上の3本線 → サイドバー(右)・右上に「変更ログ」は無い・サイドバーの下に「変更ログ」・下のバーは ホーム/送迎表/提供記録/利用者/自由枠
{ const mb = await page.getByTestId('hdr-menu-btn').boundingBox(); ok(mb && mb.x + mb.width >= 390 - 20 && mb.y < 60, `3本線は右上 (x=${mb && Math.round(mb.x)})`);
  ok(!(await page.locator('header.tsu-app-header button', { hasText: /^変更ログ$/ }).count()), '右上の「変更ログ」は無い');
  await page.getByTestId('hdr-menu-btn').click(); await page.waitForTimeout(500);
  const sb = page.getByTestId('app-sidebar'); const bb = await sb.boundingBox(); ok(bb && bb.x > 100, '3本線でサイドバーが右から出る');
  ok((await sb.locator('button', { hasText: /^変更ログ$/ }).count()) === 1, 'サイドバーに「変更ログ」');
  await sb.locator('button', { hasText: /^変更ログ$/ }).click(); await page.waitForTimeout(600);
  ok(/変更ログ/.test(await page.locator('body').innerText()) && (!(await sb.boundingBox()) || (await sb.boundingBox()).x >= 389), '押すと変更ログが開きサイドバーは閉じる');
  await page.keyboard.press('Escape'); await page.locator('button:visible', { hasText: /^(閉じる|×)$/ }).first().click({ timeout: 800 }).catch(() => {}); await page.waitForTimeout(300);
  const labels = await page.locator('.tsu-tabbar > button .lbl').allInnerTexts(); ok(labels.length === 5 && labels[3] === '利用者' && !labels.includes('メニュー'), `下のバー: ${labels.join('/')}`); }
// ⑥ 見出しの日付・挨拶なし・0は出さない(trial567)
ok(/ホーム\s*\d{1,2}月\d{1,2}日（[日月火水木金土]）/.test((await title()).replace(/\n/g, ' ')), `見出しに日付 (${(await title()).replace(/\n/g, ' ').trim()})`);
ok(!(await page.getByText('今日もよろしくお願いします', { exact: false }).count()), '挨拶の文は出ない');
{ const sub = await page.getByTestId('home-today-am').innerText(); ok(!/[^\d]0(?!\d)/.test(sub.replace(/\d+名/, '')), `午前の内訳に 0 の項目がない (${sub.replace(/\n/g, ' ')})`); }
ok(!(await page.evaluate(() => { const h = document.querySelector('[data-testid="home-hero"] > div'); return h && /gradient/.test(getComputedStyle(h).backgroundImage); })), '上の帯は紫のグラデーションではない');
// ⑦ 連絡帳: 操作の小窓 → 印刷設定 が画面の中に見える
await page.getByTestId('tsu-tab-record').click(); await page.waitForTimeout(900);
await page.getByTestId('tsu-pair-print').click(); await page.waitForTimeout(1200);
await page.getByTestId('fold-btn-renraku').click(); await page.waitForTimeout(400);
{ const sh = await page.locator('.tsu-fold-sheet').boundingBox(); ok(sh && sh.y > 30 && sh.y < 200, `操作の小窓は上(帯のすぐ下)から出る (y=${sh && Math.round(sh.y)})(trial568)`);
  ok((await page.getByTestId('tsu-pair-menu').count()) === 1, '提供記録/連絡帳の見出しにも右上の3本線'); }
await page.locator('[data-testid="fold-body-renraku"] button', { hasText: /^印刷設定$/ }).click(); await page.waitForTimeout(500);
{ const ps = page.getByTestId('cb-print-settings'); const bb = await ps.boundingBox(); const sh = await page.locator('.tsu-fold-sheet').boundingBox();
  ok(bb && bb.y >= 0 && bb.y + bb.height <= 844 && bb.width > 300, `印刷設定が画面の中に出る (y=${bb && Math.round(bb.y)} h=${bb && Math.round(bb.height)})`);
  ok(sh && bb && bb.y >= sh.y + sh.height - 2, `印刷設定は操作の小窓の下に続く (小窓の下端 ${sh && Math.round(sh.y + sh.height)} ≤ 印刷設定の上端 ${bb && Math.round(bb.y)})`);
  ok(await page.getByTestId('cb-timecolor-red').isVisible() && (await page.getByTestId('cb-timecolor-red').boundingBox()).y < 844, '印刷設定の中のボタンが押せる位置にある');
  await page.getByTestId('cb-print-settings-wrap').click({ position: { x: 10, y: 10 } }); await page.waitForTimeout(300); ok((await ps.count()) === 0, '外を押すと閉じる'); }
// ⑧ モニタリング: 絞り込み/並び替えも画面の中
await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'monitoring', pid: null, t: Date.now() })));
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 400 }).catch(() => {});
await page.getByTestId('fold-btn-monitoring').click(); await page.waitForTimeout(400);
await page.locator('[data-testid="fold-body-monitoring"] button', { hasText: /^絞り込み/ }).click(); await page.waitForTimeout(400);
{ const pop = page.getByTestId('tsu-phone-pop'); const inner = pop.locator('.tsu-phone-pop > *').first(); const bb = await inner.boundingBox();
  ok(bb && bb.y >= 0 && bb.y + bb.height <= 844, `モニタリングの絞り込みが画面の中に出る (y=${bb && Math.round(bb.y)} h=${bb && Math.round(bb.height)})`);
  await pop.click({ position: { x: 10, y: 10 } }); await page.waitForTimeout(300); ok((await pop.count()) === 0, '外を押すと閉じる(絞り込み)'); }
await page.locator('[data-testid="fold-body-monitoring"] button', { hasText: /^並び替え/ }).click(); await page.waitForTimeout(400);
{ const pop = page.getByTestId('tsu-phone-pop'); const bb = await pop.locator('.tsu-phone-pop > *').first().boundingBox();
  ok(bb && bb.y >= 0 && bb.y + bb.height <= 844, `並び替えも画面の中 (y=${bb && Math.round(bb.y)} h=${bb && Math.round(bb.height)})`);
  await pop.click({ position: { x: 10, y: 10 } }); await page.waitForTimeout(300); }
// ⑤ 表示設定で消せる
await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.systemSettings = d.systemSettings || {}; d.systemSettings.homeTasks = { ...(d.systemSettings.homeTasks || {}), absence: { on: false } }; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'dashboard', pid: null, t: Date.now() })); });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 400 }).catch(() => {});
ok((await page.getByTestId('home-absence').count()) === 0, 'ホームの表示設定で absence を切ると出ない');
await b.close(); console.log(fails ? `FAIL ${fails}` : 'ALL PASS'); process.exit(fails ? 1 : 0);
