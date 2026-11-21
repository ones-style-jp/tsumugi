// 2026-10-21 店舗報告「スマホの OPPO(Android)だと送迎表がスクロールできない」: Android の Chrome として指でスワイプ(CDP の touch スクロール)し、ページが動くか。
//   主な画面(送迎表の1日・1週間・提供記録・日誌・連絡帳・カレンダー・モニタリング・利用者マスタ・各種設定)。ポップアップの上でスワイプしても後ろは動かない
//   使い方: node scripts/chk_1021androidscroll.mjs [port]
import { chromium } from 'playwright';
const PORT = process.argv[2] || '4185';
const b = await chromium.launch(); const r = {};
const UA = 'Mozilla/5.0 (Linux; Android 13; CPH2437) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const ctx = await b.newContext({ viewport: { width: 393, height: 780 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2.75, userAgent: UA, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
const page = await ctx.newPage(); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const cdp = await ctx.newCDPSession(page);
const swipe = async (x, y) => { await cdp.send('Input.synthesizeScrollGesture', { x, y, yDistance: -300, xDistance: 0, gestureSourceType: 'touch', speed: 800 }); await page.waitForTimeout(600); };
const moved = () => page.evaluate(() => { let m = window.scrollY; document.querySelectorAll('*').forEach(el => { if (el.scrollTop > m) m = el.scrollTop; }); return m; });
const reset = () => page.evaluate(() => { window.scrollTo(0, 0); document.querySelectorAll('*').forEach(el => { if (el.scrollTop > 0) el.scrollTop = 0; }); });
// 送迎表の1日表示を長くする(今日の午前・午後に見本の方を車へ)
await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const t = new Date(); const iso = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; const dow = t.getDay();
  d.diarySettings.cars = [{ id: 'c1', name: '1号車', type: '', cap: '8' }, { id: 'c2', name: '2号車', type: '', cap: '8' }, { id: 'c3', name: '3号車', type: '', cap: '8' }];
  const act = d.patients.filter(p => p.status === '利用中').slice(0, 24); act.forEach((p, i) => { p.scheduleAmPm = ['', '', '', '', '', '', '']; p.scheduleAmPm[dow] = i < 12 ? 'AM' : 'PM'; });
  const mk = (L) => ({ cars: { c1: L.slice(0, 4).map((p, i) => ({ pid: p.id, t: `8:${30 + i}` })), c2: L.slice(4, 8).map((p, i) => ({ pid: p.id, t: `8:${40 + i}` })), c3: L.slice(8, 12).map((p, i) => ({ pid: p.id, t: `8:${50 + i}` })) }, walkers: [], others: [], un: [], _savedAt: Date.now() });
  d.transportPlans = { [`${iso}_AM`]: mk(act.slice(0, 12)), [`${iso}_PM`]: mk(act.slice(12, 24)) }; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); });
const views = [['transport_day', 'transport'], ['transport_week', 'transport', true], ['record', 'record'], ['diary', 'diary'], ['print', 'print'], ['schedule', 'schedule'], ['monitoring', 'monitoring'], ['master', 'master'], ['settings', 'settings'], ['dashboard', 'dashboard'], ['fitness', 'fitness'], ['absence_fax', 'absence_fax'], ['general_fax', 'general_fax'], ['roster', 'roster'], ['jisseki', 'jisseki'], ['cmmaster', 'cmmaster'], ['family_admin', 'family_admin'], ['emergency', 'emergency'], ['dash_personal', 'dash_personal'], ['dash_operation', 'dash_operation'], ['class_roster', 'class_roster'], ['life_hub', 'life_hub'], ['tsusho_keikaku', 'tsusho_keikaku']];
for (const [k, v, week] of views) {
  await page.evaluate((v) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: null, t: Date.now() })), v);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
  if (week) { await page.getByTestId('tp-phone-week').click().catch(() => {}); await page.waitForTimeout(600); }
  // スクロールできるもの: ページ自体、または画面に見えている内側の枠(押した点がその枠の中)。押す点は、スクロールできるものの中の点だけ
  const pts = await page.evaluate(() => { const P = [[200, 520], [60, 620], [330, 420]]; const docTall = document.documentElement.scrollHeight > innerHeight + 60;
    const sc = [...document.querySelectorAll('*')].filter(el => /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 40);
    return P.filter(([x, y]) => { const hit = document.elementFromPoint(x, y); if (!hit) return false; const inFixed = (n) => { for (; n && n !== document.body; n = n.parentElement) if (getComputedStyle(n).position === 'fixed') return true; return false; }; if (docTall) return !inFixed(hit); return sc.some(el => el.contains(hit)); }); });
  if (!pts.length) { r[k] = 'short'; continue; }
  const res = [];
  for (const [x, y] of pts) { await reset(); await page.waitForTimeout(150); await swipe(x, y); res.push(await moved()); }
  r[k] = res.every(n => n > 100) ? true : `NG ${res.join('/')}`;
}
// 画面いっぱいのポップアップ(連絡帳の連絡事項の編集)の中で何度スワイプしても、後ろのページは動かない(中だけ動く)
await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'print', pid: null, t: Date.now() }))); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
await reset(); await page.evaluate(() => { const bt = [...document.querySelectorAll('button')].find(b => b.textContent.trim().startsWith('各種入力')); if (bt) bt.click(); }); await page.waitForTimeout(500);
await page.getByTestId('cb-hub-renraku').click({ timeout: 8000 }); await page.waitForTimeout(600);
const before = await page.evaluate(() => window.scrollY); for (let i = 0; i < 5; i++) await swipe(200, 560);
const after = await page.evaluate(() => window.scrollY); const inner = await moved();
r.modalBackStays = (before === after && inner > 0) ? true : `NG ${before}->${after} inner ${inner}`;
console.log(r, Object.values(r).every(v => v === true || v === 'short') ? 'PASS' : 'FAIL'); await b.close();
