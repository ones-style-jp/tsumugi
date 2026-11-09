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
await ctx.close(); await b.close();
console.log(fails ? `FAILS ${fails}` : 'ALL PASS'); process.exit(fails ? 1 : 0);
