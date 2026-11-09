// 2026-11-10 trial538 スマホの提供記録: 1人1行にたたむ・押した人だけ広げる・運動「いつも通り」・次の方
//   node chk/chk_1110reccards.mjs [port]
import { chromium } from 'playwright';
import fs from 'node:fs';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
const S = process.env.S || '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad';
const OUT = `${S}/shots/reccards`; fs.mkdirSync(OUT, { recursive: true });
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
const page = await ctx.newPage(); page.on('pageerror', e => { console.log('PAGEERROR', e.message.slice(0, 200)); fails++; });
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(900); }
await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
await page.getByTestId('tsu-tab-record').click(); await page.waitForTimeout(1500);
// ★ trial540: 提供記録では見出し(日付の行)が消え、帯が上端から。「操作」は下から出る小窓。「全画面」は出ない
ok(await page.evaluate(() => document.documentElement.classList.contains('tsu-nohdr')), '提供記録では html.tsu-nohdr');
ok(!(await page.locator('header.tsu-app-header').isVisible()), '見出し(日付の行)が消えている');
const pinBox = await page.locator('.tsu-pin').first().boundingBox(); ok(pinBox && pinBox.y <= 1, `帯が画面の上端から (y=${pinBox && Math.round(pinBox.y)})`);
const padTop = await page.evaluate(() => parseInt(getComputedStyle(document.getElementById('appMainArea')).paddingTop)); ok(padTop === 0, `本文の上の余白 ${padTop}px`);
await page.getByTestId('fold-btn-record').click(); await page.waitForTimeout(400);
ok(await page.getByTestId('fold-sheet-close-record').isVisible(), '操作が下から出る小窓で開く');
const sh = await page.getByTestId('fold-body-record').boundingBox(); ok(sh && sh.y + sh.height <= 844 - 60 + 1 && sh.y > 200, `小窓は下のバーの上に (y=${sh && Math.round(sh.y)}〜${sh && Math.round(sh.y + sh.height)})`);
ok(!(await page.getByTestId('rec-act-fullscreen').isVisible()), '「全画面」は出ない');
ok(await page.getByTestId('vital-ref').isVisible(), '基準値は小窓の中にある');
await page.screenshot({ path: `${OUT}/sheet.png` });
await page.getByTestId('fold-sheet-close-record').click(); await page.waitForTimeout(300);
ok(!(await page.getByTestId('fold-sheet-close-record').count()), '×で閉じる');
const rows = page.locator('.tsu-rv-cards > .tsu-rv-row');
const n = await rows.count(); ok(n >= 3, `たたんだ行が ${n} 人分`);
ok((await page.locator('.tsu-rv-cards > [data-rec-card]:not(.tsu-rv-row)').count()) === 0, '最初は誰も広がっていない');
const h = await rows.first().boundingBox(); ok(h && h.height >= 44 && h.height <= 80, `行の高さ ${h && Math.round(h.height)}px`);
await page.screenshot({ path: `${OUT}/rows.png` });
// 1人目を開く
const firstId = await rows.first().getAttribute('data-rec-card');
await rows.first().click(); await page.waitForTimeout(600);
const open = page.locator(`[data-rec-card="${firstId}"]:not(.tsu-rv-row)`);
ok(await open.isVisible(), '押した人が広がる');
ok((await page.locator('.tsu-rv-cards > [data-rec-card]:not(.tsu-rv-row)').count()) === 1, '広がるのは1人だけ');
ok((await page.locator('.tsu-rv-cards > .tsu-rv-row').count()) === n - 1, 'ほかは行のまま');
await page.screenshot({ path: `${OUT}/open.png` });
// ★ trial539: 広げた1人分が1画面に収まる(下のバー 66px を除いた高さ)。「たたむ／次の方」はスクロールせずに見える
const ob = await open.boundingBox(); ok(ob && ob.height <= 844 - 48 - 56 - 66, `広げたカードの高さ ${ob && Math.round(ob.height)}px（1画面に収まる）`);
const fb = await page.getByTestId(`rv-next-${firstId}`).boundingBox(); ok(fb && fb.y + fb.height <= 844 - 60, `「次の方」がスクロールせずに見える (y=${fb && Math.round(fb.y)})`);
// 運動の見出し・いつも通り
const exbar = page.getByTestId(`rv-exbar-${firstId}`);
if (await exbar.count()) {
  const cntBefore = await exbar.locator('.cnt').innerText();
  const usual = page.getByTestId(`rv-usual-${firstId}`);
  if (await usual.count()) {
    await usual.click(); await page.waitForTimeout(500);
    const cntAfter = await exbar.locator('.cnt').innerText();
    ok(cntAfter !== cntBefore, `いつも通り: ${cntBefore} → ${cntAfter}`);
    ok(!(await page.getByTestId(`rv-exgrid-${firstId}`).count()), 'いつも通りのあと運動はたたまれる');
    await exbar.locator('.tsu-rv-exbar-t').click(); await page.waitForTimeout(300);
    ok((await page.getByTestId(`rv-exgrid-${firstId}`).count()) === 1, '見出しを押すと運動が開く');
    const circles = await page.getByTestId(`rv-exgrid-${firstId}`).locator('button').filter({ hasText: '○' }).count(); ok(circles > 0, `○が ${circles} 個`);
    await page.screenshot({ path: `${OUT}/usual.png` });
  } else ok(true, 'いつも通りのボタンなし(全部入力済み)');
} else ok(false, '運動の見出し行がある');
// 次の方
const nextBtn = page.getByTestId(`rv-next-${firstId}`);
ok(await nextBtn.count() === 1, '「次の方」がある');
const secondId = await page.locator('.tsu-rv-cards > .tsu-rv-row').first().getAttribute('data-rec-card');
await nextBtn.click(); await page.waitForTimeout(900);
ok(await page.locator(`[data-rec-card="${secondId}"]:not(.tsu-rv-row)`).isVisible(), '次の方が広がる');
ok(await page.locator(`[data-rec-card="${firstId}"].tsu-rv-row`).isVisible(), '前の人は行に戻る');
const sum = await page.locator(`[data-rec-card="${firstId}"].tsu-rv-row .sm`).innerText(); ok(/運動 \d+\/\d+/.test(sum), `行の要約: ${sum}`);
// たたむ
await page.getByTestId(`rv-fold-${secondId}`).click(); await page.waitForTimeout(400);
ok((await page.locator('.tsu-rv-cards > [data-rec-card]:not(.tsu-rv-row)').count()) === 0, 'たたむで全員行に');
// 利用者ボタン(ジャンプ)から開く
const jumpBtn = page.locator('button:visible', { hasText: /^利用者$/ }).first();
if (await jumpBtn.count()) { await jumpBtn.click(); await page.waitForTimeout(500); const it = page.getByTestId('rec-jump-item'); if (await it.count()) { await it.nth(1).click(); await page.waitForTimeout(900); ok((await page.locator('.tsu-rv-cards > [data-rec-card]:not(.tsu-rv-row)').count()) === 1, '利用者の一覧から選ぶとその人が広がる'); } }
await page.screenshot({ path: `${OUT}/after.png` });
// 別の画面へ移ると見出しが戻る
await page.getByTestId('tsu-tab-print').click(); await page.waitForTimeout(1000);
ok(await page.locator('header.tsu-app-header').isVisible(), '連絡帳では見出しが戻る');
ok(await page.evaluate(() => !document.documentElement.classList.contains('tsu-nohdr')), 'html.tsu-nohdr が外れる');
await ctx.close(); await b.close();
console.log(fails ? `FAILS ${fails}` : 'ALL PASS'); process.exit(fails ? 1 : 0);
