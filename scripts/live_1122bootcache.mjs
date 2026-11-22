// 2026-11-22 trial610: テスト店舗(試験版)で「ログイン直後に端末の控えをすぐ見せる」を実機確認。
//   ログイン→データが入ったら 提供記録入力(午前)を開いた状態で再読み込みし、
//   ①帯「最新の内容を確かめています…」が出る ②行(利用者)がすぐ見える ③帯が消える(取り込み完了) ④消えたあとは押せる、を時間つきで見る。
//   LIVE_URL=https://tsumugi-git-trial-ones-style.vercel.app node scripts/live_1122bootcache.mjs
import { chromium } from 'playwright';
const BASE = (process.env.LIVE_URL || 'https://tsumugi-git-trial-ones-style.vercel.app').replace(/\/$/, '');
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept());
page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
page.on('console', m => { const t = m.text(); if (m.type() !== 'log' && /supabase|pull|load|state|RLS|token|証|403|401/i.test(t)) console.log('CONSOLE', m.type(), t.slice(0, 220)); });
const t0 = Date.now(); await page.goto(BASE + '/', { waitUntil: 'load', timeout: 180000 }); console.log('page load', Math.round((Date.now() - t0) / 1000) + 's'); await page.waitForTimeout(3000);
await page.evaluate(() => { localStorage.setItem('tsumugiSidebarOpen', '0'); localStorage.setItem('tsumugiDeviceName', 'live-boot-' + Math.random().toString(36).slice(2, 6)); });
await page.locator('input[autocomplete^="username"]').first().fill('test'); await page.locator('input[autocomplete="current-password"]').first().fill('testoooo');
const tLogin = Date.now(); await page.locator('button[type=submit]:visible, button:visible:has-text("ログイン")').first().click(); await page.waitForTimeout(5000);
const settle = async () => { for (let i = 0; i < 8; i++) {
  const body = await page.locator('body').innerText();
  if (/管理者パスワードを入力/.test(body)) { const inp = page.locator('input[type=password]:visible, input[type=text]:visible, input:not([type]):visible').last(); await inp.fill('test1234'); await page.waitForTimeout(200); await inp.press('Enter'); await page.waitForTimeout(1500); await page.locator('button:visible', { hasText: /^(入る|確認|OK|ログイン|決定)$/ }).first().click({ timeout: 800 }).catch(() => {}); await page.waitForTimeout(3000); continue; }
  if (/どなたですか/.test(body)) { const el = page.locator('button:visible', { hasText: /試験 管理者/ }).first(); if (await el.count()) { await el.evaluate(b => b.click()); await page.waitForTimeout(2500); continue; } }
  if (/この端末の名前/.test(body)) { const inp = page.locator('input[type=text]:visible, input:not([type]):visible').first(); if (await inp.count()) { await inp.fill('live-boot'); await page.waitForTimeout(200); } await page.locator('button:visible', { hasText: /この名前で保存/ }).first().click({ timeout: 1500 }).catch(() => {}); await page.waitForTimeout(2500); continue; }
  if (!/どなたですか|パスワード|この端末の名前/.test(body)) break; await page.waitForTimeout(2500); } };
await settle(); console.log('login→app', Math.round((Date.now() - tLogin) / 1000) + 's');
await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
const waitData = async () => { for (let i = 0; i < 60; i++) { const n = await page.evaluate(() => { try { const d = JSON.parse(localStorage.getItem('daycareAppData_v3') || '{}'); return d._sbStoreId ? (d.patients || []).length : 0; } catch { return 0; } }); if (n > 0) return n; await page.waitForTimeout(2000); } return 0; };
const nDev = await waitData(); console.log('patients in device(控え・店舗の印つき):', nDev);
if (!nDev) { const lg = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('tsumugiSyncLog') || '[]').slice(-30).map(x => `${x.t || ''} ${x.ev}${x.d ? ' ' + JSON.stringify(x.d).slice(0, 80) : ''}`); } catch { return []; } }); console.log('sync log:', lg.join('\n  ')); console.log('screen:', (await page.locator('body').innerText()).slice(0, 200).replace(/\n+/g, ' / ')); }
// 提供記録入力(午前)を開いた状態で再読み込み
const wd = (() => { const d = new Date(); do { d.setDate(d.getDate() - 1); } while (d.getDay() === 0 || d.getDay() === 6); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })(); // 直近の平日(日曜に走らせても行が出る)
await page.evaluate((wd) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'record', pid: null, ampm: 'AM', date: wd, t: Date.now() })), wd); console.log('見る日:', wd);
const tR = Date.now(); await page.reload({ waitUntil: 'commit' });
let tBanner = 0, tRows = 0, tGone = 0, rowsAtBanner = -1;
for (let i = 0; i < 300; i++) {
  const st = await page.evaluate(() => ({ banner: !!document.querySelector('[data-testid="boot-cache-banner"]'), shield: !!document.querySelector('[data-boot-cache]'), rows: document.querySelectorAll('button.tsu-rv-row').length, picker: /どなたですか/.test(document.body.innerText || '') })).catch(() => null);
  if (!st) { await page.waitForTimeout(100); continue; }
  const el = Date.now() - tR;
  if (st.picker && !tBanner) { const b2 = page.locator('button:visible', { hasText: /試験 管理者/ }).first(); if (await b2.count()) await b2.evaluate(b => b.click()).catch(() => {}); }
  if (st.banner && !tBanner) { tBanner = el; rowsAtBanner = st.rows; }
  if (st.rows > 0 && !tRows) tRows = el;
  if (tBanner && !st.banner && !tGone) { tGone = el; break; }
  await page.waitForTimeout(100);
}
console.log(`再読み込み→帯が出る ${tBanner}ms(そのとき行 ${rowsAtBanner}) ／ 行が見える ${tRows}ms ／ 帯が消える(取り込み完了) ${tGone}ms`);
await page.waitForTimeout(1500);
const after = await page.evaluate(() => ({ shield: !!document.querySelector('[data-boot-cache]'), banner: !!document.querySelector('[data-testid="boot-cache-banner"]'), rows: document.querySelectorAll('button.tsu-rv-row').length, sb: (() => { try { return JSON.parse(localStorage.getItem('daycareAppData_v3') || '{}')._sbStoreId || null; } catch { return null; } })() }));
console.log('取り込み後:', JSON.stringify(after));
// 消えたあとは押せる: 最初の行を押して広がる(クラスか高さが変わる)か、サイドバーのボタンが反応する
const row = page.locator('button.tsu-rv-row').first(); let clickOk = null;
if (await row.count()) { const h0 = await row.evaluate(e => e.getBoundingClientRect().height); await row.click().catch(() => {}); await page.waitForTimeout(700); const h1 = await page.locator('button.tsu-rv-row').first().evaluate(e => e.getBoundingClientRect().height).catch(() => h0); const expanded = await page.evaluate(() => !!document.querySelector('[data-testid="rec-fold-save"], [data-testid="rec-fs-save"], textarea')); clickOk = expanded || h1 !== h0; }
console.log('取り込み後に行を押すと反応する:', clickOk);
const slog = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('tsumugiSyncLog') || '[]').slice(-12).map(x => `${x.ev}${x.d ? ' ' + JSON.stringify(x.d).slice(0, 50) : ''}`); } catch { return []; } });
console.log('sync log(最後の12件):', slog.join(' | '));
const PASS = tBanner > 0 && tRows > 0 && tGone > 0 && tRows <= tGone && !after.shield && after.sb && clickOk !== false;
console.log(PASS ? 'ALL PASS' : 'FAIL');
await b.close(); process.exit(PASS ? 0 : 1);
