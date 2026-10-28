// 2026-10-28 マニュアル24章「連絡帳」の画面写真: iPad 横(1180×820)で1枚が画面に入る大きさ(試験版 trial440)
//   見本の事業所名・電話は架空(（見本）つむぎデイサービス・03-0000-0000)に置き換えて撮る
//   実行: node scripts/cb_manual_shot.mjs [--base http://localhost:4175] [--out public/manual/img]
import { chromium } from 'playwright';
import path from 'node:path';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://localhost:4175'); const OUT = arg('--out', 'public/manual/img');
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 1.5, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', hasTouch: true }); const page = await ctx.newPage();
await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const nm = '（見本）つむぎデイサービス', ph = '03-0000-0000';
  d.facilityName = nm; d.facilityPhone = ph; d.contactBookConfig = { ...(d.contactBookConfig || {}), facilityName: nm, facilityPhone: ph }; d.systemSettings = d.systemSettings || {}; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), name: nm, phone: ph, fax: '03-0000-0001' };
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'print', pid: null, t: Date.now() })); });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
const txt = await page.locator('body').innerText(); if (/扇橋|6458/.test(txt)) { console.log('NG: 実在の店舗名・番号が残っている'); process.exit(1); }
const file = path.join(OUT, 'trial_cb_fit.jpg'); await page.screenshot({ path: file, type: 'jpeg', quality: 82 }); console.log('saved', file);
await b.close();
