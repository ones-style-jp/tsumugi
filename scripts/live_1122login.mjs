// 2026-11-22 1122e: 安定版(本番)にテスト店舗の ID でログインできるか(試験版でログインするとパスワードの保存形式が scrypt になり、1122d までの安定版では「IDまたはパスワードが違います」になった)
//   LIVE_URL=https://tsumugi.ones-style.co.jp node scripts/live_1122login.mjs
import { chromium } from 'playwright';
const BASE = (process.env.LIVE_URL || 'https://tsumugi.ones-style.co.jp').replace(/\/$/, '');
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept());
await page.goto(BASE + '/', { waitUntil: 'load', timeout: 180000 }); await page.waitForTimeout(3000);
await page.locator('input[autocomplete^="username"]').first().fill('test'); await page.locator('input[autocomplete="current-password"]').first().fill('testoooo');
const t0 = Date.now(); await page.locator('button[type=submit]:visible, button:visible:has-text("ログイン")').first().click();
let res = 'timeout';
for (let i = 0; i < 40; i++) { const body = await page.locator('body').innerText(); if (/IDまたはパスワードが違います/.test(body)) { res = 'wrong'; break; } if (/どなたですか|この端末の名前|管理者パスワードを入力|ホーム/.test(body) && !/事業所スタッフ専用ログイン/.test(body)) { res = 'ok'; break; } await page.waitForTimeout(500); }
const ver = await page.evaluate(() => fetch('/version.json?t=' + Date.now()).then(r => r.json()).then(j => j.version).catch(() => '?'));
console.log(`${BASE} 版=${ver} ログイン=${res} (${((Date.now() - t0) / 1000).toFixed(1)}秒)`);
await b.close(); console.log(res === 'ok' ? 'PASS' : 'FAIL'); process.exit(res === 'ok' ? 0 : 1);
