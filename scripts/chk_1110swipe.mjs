// 2026-11-10 trial547: スマホの横スワイプ — 送迎表(1日)=前の日／次の日・日誌=前の日／次の日・カレンダー(月)=前の月／次の月。指を左へ=次へ
//   node chk/chk_1110swipe.mjs [port]   (見本データ VITE_E2E_DEMO=1 のビルド)
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
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(900); }
await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.systemSettings = d.systemSettings || {}; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [] }; d.holidays = []; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); localStorage.setItem('tsumugiTpDriveAck', String(Date.now())); });
const go = async (v) => { await page.evaluate((v) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: null, t: Date.now() })), v); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1600); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 400 }).catch(() => {}); };
const md = (t) => { const m = String(t || '').match(/(\d{1,2})\/(\d{1,2})/); return m ? `${m[1]}/${m[2]}` : ''; };
const nextDay = (s) => { const [m, d] = s.split('/').map(Number); const y = new Date().getFullYear(); const t = new Date(y, m - 1, d + 1); return `${t.getMonth() + 1}/${t.getDate()}`; };
// 送迎表(1日)
await go('transport'); await page.getByTestId('tp-drive-ok').click({ timeout: 1000 }).catch(() => {}); await page.waitForTimeout(400);
const d0 = md(await page.getByTestId('tp-phone-date').innerText()); ok(!!d0, `送迎表の日付 ${d0}`);
await swipe(300, 600, 150, 610); await page.waitForTimeout(900);
const d1 = md(await page.getByTestId('tp-phone-date').innerText()); ok(d1 === nextDay(d0), `送迎表: 左へスワイプ → 次の日 (${d0} → ${d1})`);
await swipe(150, 600, 300, 610); await page.waitForTimeout(900);
const d2 = md(await page.getByTestId('tp-phone-date').innerText()); ok(d2 === d0, `送迎表: 右へスワイプ → 前の日に戻る (${d2})`);
await page.getByTestId('tp-phone-week').click(); await page.waitForTimeout(800);
await swipe(300, 600, 150, 610); await page.waitForTimeout(600);
ok(await page.getByTestId('tp-phone-day').isVisible(), '1週間の表では横スワイプしても画面は変わらない(横スクロールのため)');
await page.screenshot({ path: `${OUT}/tp.png` });
// 日誌
await go('diary');
const dLabel = () => page.locator('.tsu-pin').first().innerText(); // 帯の中の日付(m/d)
const e0 = md(await dLabel()); ok(!!e0, `日誌の日付 ${e0}`);
await swipe(300, 700, 150, 705); await page.waitForTimeout(900);
const e1 = md(await dLabel()); ok(e1 === nextDay(e0), `日誌: 左へスワイプ → 次の日 (${e0} → ${e1})`);
await swipe(150, 700, 300, 705); await page.waitForTimeout(900);
const e2 = md(await dLabel()); ok(e2 === e0, `日誌: 右へスワイプ → 前の日に戻る (${e2})`);
// カレンダー(月)
await go('schedule');
const mon = async () => { const t = await page.locator('body').innerText(); const m = t.match(/(\d{4})年\s?(\d{1,2})月/); return m ? `${m[1]}-${String(m[2]).padStart(2, '0')}` : ''; };
const m0 = await mon(); ok(!!m0, `カレンダーの月 ${m0}`);
const gb = await page.getByTestId('sch-month-grid').boundingBox();
await swipe(300, Math.round(gb.y + 80), 150, Math.round(gb.y + 85)); await page.waitForTimeout(900);
const m1 = await mon(); const exp1 = (() => { const [y, m] = m0.split('-').map(Number); const d = new Date(y, m, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })();
ok(m1 === exp1, `カレンダー: 左へスワイプ → 翌月 (${m0} → ${m1})`);
await swipe(150, Math.round(gb.y + 80), 300, Math.round(gb.y + 85)); await page.waitForTimeout(900);
ok((await mon()) === m0, 'カレンダー: 右へスワイプ → 前の月に戻る');
await page.screenshot({ path: `${OUT}/cal.png` });
// 提供記録では日送りにならない(連絡帳へ)
await go('record'); await swipe(300, 600, 150, 610); await page.waitForTimeout(1000);
ok(/連絡帳/.test(await page.locator('h1').innerText()), '提供記録の左スワイプは連絡帳へ(日送りではない)');
await ctx.close(); await b.close();
console.log(fails ? `FAILS ${fails}` : 'ALL PASS'); process.exit(fails ? 1 : 0);
