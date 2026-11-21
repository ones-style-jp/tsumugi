// 2026-11-19 店舗データ(appData)の上位キーの棚卸し(テスト店舗・架空)。同期の合成に入っていないキーを探すため。
//   値は出さない(キー名・型・件数/長さだけ)。  LIVE_URL=https://tsumugi-git-trial-ones-style.vercel.app node scripts/live_keys.mjs
import { chromium } from 'playwright';
const BASE = (process.env.LIVE_URL || 'https://tsumugi-git-trial-ones-style.vercel.app').replace(/\/$/, '');
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept());
await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
await page.evaluate(() => { localStorage.setItem('tsumugiSidebarOpen', '0'); localStorage.setItem('tsumugiDeviceName', 'live-keys'); });
await page.locator('input[autocomplete^="username"]').first().fill('test'); await page.locator('input[autocomplete="current-password"]').first().fill('testoooo');
await page.locator('button[type=submit]:visible, button:visible:has-text("ログイン")').first().click(); await page.waitForTimeout(7000);
for (let i = 0; i < 6; i++) {
  const body = await page.locator('body').innerText();
  if (/管理者パスワードを入力/.test(body)) { const inp = page.locator('input[type=password]:visible, input[type=text]:visible, input:not([type]):visible').last(); await inp.fill('test1234'); await inp.press('Enter'); await page.waitForTimeout(1500); await page.locator('button:visible', { hasText: /^(入る|確認|OK|ログイン|決定)$/ }).first().click({ timeout: 800 }).catch(() => {}); await page.waitForTimeout(4000); continue; }
  if (/どなたですか/.test(body)) { const el = page.locator('button:visible', { hasText: /試験 管理者/ }).first(); if (await el.count()) { await el.evaluate(x => x.click()); await page.waitForTimeout(3000); continue; } }
  if (/この端末の名前/.test(body)) { const inp = page.locator('input[type=text]:visible, input:not([type]):visible').first(); if (await inp.count()) { await inp.fill('live-keys'); await inp.press('Enter'); await page.waitForTimeout(2000); continue; } }
  if (!/どなたですか|パスワード|この端末の名前/.test(body)) break; await page.waitForTimeout(3000);
}
await page.waitForTimeout(8000);
const keys = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3') || '{}'); return Object.keys(d).sort().map(k => { const v = d[k]; const t = Array.isArray(v) ? `array(${v.length})` : (v && typeof v === 'object') ? `object(${Object.keys(v).length})` : typeof v; return `${k}: ${t}`; }); });
console.log(keys.join('\n'));
await b.close();
