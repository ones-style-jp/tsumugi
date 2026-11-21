// 2026-10-28 深夜 マニュアル24章「個人ファイルは左にカテゴリ」の画面写真(試験版 trial453・iPad 横)
//   見本の利用者で撮る。事業所名・電話は架空に置き換え、実在の店舗名・番号が画面の文字にも入力欄にも残っていたら止める
//   実行: node scripts/pf_manual_shot_1028.mjs [--base http://localhost:4175] [--out public/manual/img]
import { chromium } from 'playwright';
import path from 'node:path';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://localhost:4175'); const OUT = arg('--out', 'public/manual/img');
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1180, height: 720 }, deviceScaleFactor: 1.5, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept());
await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const nm = '（見本）つむぎデイサービス', ph = '03-0000-0000'; d.facilityName = nm; d.facilityPhone = ph;
  d.systemSettings = d.systemSettings || {}; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), name: nm, phone: ph, fax: '03-0000-0001', address: '東京都新宿区西新宿2-8-1' };
  (d.patients || []).forEach((p, i) => { p.address = '東京都新宿区西新宿2-8-1'; p.addressBuilding = ''; p.addressRoom = ''; p.prefecture = ''; p.city = ''; p.addressLine = ''; p.zipCode = ''; p.phone = `03-0000-${String(1000 + i).slice(-4)}`; p.phoneMobile = ''; p.familyPhone = ''; p.familyPhoneMobile = ''; }); // 見本の利用者の住所・電話も架空に
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'master', pid: null, t: Date.now() })); });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
await page.evaluate(() => { const el = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && /^要(介護|支援)\d$/.test((e.textContent || '').trim())); if (el) el.click(); }); await page.waitForTimeout(1200);
await page.locator('button:visible', { hasText: /個人ファイル/ }).first().click(); await page.waitForTimeout(1500);
const t = await page.locator('body').innerText(); const v = await page.evaluate(() => [...document.querySelectorAll('input,textarea,select')].map(e => e.value).join(' '));
if (/扇橋|6458|ひかり/.test(t + v)) { console.log('NG: 実在の店舗名・番号が残っている'); process.exit(1); }
await page.getByTestId('personal-file-modal').locator('> div').first().screenshot({ path: path.join(OUT, 'trial_pf_vnav.jpg'), type: 'jpeg', quality: 82 }); console.log('saved trial_pf_vnav.jpg');
await b.close();
