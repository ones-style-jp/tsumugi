// 2026-11-11 trial565: スマホで「下のバーで切り替える」を切っても、スワイプ(右端=サイドバー・左端=戻る・上端から下=今日の予定)は使える
//   node chk/chk_1111gestoff.mjs [port]
import { chromium } from 'playwright';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => { console.log('PAGEERROR', e.message.slice(0, 200)); fails++; });
const swipe = (x1, y1, x2, y2) => page.evaluate(([x1, y1, x2, y2]) => { const el = document.elementFromPoint(x1, y1) || document.body; const mk = (type, x, y) => { const t = new Touch({ identifier: 1, target: el, clientX: x, clientY: y, pageX: x, pageY: y }); return new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true }); }; el.dispatchEvent(mk('touchstart', x1, y1)); el.dispatchEvent(mk('touchend', x2, y2)); }, [x1, y1, x2, y2]);
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(900); }
await page.evaluate(() => { localStorage.setItem('tsumugiPhoneTabBar', '0'); localStorage.setItem('tsumugiSidebarOpen', '0'); localStorage.setItem('tsumugiTpDriveAck', String(Date.now())); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'dashboard', pid: null, t: Date.now() })); });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1600); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 400 }).catch(() => {});
const title = () => page.locator('header.tsu-app-header h1').innerText();
ok((await page.getByTestId('tsu-tabbar').count()) === 0, '下のバーは出ない(設定オフ)');
ok((await page.locator('header.tsu-app-header svg.lucide-menu').count()) === 1, '左上の3本線が出る');
const sb = page.getByTestId('app-sidebar');
ok((await sb.getAttribute('data-side')) === 'right', 'サイドバーは右側(スワイプと同じ向き)');
// 右端から左へ → サイドバー
await swipe(384, 500, 240, 505); await page.waitForTimeout(800);
let bb = await sb.boundingBox();
ok(bb && bb.x > 100 && bb.x + bb.width <= 391, `右端から左へスワイプ → サイドバーが右から出る (x=${bb && Math.round(bb.x)})`);
// サイドバーの上で左→右 → 閉じる
await swipe(Math.round(bb.x + 40), 500, Math.round(bb.x + 200), 505); await page.waitForTimeout(700);
bb = await sb.boundingBox();
ok(!bb || bb.x >= 389, 'サイドバーの上で左→右スワイプ → 閉じる');
// 3本線でも開く
await page.locator('header.tsu-app-header button:has(svg.lucide-menu)').click(); await page.waitForTimeout(600);
bb = await sb.boundingBox(); ok(bb && bb.x > 100 && bb.x + bb.width <= 391, '3本線を押しても右から出る');
await page.locator('div.fixed.inset-0.z-\\[57\\]').click({ position: { x: 40, y: 400 } }); await page.waitForTimeout(600);
bb = await sb.boundingBox(); ok(!bb || bb.x >= 389, '幕を押すと閉じる');
// 左端から右へ → 前の画面
await page.locator('header.tsu-app-header button:has(svg.lucide-menu)').click(); await page.waitForTimeout(500);
await sb.locator('button', { hasText: /送迎表/ }).first().click(); await page.waitForTimeout(1000); await page.getByTestId('tp-drive-ok').click({ timeout: 800 }).catch(() => {});
ok(/送迎表/.test(await title()), `送迎表へ (${(await title()).trim()})`);
await swipe(8, 500, 160, 505); await page.waitForTimeout(900);
ok(/ホーム/.test(await title()), `左端から右へスワイプ → ホームに戻る (${(await title()).trim()})`);
// 上端から下 → 今日の予定
const hdr = await page.locator('header.tsu-app-header').boundingBox();
await swipe(200, Math.round(hdr.y + 20), 205, Math.round(hdr.y + 140)); await page.waitForTimeout(700);
const sheet = page.getByTestId('tsu-today-sheet');
ok(await sheet.isVisible(), '上の帯を下へ引く → 今日の予定が出る');
await swipe(8, 500, 160, 505); await page.waitForTimeout(600);
ok(!(await sheet.isVisible()), '左端から右へ → まず今日の予定が閉じる');
// 設定の説明文
await page.locator('header.tsu-app-header button:has(svg.lucide-menu)').click(); await page.waitForTimeout(500);
await sb.locator('button', { hasText: /各種設定/ }).first().click(); await page.waitForTimeout(1000);
await page.locator('button:visible', { hasText: /^システム$/ }).first().click({ timeout: 1500 }).catch(() => {}); await page.waitForTimeout(500);
const set = page.getByTestId('tabbar-setting');
ok((await set.count()) === 1 && !(await set.locator('input').isChecked()), '各種設定→システムの「下のバー」はオフのまま');
await set.locator('button').first().click({ timeout: 800 }).catch(() => {}); await page.waitForTimeout(300);
ok(/バーの有無にかかわらず/.test(await page.locator('body').innerText()), '説明にスワイプはバーの有無にかかわらず使えると書いてある');
await b.close(); console.log(fails ? `FAIL ${fails}` : 'ALL PASS'); process.exit(fails ? 1 : 0);
