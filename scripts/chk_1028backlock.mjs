// 2026-10-28 ユーザー報告「スマホで提供記録の『利用者』を押して下にスクロールすると背面がスクロールされる。スマホはこういうのが多いので徹底して」
//   Android の Chrome として指でスワイプ(CDP の touch スクロール・指を離した後の惰性つき)し、後ろの画面が動かないか
//   ①提供記録の「利用者」一覧(画面いっぱいでない・見出しの下から下まで): 開くと背面を止める印・一覧の上/暗い所/上の帯を何度スワイプしても後ろは動かない・閉じたら止める印が消えてページが動く
//   ②体力測定(スマホ)の名簿(横から出る一覧の暗い所): 止める印・後ろは動かない
//   ③ふつうの画面(ホーム・提供記録・送迎表・日誌・利用者マスタ・各種設定・連絡帳)では止めない
//   ④テンキー(画面の下に出る帯)では止めない(開いたままページを動かせる)
//   ⑤iPad: 提供記録の全画面(画面そのもの)では止めない
//   実行: node scripts/chk_1028backlock.mjs [--port 4175]
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4175'; })();
const b = await chromium.launch(); const r = {};
const UA = 'Mozilla/5.0 (Linux; Android 13; CPH2437) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const ctx = await b.newContext({ viewport: { width: 393, height: 780 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2.75, userAgent: UA, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
const page = await ctx.newPage(); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => d.accept());
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const cdp = await ctx.newCDPSession(page);
const swipe = async (x, y, dy = -300, fling = false) => { await cdp.send('Input.synthesizeScrollGesture', { x, y, yDistance: dy, xDistance: 0, gestureSourceType: 'touch', speed: fling ? 3000 : 800, preventFling: !fling }); await page.waitForTimeout(fling ? 1200 : 600); };
const locked = () => page.evaluate(() => document.documentElement.classList.contains('tsu-back-lock'));
const sy = () => page.evaluate(() => Math.round(window.scrollY));
// 提供記録の一覧を長くする(今日の午前に24名)
await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const t = new Date(); const dow = t.getDay();
  d.systemSettings = d.systemSettings || {}; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [] }; d.holidays = [];
  const act = d.patients.filter(p => p.status === '利用中' && !p.endDate).slice(0, 24); act.forEach(p => { p.scheduleAmPm = ['', '', '', '', '', '', '']; p.scheduleAmPm[dow] = 'AM'; p.scheduleChangeHistory = []; p.pauseHistory = []; });
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); });
const go = async (v, ampm) => { await page.evaluate(([v, a]) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: null, t: Date.now(), ...(a ? { ampm: a } : {}) })), [v, ampm]); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1600); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {}); if (v === 'transport') { await page.getByTestId('tp-drive-ok').click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(300); } }; // 送迎表のスマホは最初に「運転中の注意」(小窓)が出る(少し遅れて出ることがある)
// ③ ふつうの画面では止めない
const free = [];
for (const v of ['dashboard', 'record', 'transport', 'diary', 'master', 'settings', 'print']) { await go(v); await page.waitForTimeout(700); if (v === 'master') { await page.mouse.click(380, 400).catch(() => {}); await page.waitForTimeout(500); } if (await locked()) free.push(v); }
r.noLockOnPages = free.length === 0 ? true : `NG ${free.join(',')}`;
// ① 提供記録の「利用者」一覧
await go('record', 'AM'); await page.evaluate(() => window.scrollTo(0, 0));
await swipe(200, 600, -250); const y0 = await sy(); console.log('record page scrolled to', y0); r.pageScrollsBefore = y0 > 50;
await page.getByTestId('rec-fold-jump').click(); await page.waitForTimeout(700);
r.jumpLocks = await locked();
const lst = await page.getByTestId('rec-jump-list').boundingBox(); const top = await page.getByTestId('rec-jump').boundingBox();
const listScrollable = await page.getByTestId('rec-jump-list').evaluate(el => el.scrollHeight > el.clientHeight + 10);
console.log('jump list', lst, 'sheet', top, 'scrollable', listScrollable);
for (let i = 0; i < 4; i++) await swipe(lst.x + lst.width / 2, lst.y + lst.height / 2, -400, true); // 一覧の上で下へ(惰性つき)を何度も
const y1 = await sy(); const inner = await page.getByTestId('rec-jump-list').evaluate(el => el.scrollTop);
await swipe(200, Math.min(770, lst.y + lst.height + 40), -300); // 一覧の下の暗い所
await swipe(200, Math.max(10, top.y - 20), -300); // 一覧より上(見出し・上の帯)
const y2 = await sy(); console.log('jump: page', y0, '->', y1, '->', y2, 'list scrollTop', inner);
r.jumpBackStays = y1 === y0 && y2 === y0; r.jumpListScrolls = !listScrollable || inner > 0;
await page.locator('[data-testid="rec-jump"] button', { hasText: '閉じる' }).click(); await page.waitForTimeout(700);
r.jumpUnlocks = !(await locked()); await swipe(200, 600, -250); r.pageScrollsAfter = (await sy()) !== y0;
// ④ テンキー(体温)では止めない
await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
const kpBtn = page.locator('button:visible', { hasText: /^体温/ }).first();
if (await kpBtn.count()) { await kpBtn.click(); await page.waitForTimeout(700); const kp = await page.getByTestId('digital-keypad').count(); r.keypadNoLock = kp > 0 && !(await locked()); console.log('keypad', kp, 'locked', await locked()); await page.keyboard.press('Escape').catch(() => {}); }
else { r.keypadNoLock = 'skip'; }
// ② 体力測定の名簿(スマホは開いたら名簿が出る or 「対象者を選ぶ」)
await go('fitness'); await page.waitForTimeout(500);
if (!(await page.locator('div.translate-x-0', { hasText: '対象者一覧' }).count())) { await page.locator('button', { hasText: /対象者を選ぶ|様/ }).first().click().catch(() => {}); await page.waitForTimeout(600); }
r.rosterLocks = await locked(); const fy0 = await sy(); for (let i = 0; i < 3; i++) await swipe(385, 500, -300, true); r.rosterBackStays = (await sy()) === fy0; console.log('roster', r.rosterLocks, fy0, await sy());
await ctx.close();
// ⑤ iPad: 提供記録の全画面では止めない
const ctx2 = await b.newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const p2 = await ctx2.newPage(); p2.on('dialog', d => d.accept());
await p2.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await p2.waitForTimeout(800);
if (await p2.getByText('担当者を選択', { exact: false }).count()) { await p2.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await p2.waitForTimeout(800); }
await p2.evaluate(() => { localStorage.setItem('tsumugiSidebarOpen', '0'); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'record', pid: null, t: Date.now() })); }); await p2.reload({ waitUntil: 'networkidle' }); await p2.waitForTimeout(1600);
await p2.getByTestId('rec-act-fullscreen').click(); await p2.waitForTimeout(500);
if (await p2.getByTestId('fs-pick').count()) { r.fsPickLocks = await p2.evaluate(() => document.documentElement.classList.contains('tsu-back-lock')); await p2.getByTestId('fs-pick-zoom').click(); }
await p2.waitForTimeout(900);
r.fsOn = await p2.getByTestId('rec-fs-bar').count() > 0; r.fsNoLock = !(await p2.evaluate(() => document.documentElement.classList.contains('tsu-back-lock')));
await b.close();
const ok = Object.values(r).every(v => v === true || v === 'skip');
console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
