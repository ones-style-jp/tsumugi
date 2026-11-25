// 2026-11-25 trial636 候補2(連絡帳 スマホ): 1人1行の一覧(cb-rows)・押すと下から紙(cb-sheet)・前後の方・スワイプ・✕/戻る/幕で閉じる・「全員の紙」に切替(この端末の設定)
//   使い方: node chk/chk_1125cblist.mjs 4175
import { chromium, devices } from 'playwright';
const PORT = process.argv[2] || '4175'; const BASE = `http://localhost:${PORT}`;
const b = await chromium.launch(); const R = []; const ok = (n, c, d) => { R.push([n, !!c]); console.log((c ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? ' ' + JSON.stringify(d) : '')); };
const boot = async (ctx, pre) => { const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  await page.evaluate((p) => { localStorage.setItem('tsumugiSidebarOpen', '0'); if (p) localStorage.setItem('tsuCbPhoneMode', p); else localStorage.removeItem('tsuCbPhoneMode'); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'print', pid: null, t: Date.now() })); }, pre || '');
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {}); return page; };

// ===== スマホ =====
{ const ctx = await b.newContext({ ...devices['iPhone 14'], locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await boot(ctx);
  const rows = page.locator('[data-testid^="cb-row-"]'); const n = await rows.count();
  ok('1 スマホは 1人1行の一覧(cb-rows)', await page.getByTestId('cb-rows').count() === 1 && n >= 2, { n });
  ok('2 全員の紙(renraku-phone-list)は出ていない', await page.getByTestId('renraku-phone-list').count() === 0);
  const t0 = await rows.first().innerText(); ok('3 行に名前と「次回」', /次回/.test(t0) && t0.trim().length > 4, t0.replace(/\n/g, ' '));
  const rowH = await rows.first().evaluate(e => e.getBoundingClientRect().height); ok('4 行の高さ 44px 以上', rowH >= 44, rowH);
  const names = []; for (let i = 0; i < Math.min(n, 3); i++) names.push((await rows.nth(i).locator('.nm').innerText()).trim());
  await rows.first().tap(); await page.waitForTimeout(700);
  const sheet = page.getByTestId('cb-sheet'); ok('5 押すと下から紙の小窓(cb-sheet)', await sheet.count() === 1);
  ok('6 小窓の題は1人目の名前', (await sheet.locator('.head .ttl').innerText()).includes(names[0]), await sheet.locator('.head .ttl').innerText());
  const fit = await sheet.locator('[data-fit-scale]').first().getAttribute('data-fit-scale').catch(() => null);
  ok('7 紙(cb-page)が幅に合わせて縮んでいる', await sheet.locator('.cb-page').count() >= 1 && fit && Number(fit) < 1 && Number(fit) > 0.3, fit);
  const bodyBox = await sheet.locator('.body').boundingBox(); const footBox = await sheet.locator('.foot').boundingBox(); const vh = page.viewportSize().height;
  ok('8 下のボタン行が画面の中(下のバーの上)', footBox && footBox.y + footBox.height <= vh && bodyBox && bodyBox.height > 200, { foot: footBox && Math.round(footBox.y + footBox.height), vh });
  ok('9 1人目は「前の方」が押せない', await page.getByTestId('cb-sheet-prev').isDisabled());
  await page.getByTestId('cb-sheet-next').tap(); await page.waitForTimeout(500);
  ok('10 「次」で2人目の紙', (await page.locator('[data-testid="cb-sheet"] .head .ttl').innerText()).includes(names[1]), await page.locator('[data-testid="cb-sheet"] .head .ttl').innerText());
  ok('11 枚数の表示 2 / N', (await page.locator('[data-testid="cb-sheet"] .head .sub').innerText()).trim() === `2 / ${n}`);
  // スワイプ(右へ=前の方)
  const cdp = await ctx.newCDPSession(page); const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const sb = await sheet.locator('.body').boundingBox(); const sy = sb.y + 60;
  await touch('touchStart', 120, sy); for (let i = 1; i <= 8; i++) { await touch('touchMove', 120 + i * 20, sy); await page.waitForTimeout(16); } await touch('touchEnd', 280, sy); await page.waitForTimeout(600);
  ok('12 小窓の上で右へ動かすと前の方(1人目)', (await page.locator('[data-testid="cb-sheet"] .head .ttl').innerText()).includes(names[0]));
  await touch('touchStart', 280, sy); for (let i = 1; i <= 8; i++) { await touch('touchMove', 280 - i * 20, sy); await page.waitForTimeout(16); } await touch('touchEnd', 120, sy); await page.waitForTimeout(600);
  ok('13 左へ動かすと次の方(2人目)', (await page.locator('[data-testid="cb-sheet"] .head .ttl').innerText()).includes(names[1]));
  ok('14 画面は連絡帳のまま(提供記録へ切り替わらない)', await page.getByTestId('cb-rows').count() === 1);
  // 連絡事項
  await page.getByTestId('cb-sheet-renraku').tap(); await page.waitForTimeout(700);
  const rm = page.locator('div.fixed.z-\\[80\\]', { hasText: /連絡事項/ }); ok('15 「連絡事項」で入力の小窓(RenrakuModal)が紙の上に出る', await rm.count() === 1 && await page.getByTestId('cb-sheet').count() === 1);
  await rm.locator('button', { hasText: /^キャンセル$/ }).last().click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(400);
  ok('15b キャンセルで入力の小窓だけ閉じ、紙は残る', await rm.count() === 0 && await page.getByTestId('cb-sheet').count() === 1);
  // ✕ で閉じる
  if (await page.getByTestId('cb-sheet').count() === 0) { await rows.nth(1).tap(); await page.waitForTimeout(500); }
  await page.getByTestId('cb-sheet-close').tap(); await page.waitForTimeout(400); ok('16 ✕ で閉じる', await page.getByTestId('cb-sheet').count() === 0);
  // 幕で閉じる
  await rows.first().tap(); await page.waitForTimeout(500); await page.mouse.click(196, 10); await page.waitForTimeout(400); ok('17 幕(上の隙間)を押すと閉じる', await page.getByTestId('cb-sheet').count() === 0);
  // 戻る(左端から右へ)
  await rows.first().tap(); await page.waitForTimeout(500);
  await touch('touchStart', 6, 300); for (let i = 1; i <= 8; i++) { await touch('touchMove', 6 + i * 20, 300); await page.waitForTimeout(16); } await touch('touchEnd', 166, 300); await page.waitForTimeout(600);
  ok('18 左端から右へ(戻る)で閉じる・画面は連絡帳のまま', await page.getByTestId('cb-sheet').count() === 0 && await page.getByTestId('cb-rows').count() === 1);
  // 日付を変えると閉じる
  await rows.first().tap(); await page.waitForTimeout(400);
  await page.evaluate(() => { const i = document.querySelector('input[type="date"]'); if (i) { const d = new Date(i.value + 'T00:00:00'); d.setDate(d.getDate() - 1); const v = d.toISOString().slice(0, 10); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); } });
  await page.waitForTimeout(600); ok('19 日付を変えると小窓は閉じる', await page.getByTestId('cb-sheet').count() === 0);
  // 表示の切替(操作の小窓の中)
  await page.getByTestId('fold-btn-renraku').tap(); await page.waitForTimeout(600);
  ok('20 操作に「表示 一覧／全員の紙」', await page.getByTestId('cb-phonemode-all').isVisible());
  await page.getByTestId('cb-phonemode-all').tap(); await page.waitForTimeout(800);
  ok('21 「全員の紙」で今までの縦並び(renraku-phone-list)', await page.getByTestId('renraku-phone-list').count() === 1 && await page.getByTestId('cb-rows').count() === 0);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
  ok('22 再読込しても「全員の紙」のまま(この端末の設定)', await page.getByTestId('renraku-phone-list').count() === 1 && (await page.evaluate(() => localStorage.getItem('tsuCbPhoneMode'))) === 'all');
  await ctx.close(); }

// ===== iPad・パソコンは変わらない =====
for (const [w, h, touch] of [[1180, 820, true], [1366, 768, false]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', hasTouch: touch }); const page = await boot(ctx);
  ok(`23 ${w}x${h} は従来の紙の一覧(cb-list)・一覧の行なし・表示の切替なし`, await page.getByTestId('cb-list').count() === 1 && await page.getByTestId('cb-rows').count() === 0 && await page.getByTestId('cb-phonemode').count() === 0);
  await ctx.close(); }
await b.close();
const bad = R.filter(x => !x[1]); console.log(bad.length ? `FAIL ${bad.length}: ${bad.map(x => x[0]).join(' / ')}` : 'ALL PASS'); process.exit(bad.length ? 1 : 0);
