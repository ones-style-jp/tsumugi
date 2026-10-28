// 2026-10-28 マニュアル24章「スマホの送迎表・提供記録の見出し・全画面」の画面写真(試験版 trial444)
//   ①スマホの送迎表(日付の右に AM/PM・帯に日付なし・施設に到着なし) ②iPad の提供記録の全画面の帯(「10月28日」・「通常画面」)
//   見本の事業所名・住所・電話は架空に置き換えて撮る(実在の店舗名・番号が残っていたら止める)
//   実行: node scripts/tp_rec_manual_shots_1028.mjs [--base http://localhost:4175] [--out public/manual/img]
import { chromium } from 'playwright';
import path from 'node:path';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://localhost:4175'); const OUT = arg('--out', 'public/manual/img');
const b = await chromium.launch();
const seed = async (page, view) => { await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  await page.evaluate((view) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const nm = '（見本）つむぎデイサービス', ph = '03-0000-0000';
    d.facilityName = nm; d.facilityPhone = ph; d.contactBookConfig = { ...(d.contactBookConfig || {}), facilityName: nm, facilityPhone: ph };
    d.systemSettings = d.systemSettings || {}; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), name: nm, phone: ph, fax: '03-0000-0001', address: '東京都新宿区西新宿2-8-1', closedDays: [0] }; d.holidays = [];
    const t = new Date(); const iso = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; const dow = t.getDay();
    d.diarySettings = d.diarySettings || {}; d.diarySettings.cars = [{ id: 'c1', name: '1号車', type: '', cap: '6' }, { id: 'c2', name: '2号車', type: '', cap: '6' }];
    const act = d.patients.filter(p => p.status === '利用中' && !p.endDate).slice(0, 10);
    act.forEach((p, i) => { p.scheduleAmPm = ['', '', '', '', '', '', '']; p.scheduleAmPm[dow] = i < 6 ? 'AM' : 'PM'; p.pauseHistory = []; p.scheduleChangeHistory = [];
      p.address = '東京都新宿区西新宿2-8-1'; p.addressBuilding = ''; p.addressRoom = ''; p.prefecture = ''; p.city = ''; p.addressLine = ''; p.phone = `03-0000-00${String(10 + i)}`; p.phoneMobile = ''; p.familyPhone = ''; p.familyPhoneMobile = ''; p.pickupPlace = i % 2 ? '玄関前' : ''; });
    const mk = (L, h) => ({ cars: { c1: L.slice(0, 3).map((p, i) => ({ pid: p.id, t: `${h}:${30 + i * 5}` })), c2: L.slice(3, 6).map((p, i) => ({ pid: p.id, t: `${h}:${40 + i * 5}` })) }, walkers: [], others: [], un: [], driver: { c1: '見本 運転一', c2: '見本 運転二' }, _savedAt: Date.now() });
    d.transportPlans = { [`${iso}_AM`]: mk(act.slice(0, 6), 8), [`${iso}_PM`]: { ...mk(act.slice(6, 10), 12) } };
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0');
    sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view, pid: null, ampm: 'AM', t: Date.now() })); }, view);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {}); };
const guard = async (page) => { const t = await page.locator('body').innerText(); if (/扇橋|6458/.test(t)) { console.log('NG: 実在の店舗名・番号が残っている'); process.exit(1); } };
// ① スマホの送迎表
{ const ctx = await b.newContext({ viewport: { width: 393, height: 760 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept());
  await seed(page, 'transport'); await page.getByTestId('tp-drive-ok').click({ timeout: 1500 }).catch(() => {}); await page.waitForTimeout(400);
  await page.getByTestId('tp-phone-ap-AM').click(); await page.waitForTimeout(400); await guard(page);
  await page.screenshot({ path: path.join(OUT, 'trial_tp_phone_ap.jpg'), type: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: 393, height: 620 } }); console.log('saved trial_tp_phone_ap.jpg');
  await ctx.close(); }
// ② iPad の提供記録の全画面の帯
{ const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 1.5, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept());
  await seed(page, 'record'); await page.getByTestId('rec-act-fullscreen').click(); await page.waitForTimeout(1200);
  if (await page.getByTestId('fs-pick').count()) await page.getByTestId('fs-pick-zoom').click(); await page.waitForTimeout(800); await guard(page);
  await page.getByTestId('rec-fs-bar').screenshot({ path: path.join(OUT, 'trial_rec_fs_bar.jpg'), type: 'jpeg', quality: 82 }); console.log('saved trial_rec_fs_bar.jpg');
  await ctx.close(); }
await b.close();
