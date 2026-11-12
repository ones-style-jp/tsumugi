// 2026-11-12 ご家族・ケアマネ画面の見た目の確認用スクショ(見本ビルド・架空データ)。
//   職員画面の 家族関係者閲覧 → 家族・ケアマネ画面プレビュー を、スマホ幅(390)と PC 幅(1280)で ご家族/ケアマネ × お知らせ/通所記録 の 8 枚
//   + ポータルのログイン画面(?family)を 2 枚。出力: <outDir>/portal_<幅>_<見る人>_<タブ>.png
//   node chk/shot_1112portal.mjs [port] [outDir]
import { chromium } from 'playwright';
import fs from 'node:fs';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
const OUT = process.argv[3] || './shots_portal'; fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch();
const VPS = [['phone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }], ['pc', { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }]];
for (const [tag, opt] of VPS) {
  const ctx = await b.newContext({ ...opt, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
  const page = await ctx.newPage(); page.on('dialog', d => d.accept().catch(() => {})); // 見本データの確認は「はい」
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(900); }
  // 見本データ(架空70名・9月からの提供記録)を入れてから撮る(自動テスト用のビルドだけに出る「デモ用の見本データ」)。SEED=0 で省略
  if (process.env.SEED !== '0') {
    await page.evaluate(() => { localStorage.setItem('tsumugiSidebarOpen', '0'); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'settings', pid: null, t: Date.now() })); });
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 400 }).catch(() => {});
    const fill = page.getByTestId('demo-fill');
    for (const lab of [/^データ/, /^バックアップ/, /^システム$/]) { if (await fill.count()) break; const tb = page.locator('button:visible', { hasText: lab }).first(); if (await tb.count()) { await tb.click().catch(() => {}); await page.waitForTimeout(700); } }
    if (await fill.count()) { await fill.scrollIntoViewIfNeeded(); await fill.click(); await page.waitForFunction(() => /入れました|入れられません/.test(document.querySelector('[data-testid="demo-msg"]')?.textContent || ''), null, { timeout: 120000 }); console.log(`[${tag}] 見本データ: ${await page.getByTestId('demo-msg').innerText()}`); }
    else console.log(`[${tag}] 見本データのボタンなし(そのまま撮る)`);
  }
  await page.evaluate(() => { localStorage.setItem('tsumugiSidebarOpen', '0'); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'family_admin', pid: null, t: Date.now() })); });
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 400 }).catch(() => {});
  await page.locator('[data-testid="fa-tabs"] button', { hasText: /プレビュー/ }).first().click(); await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/_dbg_${tag}_tab.png` });
  const selBtn = page.locator('button', { hasText: /利用者を選択/ }).first();
  if (await selBtn.count()) {
    await selBtn.click(); await page.waitForTimeout(400);
    const opts = page.locator('[data-tsu-nolock="1"] + div button').filter({ hasText: /\S{2,}/ });
    console.log(`[${tag}] 候補 ${await opts.count()} 名`);
    await opts.nth(2).click().catch(async () => opts.first().click()); await page.waitForTimeout(800);
  } else { /* 一覧の札から選ぶ(見本データは「架空 ○○」) */ await page.getByText(/^架空\s*一郎$/).first().click().catch(async () => page.locator('div,button').filter({ hasText: /^架空\s\S+$/ }).first().click()); await page.waitForTimeout(900); console.log(`[${tag}] 札から選択`); }
  for (const [vk, vl] of [['family', 'ご家族'], ['cm', 'ケアマネ']]) {
    await page.locator('button', { hasText: new RegExp(`^${vl}$`) }).first().click(); await page.waitForTimeout(600);
    for (const [tk, tl] of [['news', 'お知らせ'], ['records', '通所記録']]) {
      await page.locator('button', { hasText: new RegExp(`^${tl}$`) }).first().click(); await page.waitForTimeout(1200);
      const f = `${OUT}/portal_${tag}_${vk}_${tk}.png`; await page.screenshot({ path: f }); console.log('saved', f);
    }
  }
  // ポータルのログイン画面(本物の入口)
  await page.goto(`http://localhost:${PORT}/?family`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1200);
  const f = `${OUT}/portal_${tag}_login.png`; await page.screenshot({ path: f }); console.log('saved', f);
  await ctx.close();
}
await b.close();
