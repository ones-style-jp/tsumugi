// 2026-11-10 trial548: スマホの横スワイプ(追加分) — 提供記録/連絡帳が縦にスクロールできる(trial546の不具合の修正)・広げた人の枠=前の方/次の方・帯の上=連絡帳・
//   カレンダー(週)=前の週/次の週・下のバーの真ん中は連絡帳でも光る・自由枠の既定は日誌・メニュー/各種設定から選べる・切り替えの tsu-swap
//   node chk/chk_1110swipe2.mjs [port]   (見本データ VITE_E2E_DEMO=1 のビルド)
import { chromium } from 'playwright';
import fs from 'node:fs';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
const S = process.env.S || '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad';
const OUT = `${S}/shots/swipe`; fs.mkdirSync(OUT, { recursive: true });
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => { console.log('PAGEERROR', e.message.slice(0, 200)); fails++; });
const swipe = (x1, y1, x2, y2) => page.evaluate(([x1, y1, x2, y2]) => { const el = document.elementFromPoint(x1, y1) || document.body; const mk = (type, x, y) => { const t = new Touch({ identifier: 1, target: el, clientX: x, clientY: y, pageX: x, pageY: y }); return new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true }); }; el.dispatchEvent(mk('touchstart', x1, y1)); el.dispatchEvent(mk('touchend', x2, y2)); }, [x1, y1, x2, y2]);
const swipeOn = async (sel, dx) => { const bb = await page.locator(sel).first().boundingBox(); const y = Math.round(bb.y + Math.min(bb.height / 2, 120)); const x1 = dx < 0 ? 300 : 90; await swipe(x1, y, x1 + dx, y + 4); };
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(900); }
await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.systemSettings = d.systemSettings || {}; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [] }; d.holidays = []; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); localStorage.removeItem('tsumugiPhoneTabCustom'); localStorage.removeItem('tsuRecCardMode'); });
const go = async (v) => { await page.evaluate((v) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: null, t: Date.now() })), v); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1600); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 400 }).catch(() => {}); };
const cdp = await ctx.newCDPSession(page);
const touchScroll = async () => { await page.evaluate(() => window.scrollTo(0, 0)); await cdp.send('Input.synthesizeScrollGesture', { x: 200, y: 600, yDistance: -500, speed: 800, gestureSourceType: 'touch' }); await page.waitForTimeout(500); return page.evaluate(() => document.documentElement.scrollTop || document.body.scrollTop || window.scrollY); };
// 1) 提供記録・連絡帳: 縦にスクロールできる(html が固定になっていない)
for (const v of ['record', 'print']) {
  await go(v);
  const st = await page.evaluate(() => ({ pos: getComputedStyle(document.documentElement).position, sh: document.documentElement.scrollHeight, ih: innerHeight, cls: document.documentElement.className }));
  ok(st.pos !== 'fixed' && st.sh > st.ih + 100, `${v}: ページが伸びて縦にスクロールできる作り(html position=${st.pos}, 高さ ${st.sh}/${st.ih})`);
  const top = await touchScroll(); ok(top > 100, `${v}: 指で縦に動かすとスクロールする(${top}px)`);
  ok(/tsu-pair/.test(st.cls) && await page.getByTestId('tsu-pair').isVisible(), `${v}: 上の見出し(提供記録｜連絡帳)は出ている`);
}
// 2) 下のバーの真ん中は連絡帳でも光る・自由枠の既定は日誌
ok(/\bon\b/.test((await page.getByTestId('tsu-tab-record').getAttribute('class')) || ''), '連絡帳を開いていても下のバーの「提供記録」が光る');
const slot = page.locator('.tsu-tabbar > button[data-custom]'); ok(/日誌|カレンダー/.test(await slot.innerText()), `自由枠のはじめは日誌(送迎表を使わない店はカレンダー): ${(await slot.innerText()).trim()}`);
ok((await page.locator('.tsu-tabbar > button', { hasText: '連絡帳' }).count()) === 0, '下のバーに「連絡帳」の札は無い');
// 3) メニューの下・各種設定から自由枠を選べる
await page.getByTestId('tsu-tab-menu').click(); await page.waitForTimeout(500);
await page.getByTestId('tsu-phone-menu-tabpick').click(); await page.waitForTimeout(500);
ok(await page.getByTestId('tsu-tabpick').isVisible(), 'メニューの下の「下のバーの4つ目の画面を選ぶ」で小窓が出る');
await page.getByTestId('tsu-tabpick-close').click(); await page.waitForTimeout(300);
await go('settings');
await page.locator('button, [role="tab"]', { hasText: /^システム$/ }).first().click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(600);
const pick = page.getByTestId('tabcustom-pick');
if (await pick.count()) { await pick.scrollIntoViewIfNeeded(); await pick.click(); await page.waitForTimeout(500); ok(await page.getByTestId('tsu-tabpick').isVisible(), '各種設定→システム の「選ぶ」で小窓が出る'); await page.getByTestId('tsu-tabpick-close').click(); }
else ok(false, '各種設定→システム に「選ぶ」がある');
// 4) 提供記録: 広げた人の枠の上=前の方/次の方・帯の上=連絡帳
await go('record');
const rows = page.locator('[data-testid^="rv-crow-"]'); const n = await rows.count(); ok(n >= 3, `たたんだ行がある(${n})`);
const id0 = (await rows.nth(0).getAttribute('data-testid')).replace('rv-crow-', ''); const id1 = (await rows.nth(1).getAttribute('data-testid')).replace('rv-crow-', '');
await rows.nth(0).click(); await page.waitForTimeout(600);
const openId = () => page.evaluate(() => { const el = document.querySelector('[data-rv-open]'); return el ? el.getAttribute('data-rec-card') : null; });
ok((await openId()) === id0, `1人目を広げた(${id0})`);
await swipeOn('[data-rv-open]', -180); await page.waitForTimeout(1000);
ok((await openId()) === id1 && /提供記録/.test(await page.locator('h1').innerText()), `広げた枠の上で左へ → 次の方(${id1})・画面は提供記録のまま`);
// ★ trial549: 次の方の枠は帯のすぐ下に即座に出る(ガタつきなし)。前の人のたたんだ行は帯の上に隠れている
const posInfo = await page.evaluate(() => { const pin = document.querySelector('.tsu-pin').getBoundingClientRect(); const el = document.querySelector('[data-rv-open]').getBoundingClientRect(); return { pinB: Math.round(pin.bottom), top: Math.round(el.top) }; });
ok(posInfo.top >= posInfo.pinB && posInfo.top <= posInfo.pinB + 16, `次の方の枠が帯のすぐ下に出る(帯の下端 ${posInfo.pinB}px・枠の上端 ${posInfo.top}px)`);
ok(!(await page.locator('[data-rv-open].ring-4').count()), 'オレンジの枠(点滅)は出ない');
await swipeOn('[data-rv-open]', 180); await page.waitForTimeout(1000);
ok((await openId()) === id0, '広げた枠の上で右へ → 前の方に戻る');
await page.screenshot({ path: `${OUT}/rec_person.png` });
// 帯(名前の帯 .tsu-pin)の上で左へ → 連絡帳
const pin = await page.locator('.tsu-pin').first().boundingBox(); await swipe(300, Math.round(pin.y + pin.height / 2), 120, Math.round(pin.y + pin.height / 2) + 3); await page.waitForTimeout(1100);
ok(/連絡帳/.test(await page.locator('h1').innerText()), '名前の帯の上で左へ → 連絡帳');
ok(await page.evaluate(() => getComputedStyle(document.querySelector('.tsu-pairtabs'), '::after').left !== '0px'), '上の見出しの緑の線がある(1本を動かす)');
await swipe(120, 600, 300, 604); await page.waitForTimeout(1100);
ok(/提供記録/.test(await page.locator('h1').innerText()), '連絡帳で右へ → 提供記録');
// 5) カレンダー(週): 前の週/次の週
await go('schedule');
await page.locator('button', { hasText: /^週$/ }).first().click(); await page.waitForTimeout(600);
const wk = async () => { const t = await page.locator('body').innerText(); const m = t.match(/(\d{1,2})\/(\d{1,2})〜(\d{1,2})\/(\d{1,2})/); return m ? m[0] : ''; };
const w0 = await wk(); ok(!!w0, `週の表の範囲 ${w0}`);
await swipe(300, 500, 150, 505); await page.waitForTimeout(900);
const w1 = await wk(); const w0a = w0.split('〜')[0].split('/').map(Number); const exp = (() => { const y = new Date().getFullYear(); const d = new Date(y, w0a[0] - 1, w0a[1] + 7); return `${d.getMonth() + 1}/${d.getDate()}`; })();
ok(w1 !== w0 && w1.startsWith(exp + '〜'), `週: 左へスワイプ → 翌週 (${w0} → ${w1})`);
await swipe(150, 500, 300, 505); await page.waitForTimeout(900);
ok((await wk()) === w0, '週: 右へスワイプ → 前の週に戻る');
await page.screenshot({ path: `${OUT}/cal_week.png` });
await ctx.close(); await b.close();
console.log(fails ? `FAILS ${fails}` : 'ALL PASS'); process.exit(fails ? 1 : 0);
