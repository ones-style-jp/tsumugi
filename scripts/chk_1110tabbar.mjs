// 2026-11-10 trial536 スマホの下のバー(TsuPhoneTabBar)+メニュー(TsuPhoneMenu)の確認
//   node chk/chk_1110tabbar.mjs [port]   (見本データ VITE_E2E_DEMO=1 のビルド)
import { chromium } from 'playwright';
import fs from 'node:fs';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
const S = process.env.S || '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad';
const OUT = `${S}/shots/tabbar`; fs.mkdirSync(OUT, { recursive: true });
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
const b = await chromium.launch();
const login = async (page) => {
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(900); }
  await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
};
// --- スマホ ---
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
  const page = await ctx.newPage(); page.on('pageerror', e => { console.log('PAGEERROR', e.message.slice(0, 200)); fails++; });
  await login(page);
  const bar = page.getByTestId('tsu-tabbar');
  ok(await bar.isVisible(), 'スマホ: 下のバーが出る');
  ok(!(await page.locator('header.tsu-app-header svg.lucide-menu').count()), 'スマホ: 左上の3本線は出ない');
  const bb = await bar.boundingBox(); ok(bb && Math.abs((bb.y + bb.height) - 844) < 2, `下のバーは画面の下に固定 (y+h=${bb && Math.round(bb.y + bb.height)})`);
  ok((await bar.locator('button').count()) === 5, '下のバーは5つ');
  const pad = await page.evaluate(() => parseInt(getComputedStyle(document.getElementById('appMainArea')).paddingBottom));
  ok(pad >= 60, `本文の下に余白 ${pad}px`);
  await page.screenshot({ path: `${OUT}/phone_home.png` });
  // 今日の記録(真ん中)
  await page.getByTestId('tsu-tab-record').click(); await page.waitForTimeout(1200);
  ok(/記録|月/.test(await page.locator('h1').innerText()), '真ん中→提供記録');
  const on = await page.getByTestId('tsu-tab-record').getAttribute('class'); ok(/\bon\b/.test(on || ''), '今の画面のタブに印');
  await page.screenshot({ path: `${OUT}/phone_record.png` });
  // 連絡帳
  await page.getByTestId('tsu-tab-print').click(); await page.waitForTimeout(1200);
  ok(/連絡帳/.test(await page.locator('h1').innerText()), '連絡帳へ');
  // メニュー
  await page.getByTestId('tsu-tab-menu').click(); await page.waitForTimeout(500);
  const menu = page.getByTestId('tsu-phone-menu'); ok(await menu.isVisible(), 'メニューが下から全画面で出る');
  const tiles = await menu.locator('.tiles > button').count(); ok(tiles >= 10, `メニューの札 ${tiles}個`);
  await page.screenshot({ path: `${OUT}/phone_menu.png` });
  // 札の大きさ(44px 以上)
  const tb = await menu.locator('.tiles > button').first().boundingBox(); ok(tb && tb.height >= 44 && tb.width >= 44, `札の大きさ ${tb && Math.round(tb.width)}x${tb && Math.round(tb.height)}`);
  await page.getByTestId('tsu-menu-diary').click(); await page.waitForTimeout(1200);
  ok(!(await menu.count()), 'メニューの札を押すと閉じる');
  ok(/日誌/.test(await page.locator('h1').innerText()), '日誌へ');
  await page.screenshot({ path: `${OUT}/phone_diary.png` });
  // 文字を打っている間は隠れる
  await page.getByTestId('tsu-tab-menu').click(); await page.waitForTimeout(300);
  await page.getByTestId('tsu-menu-master').click(); await page.waitForTimeout(1200);
  const inp = page.locator('input[type="text"]:visible, input:not([type]):visible').first();
  if (await inp.count()) { await inp.focus(); await page.waitForTimeout(400); const cls = await bar.getAttribute('class'); ok(/tsu-tabbar-hide/.test(cls || ''), '入力中は下のバーが隠れる'); await page.keyboard.press('Tab'); await page.evaluate(() => document.activeElement && document.activeElement.blur()); await page.waitForTimeout(400); ok(!/tsu-tabbar-hide/.test((await bar.getAttribute('class')) || ''), '入力を終えると戻る'); }
  // 設定で切る → 3本線に戻る
  await page.getByTestId('tsu-tab-menu').click(); await page.waitForTimeout(300);
  await page.getByTestId('tsu-menu-settings').click(); await page.waitForTimeout(1200);
  const sysTab = page.locator('button:visible', { hasText: /^システム$/ }).first(); if (await sysTab.count()) { await sysTab.click(); await page.waitForTimeout(600); }
  const tg = page.getByTestId('tabbar-toggle');
  ok(await tg.count() === 1, '設定→システムに切り替えがある');
  await tg.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${OUT}/phone_setting.png` });
  await tg.click(); await page.waitForTimeout(400);
  ok(!(await bar.count()), '切ると下のバーが消える');
  ok((await page.locator('header.tsu-app-header svg.lucide-menu').count()) === 1, '切ると左上の3本線が戻る');
  ok(await page.evaluate(() => !document.documentElement.classList.contains('tsu-tabbar-on')), '余白の印(html.tsu-tabbar-on)も外れる');
  await tg.click(); await page.waitForTimeout(400);
  ok(await bar.isVisible(), 'もう一度入れると戻る');
  // 元のメニュー(サイドバー)を開く → バーは隠れる
  await page.getByTestId('tsu-tab-menu').click(); await page.waitForTimeout(300);
  await page.getByTestId('tsu-phone-menu-sidebar').click(); await page.waitForTimeout(500);
  ok(/tsu-tabbar-hide/.test((await bar.getAttribute('class')) || ''), 'サイドバーを開いている間は下のバーが隠れる');
  await page.screenshot({ path: `${OUT}/phone_sidebar.png` });
  await ctx.close();
}
// --- iPad / PC: 変わらない ---
for (const [w, h, tag] of [[820, 1180, 'ipad'], [1366, 900, 'pc']]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
  const page = await ctx.newPage(); page.on('pageerror', e => { console.log('PAGEERROR', e.message.slice(0, 200)); fails++; });
  await login(page);
  ok(!(await page.getByTestId('tsu-tabbar').count()), `${tag}: 下のバーは出ない`);
  ok((await page.locator('header.tsu-app-header svg.lucide-menu').count()) === 1, `${tag}: 3本線はそのまま`);
  await ctx.close();
}
await b.close();
console.log(fails ? `FAILS ${fails}` : 'ALL PASS');
process.exit(fails ? 1 : 0);
