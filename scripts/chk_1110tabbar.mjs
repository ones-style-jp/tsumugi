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
  { const mb = await page.getByTestId('hdr-menu-btn').boundingBox(); ok(mb && mb.x > 300, `スマホ: 3本線は右上 (x=${mb && Math.round(mb.x)})(trial568)`); }
  const bb = await bar.boundingBox(); ok(bb && Math.abs((bb.y + bb.height) - 844) < 2, `下のバーは画面の下に固定 (y+h=${bb && Math.round(bb.y + bb.height)})`);
  ok((await bar.locator('button').count()) === 5, '下のバーは5つ');
  // ★ trial541: 真ん中は他と同じ形・名前は「提供記録」
  ok((await bar.locator('button.tsu-tab-center').count()) === 0, '丸く大きい札はない(5つとも同じ形)');
  ok(/^提供記録$/.test((await page.getByTestId('tsu-tab-record').locator('.lbl').innerText()).trim()), '真ん中の名前は「提供記録」');
  { const hs = []; for (let i = 0; i < 5; i++) { const bb2 = await bar.locator('button').nth(i).locator('.ico').boundingBox(); hs.push(bb2 ? Math.round(bb2.height) : -1); } ok(hs.every(h => h === hs[0]), `絵の大きさが5つとも同じ (${hs.join(',')})`); }
  const pad = await page.evaluate(() => parseInt(getComputedStyle(document.getElementById('appMainArea')).paddingBottom));
  ok(pad >= 60, `本文の下に余白 ${pad}px`);
  await page.screenshot({ path: `${OUT}/phone_home.png` });
  // 今日の記録(真ん中)
  await page.getByTestId('tsu-tab-record').click(); await page.waitForTimeout(1200);
  ok(/記録|月/.test(await page.locator('h1').innerText()), '真ん中→提供記録');
  const on = await page.getByTestId('tsu-tab-record').getAttribute('class'); ok(/\bon\b/.test(on || ''), '今の画面のタブに印');
  await page.screenshot({ path: `${OUT}/phone_record.png` });
  // ★ trial546: 提供記録⇄連絡帳の2つの見出し(上)・横スワイプ・左端スワイプで縦のメニュー・4つ目は自由枠(長押し)
  const swipe = (x1, y1, x2, y2) => page.evaluate(([x1, y1, x2, y2]) => { const el = document.elementFromPoint(x1, y1) || document.body; const mk = (type, x, y) => { const t = new Touch({ identifier: 1, target: el, clientX: x, clientY: y, pageX: x, pageY: y }); return new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true }); }; el.dispatchEvent(mk('touchstart', x1, y1)); el.dispatchEvent(mk('touchend', x2, y2)); }, [x1, y1, x2, y2]);
  const pair = page.getByTestId('tsu-pair');
  ok(await pair.isVisible(), '提供記録の上に「提供記録｜連絡帳」の見出し');
  const pb = await pair.boundingBox(); ok(pb && pb.y <= 1 && Math.round(pb.height) === 40, `見出しは画面の上端・高さ ${pb && Math.round(pb.height)}px`);
  ok(/\bon\b/.test((await page.getByTestId('tsu-pair-record').getAttribute('class')) || ''), '今いる「提供記録」に印(緑の下線)');
  const pinY = await page.locator('.tsu-pin').first().boundingBox(); ok(pinY && Math.round(pinY.y) === 40, `日付の帯は見出しのすぐ下 (y=${pinY && Math.round(pinY.y)})`);
  await page.getByTestId('tsu-pair-print').click(); await page.waitForTimeout(1200);
  ok(/連絡帳/.test(await page.locator('h1').innerText()), '見出しの「連絡帳」を押すと連絡帳へ');
  ok(await pair.isVisible() && /\bon\b/.test((await page.getByTestId('tsu-pair-print').getAttribute('class')) || ''), '連絡帳でも見出しが出て印が移る');
  ok(!(await page.locator('header.tsu-app-header').isVisible()), '連絡帳でも日付の見出し(ヘッダー)は出ない');
  await page.screenshot({ path: `${OUT}/phone_pair_print.png` });
  await swipe(200, 500, 330, 505); await page.waitForTimeout(1200);
  ok(/記録|月/.test(await page.locator('h1').innerText()), '連絡帳で右へスワイプ → 提供記録');
  await swipe(300, 500, 150, 520); await page.waitForTimeout(1200);
  ok(/連絡帳/.test(await page.locator('h1').innerText()), '提供記録で左へスワイプ → 連絡帳');
  await swipe(300, 500, 230, 700); await page.waitForTimeout(800);
  ok(/連絡帳/.test(await page.locator('h1').innerText()), '縦の動きが大きいスワイプでは切り替わらない');
  // ★ trial558: 右端から左へ → 縦のメニュー(サイドバー)。左端から右へでは開かない
  await swipe(8, 500, 150, 505); await page.waitForTimeout(800);
  ok(!/tsu-tabbar-hide/.test((await bar.getAttribute('class')) || ''), '左端から右へスワイプでは縦のメニューは開かない(trial558)');
  await swipe(384, 500, 240, 505); await page.waitForTimeout(800);
  ok(/tsu-tabbar-hide/.test((await bar.getAttribute('class')) || ''), '右端から左へスワイプで縦のメニューが開く(下のバーは隠れる)');
  // ★ trial559: サイドバーは右側に出る・その上で左→右スワイプで閉じる
  { const sb = await page.getByTestId('app-sidebar').boundingBox(); ok(sb && Math.round(sb.x + sb.width) >= 388 && sb.x > 100, `サイドバーは右側に出る(x=${sb && Math.round(sb.x)}〜${sb && Math.round(sb.x + sb.width)})`);
    await swipe(200, 500, 330, 505); await page.waitForTimeout(600);
    ok(!/tsu-tabbar-hide/.test((await bar.getAttribute('class')) || ''), 'サイドバーの上で左→右スワイプすると閉じる');
    await swipe(384, 500, 240, 505); await page.waitForTimeout(800); }
  await page.screenshot({ path: `${OUT}/phone_edge_sidebar.png` });
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  if (/tsu-tabbar-hide/.test((await bar.getAttribute('class')) || '')) { await page.mouse.click(20, 500); await page.waitForTimeout(500); } // ★ trial559: 幕は左側
  ok(!/tsu-tabbar-hide/.test((await bar.getAttribute('class')) || ''), 'メニューを閉じると下のバーが戻る');
  // 4つ目(自由枠): 長押しで選ぶ
  const slot = page.locator('.tsu-tabbar > button[data-custom]'); ok((await slot.count()) === 1 && /日誌|カレンダー/.test(await slot.innerText()), '4つ目は自由枠(はじめは日誌・送迎表を使わない店はカレンダー) trial548');
  await slot.dispatchEvent('pointerdown'); await page.waitForTimeout(750); await slot.dispatchEvent('pointerup'); await page.waitForTimeout(400);
  ok(await page.getByTestId('tsu-tabpick').isVisible(), '長押しで選ぶ小窓が出る');
  await page.screenshot({ path: `${OUT}/phone_tabpick.png` });
  await page.getByTestId('tsu-tabpick-master').click(); await page.waitForTimeout(500);
  ok(/利用者/.test(await slot.innerText()), '選ぶと4つ目の札が変わる(利用者)');
  ok(await page.evaluate(() => localStorage.getItem('tsumugiPhoneTabCustom') === 'master'), '端末に覚える');
  await slot.click(); await page.waitForTimeout(1200); ok(/利用者/.test(await page.locator('h1').innerText()), '押すとその画面へ');
  await slot.dispatchEvent('pointerdown'); await page.waitForTimeout(750); await slot.dispatchEvent('pointerup'); await page.waitForTimeout(400);
  await page.getByTestId('tsu-tabpick-print').click(); await page.waitForTimeout(400); ok(/連絡帳/.test(await slot.innerText()), '連絡帳も選べる');
  await page.evaluate(() => document.activeElement && document.activeElement.blur()); await page.waitForTimeout(400); // 利用者マスタの検索欄に焦点が残ると下のバーは隠れる(入力中)
  // 連絡帳
  console.log('dbg bar class:', await bar.getAttribute('class'), 'active:', await page.evaluate(() => document.activeElement && document.activeElement.tagName + '.' + (document.activeElement.className || '').toString().slice(0, 40)), 'atPoint:', await page.evaluate(() => { const b = document.querySelector('[data-testid="tsu-tab-print"]'); const r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return e ? e.tagName + '.' + String(e.className).slice(0, 60) + ' z=' + getComputedStyle(e).zIndex : 'none'; }), 'barBox:', JSON.stringify(await bar.boundingBox()));
  await page.getByTestId('tsu-tab-print').click({ timeout: 5000 }).catch(async () => { await page.screenshot({ path: `${OUT}/dbg_fail.png` }); throw new Error('tsu-tab-print click failed'); }); await page.waitForTimeout(1200);
  ok(/連絡帳/.test(await page.locator('h1').innerText()), '連絡帳へ');
  // メニュー(trial568: 右上の3本線 → 右のサイドバー)
  const openMenu = async () => { const hb = page.getByTestId('hdr-menu-btn'); if (await hb.isVisible().catch(() => false)) await hb.click(); else await page.getByTestId('tsu-pair-menu').click(); }; // 提供記録/連絡帳は見出しが無いので見出し代わりの帯の3本線
  await openMenu(); await page.waitForTimeout(500);
  const sbar = page.getByTestId('app-sidebar'); { const sbb = await sbar.boundingBox(); ok(sbb && sbb.x > 100, 'メニュー(3本線)でサイドバーが右から出る'); }
  ok((await sbar.locator('button', { hasText: /^変更ログ$/ }).count()) === 1, 'サイドバーの下の方に「変更ログ」(trial568)');
  ok(!(await page.locator('header.tsu-app-header button', { hasText: /^変更ログ$/ }).count()), '右上の「変更ログ」は無い');
  await page.screenshot({ path: `${OUT}/phone_menu.png` });
  await sbar.locator('button', { hasText: /日誌/ }).first().click(); await page.waitForTimeout(1200);
  { const sbb = await sbar.boundingBox(); ok(!sbb || sbb.x >= 389, 'サイドバーの項目を押すと閉じる'); }
  ok(/日誌/.test(await page.locator('h1').innerText()), '日誌へ');
  await page.screenshot({ path: `${OUT}/phone_diary.png` });
  // 文字を打っている間は隠れる
  await page.getByTestId('tsu-tab-master').click(); await page.waitForTimeout(1200); // trial568: 4つ目は利用者
  const inp = page.locator('input[type="text"]:visible, input:not([type]):visible').first();
  if (await inp.count()) { await inp.focus(); await page.waitForTimeout(400); const cls = await bar.getAttribute('class'); ok(/tsu-tabbar-hide/.test(cls || ''), '入力中は下のバーが隠れる'); await page.keyboard.press('Tab'); await page.evaluate(() => document.activeElement && document.activeElement.blur()); await page.waitForTimeout(400); ok(!/tsu-tabbar-hide/.test((await bar.getAttribute('class')) || ''), '入力を終えると戻る'); }
  // 設定で切る → 3本線に戻る
  await page.getByTestId('tsu-tab-dashboard').click(); await page.waitForTimeout(800); // 利用者マスタは名簿の幕が見出しを覆うのでホームへ戻ってから
  await openMenu(); await page.waitForTimeout(400);
  await sbar.locator('button', { hasText: /各種設定/ }).first().click(); await page.waitForTimeout(1200);
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
  await openMenu(); await page.waitForTimeout(500);
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
