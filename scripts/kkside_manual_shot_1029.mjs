// 2026-10-29 マニュアル24章「計画書は左に縦の並び」の画面写真(試験版 trial455・iPad 横)
//   見本の利用者(架空の名前)で撮る。実在の店舗名・番号が画面の文字にも入力欄の中にも残っていたら止める
//   実行: node scripts/kkside_manual_shot_1029.mjs [--base http://localhost:4175] [--out public/manual/img]
import { chromium } from 'playwright';
import path from 'node:path';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://localhost:4175'); const OUT = arg('--out', 'public/manual/img');
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1180, height: 760 }, deviceScaleFactor: 1.5, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept());
await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.systemSettings = d.systemSettings || {};
  d.systemSettings.addons = { ...(d.systemSettings.addons || {}), tsusho_keikaku: true, kinou_keikaku: true, kasan_kagaku: true, kasan_adl: true };
  d.facilityName = '（見本）つむぎデイサービス'; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), name: '（見本）つむぎデイサービス', phone: '03-0000-0000', fax: '03-0000-0001', address: '東京都新宿区西新宿2-8-1' };
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0');
  sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'kinou_patient', pid: null, t: Date.now() })); });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
const t = await page.locator('body').innerText(); const v = await page.evaluate(() => [...document.querySelectorAll('input,textarea,select')].map(e => e.value).join(' '));
if (/扇橋|6458|ひかり/.test(t + v)) { console.log('NG: 実在の店舗名・番号が残っている'); process.exit(1); }
await page.screenshot({ path: path.join(OUT, 'trial_kk_side.jpg'), type: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: 1180, height: 560 } }); console.log('saved trial_kk_side.jpg');
await b.close();
