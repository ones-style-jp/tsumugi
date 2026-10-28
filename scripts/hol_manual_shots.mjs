// 2026-10-28 マニュアル24章「施設休業日：午前のみ・午後のみ」の画面写真(試験版 trial441)
//   ①各種設定→事業所情報の施設休業日(半日の印・登録の時間帯) ②月間スケジュールの「休業」の小窓 ③月間スケジュールのマス(午前だけ休業)
//   見本の事業所名・住所・電話は架空に置き換えて撮る(実在の店舗名・番号が残っていたら止める)
//   実行: node scripts/hol_manual_shots.mjs [--base http://localhost:4175] [--out public/manual/img]
import { chromium } from 'playwright';
import path from 'node:path';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://localhost:4175'); const OUT = arg('--out', 'public/manual/img');
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 1.5, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage();
page.on('dialog', d => d.accept());
await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const now = new Date(); const Y = now.getFullYear(), M = now.getMonth() + 1; const last = new Date(Y, M, 0).getDate();
const pad = (n) => String(n).padStart(2, '0');
const D = Math.min(last, now.getDate() + 2); const ISO = `${Y}-${pad(M)}-${pad(D)}`; const D2 = Math.min(last, D + 1);
const name = await page.evaluate(([Y, ISO]) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const nm = '（見本）つむぎデイサービス', ph = '03-0000-0000';
  d.facilityName = nm; d.facilityPhone = ph; d.contactBookConfig = { ...(d.contactBookConfig || {}), facilityName: nm, facilityPhone: ph };
  d.systemSettings = d.systemSettings || {}; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), name: nm, phone: ph, fax: '03-0000-0001', address: '東京都新宿区西新宿2-8-1', closedDays: [0] };
  const p = (d.patients || []).find(x => x.status === '利用中' && !x.endDate); p.scheduleAmPm = ['', 'AM', 'AM', 'AM', 'AM', 'AM', 'AM']; p.scheduleChangeHistory = []; p.pauseHistory = [];
  const mk = ISO.slice(0, 7); d.monthlyShifts = d.monthlyShifts || {}; d.monthlyShifts[mk] = d.monthlyShifts[mk] || {}; d.monthlyShifts[mk][p.id] = {};
  d.holidays = [{ date: ISO, name: '雪のため', ampm: 'AM' }, { date: `${Y}-11-20`, name: '研修', ampm: 'PM' }, { date: `${Y}-12-29`, name: '年末年始' }, { date: `${Y}-12-30`, name: '年末年始' }, { date: `${Y}-12-31`, name: '年末年始' }].filter((h, i, a) => a.findIndex(x => x.date === h.date) === i);
  delete d._holTs; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); return p.name; }, [Y, ISO]);
const go = async (view) => { await page.evaluate((v) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: null, t: Date.now() })), view); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2200); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {}); };
const guard = async () => { const t = await page.locator('body').innerText(); const v = await page.evaluate(() => [...document.querySelectorAll('input,textarea')].map(e => e.value).join(' ')); if (/扇橋|6458/.test(t + v)) { console.log('NG: 実在の店舗名・番号が残っている'); process.exit(1); } };
// ① 各種設定の施設休業日
await go('settings'); await page.locator('button:visible', { hasText: /^事業所情報$/ }).first().click().catch(() => {}); await page.waitForTimeout(800); await guard();
await page.getByTestId('hol-add-ap-AM').click(); await page.waitForTimeout(200);
const card = page.locator('div.scroll-mt-20', { has: page.locator('text=施設休業日の設定') }).first(); await card.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
await card.screenshot({ path: path.join(OUT, 'trial_hol_settings.jpg'), type: 'jpeg', quality: 82 }); console.log('saved trial_hol_settings.jpg');
// ② ③ 月間スケジュール
await go('master'); await page.locator('button:visible').filter({ hasText: new RegExp('^' + name) }).first().click(); await page.waitForTimeout(1200);
await page.locator('button:visible', { hasText: /^サービス提供内容$/ }).first().click(); await page.waitForTimeout(800); await guard();
const strip = page.locator('.tsu-mstrip').first(); await strip.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
await strip.screenshot({ path: path.join(OUT, 'trial_hol_strip.jpg'), type: 'jpeg', quality: 82 }); console.log('saved trial_hol_strip.jpg');
await page.getByTestId(`ms-cell-${D2}-AM`).click(); await page.waitForTimeout(400);
await page.locator('button:visible', { hasText: /^休業（店舗の休業日にする）$/ }).first().click(); await page.waitForTimeout(400);
await page.getByTestId('ms-storehol-name').fill('雪のため'); await page.waitForTimeout(200);
await page.locator('[data-testid="ms-storehol-modal"] > div').first().screenshot({ path: path.join(OUT, 'trial_hol_modal.jpg'), type: 'jpeg', quality: 82 }); console.log('saved trial_hol_modal.jpg');
await b.close();
