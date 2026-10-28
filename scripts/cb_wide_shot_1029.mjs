// 2026-10-29 マニュアル24章「大きい画面の連絡帳」の写真(24インチくらいの画面=1920×1080 を 1600×900 で保存)
//   見本データの実在の店舗名・電話は shot_fictional.mjs で架空に置き換えて撮る
//   実行: node --import ./scripts/shot_fictional.mjs scripts/cb_wide_shot_1029.mjs [--base http://localhost:4175] [--out public/manual/img]
import { chromium } from 'playwright';
import path from 'node:path';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://localhost:4175'); const OUT = arg('--out', 'public/manual/img');
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1600 / 1920, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept());
await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
await page.evaluate(() => { localStorage.setItem('tsumugiSidebarOpen', '1'); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'print', pid: null, ampm: 'PM', t: Date.now() })); });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2200); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
const t = await page.locator('body').innerText(); if (/扇橋|6458|ひかり|佐藤 健一|高橋|岩岡|長谷川|田中/.test(t)) { console.log('NG: 実在のものが残っている'); process.exit(1); }
await page.screenshot({ path: path.join(OUT, 'trial_cb_wide.jpg'), type: 'jpeg', quality: 82 }); console.log('saved trial_cb_wide.jpg');
await b.close();
