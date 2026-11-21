// 2026-10-29 マニュアル24章「保存していない項目の印・送迎表の変更の色」の画面写真(試験版 trial454・iPad 横)
//   ①各種設定: 事業所名を書きかえて、左の「事業所情報」に印・保存の左に「保存していない入力があります」が出たところ
//   ②送迎表: 運行表を出した後の変更(1件は連絡済・1件は要連絡)
//   事業所名・住所・電話・FAX は架空に置き換えて撮る。実在の店舗名・番号が画面の文字にも入力欄の中にも残っていたら止める
//   実行: node scripts/trial454_manual_shots_1029.mjs [--base http://localhost:4175] [--out public/manual/img]
import { chromium } from 'playwright';
import path from 'node:path';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://localhost:4175'); const OUT = arg('--out', 'public/manual/img');
const b = await chromium.launch();
const guard = async (page) => { const t = await page.locator('body').innerText(); const v = await page.evaluate(() => [...document.querySelectorAll('input,textarea,select')].map(e => e.value).join(' '));
  if (/扇橋|6458|ひかり/.test(t + v)) { console.log('NG: 実在の店舗名・番号が残っている'); process.exit(1); } };
const open = async (seed) => { const ctx = await b.newContext({ viewport: { width: 1180, height: 760 }, deviceScaleFactor: 1.5, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept());
  await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  await page.evaluate(seed); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
  return { ctx, page }; };
const facility = (d) => { const nm = '（見本）つむぎデイサービス', ph = '03-0000-0000';
  d.facilityName = nm; d.facilityPhone = ph; d.contactBookConfig = { ...(d.contactBookConfig || {}), facilityName: nm, facilityPhone: ph };
  d.systemSettings = d.systemSettings || {}; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), name: nm, phone: ph, fax: '03-0000-0001', address: '東京都新宿区西新宿2-8-1', zip: '', zipCode: '', building: '', email: '' }; };
// ① 各種設定の印
{ const { ctx, page } = await open(new Function(`const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); (${facility.toString()})(d);
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0');
    sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'settings', pid: null, t: Date.now() }));`));
  await page.evaluate(() => { const el = [...document.querySelectorAll('[data-testid="settings-content"] input')].find(e => e.value === '（見本）つむぎデイサービス'); if (el) el.setAttribute('data-shot-name', '1'); });
  await page.locator('input[data-shot-name="1"]').fill('（見本）つむぎデイサービス 本店'); await page.waitForTimeout(700);
  if (!(await page.getByTestId('settings-dirty-facility').count())) { console.log('NG: 印が出ていない'); process.exit(1); }
  await guard(page);
  await page.screenshot({ path: path.join(OUT, 'trial_settings_unsaved.jpg'), type: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: 1180, height: 420 } }); console.log('saved trial_settings_unsaved.jpg');
  await ctx.close(); }
// ② 送迎表の変更の一覧
{ const { ctx, page } = await open(new Function(`const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); (${facility.toString()})(d);
    const t = new Date(); const iso = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'); const dow = t.getDay();
    d.systemSettings.facilityInfo.closedDays = []; d.holidays = []; d.diarySettings.cars = [{ id: 'c1', name: '1号車', type: '', cap: '8' }];
    const [A, B] = d.patients.filter(p => p.status === '利用中' && !p.endDate); [A, B].forEach(p => { p.scheduleAmPm = ['', '', '', '', '', '', '']; p.scheduleAmPm[dow] = 'AM'; p.pauseHistory = []; });
    const ca = Date.now() - 5000;
    d.transportPlans = { [iso + '_AM']: { cars: { c1: [{ pid: A.id, t: '8:57' }, { pid: B.id, t: '9:05' }] }, walkers: [], others: [], un: [], _base: { cars: { c1: [{ pid: A.id, t: '8:55' }, { pid: B.id, t: '9:00' }] }, walkers: [], others: [] }, _baseAt: Date.now() - 86400000 * 3, _baseId: 'b1', _chgAt: { [A.id]: ca, [B.id]: ca }, _telDone: { [A.id]: { ck: String(ca), on: true, t: Date.now() } }, _savedAt: Date.now() } };
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0');
    sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, t: Date.now() }));`));
  await page.locator('button:visible', { hasText: /変更\s*\d/ }).first().click(); await page.waitForTimeout(800);
  await guard(page);
  await page.getByTestId('tp-chg-panel').screenshot({ path: path.join(OUT, 'trial_tp_chg_colors.jpg'), type: 'jpeg', quality: 85 }); console.log('saved trial_tp_chg_colors.jpg');
  await ctx.close(); }
await b.close();
