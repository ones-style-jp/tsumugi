// 2026-11-07 trial529: カレンダーの予定に「終わりの日」(何日か続く予定)。今日10:00〜あさって15:00 を入れると 3日とも月の表に出る・詳細は期間・ホームの本日の予定にも期間
//   実行: node scripts/chk_1107cal.mjs [port]
import { chromium } from 'playwright';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const t0 = new Date(); const today = iso(t0); const d2 = new Date(t0); d2.setDate(t0.getDate() + 2); const end = iso(d2);
const b = await chromium.launch(); const r = {};
const page = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
const go = async (view) => { await page.evaluate((view) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view, pid: null, t: Date.now() })), view); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {}); };
await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.scheduleEvents = []; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); });
await go('schedule');
await page.locator('button:visible', { hasText: /^予定を追加$/ }).first().click(); await page.waitForTimeout(400);
await page.locator('input[placeholder^="タイトル"]').fill('三日続く研修テスト');
const dt = page.locator('input[type="date"]:visible').first(); await dt.fill(today);
const times = page.locator('input[type="time"]:visible'); await times.nth(0).fill('10:00'); await times.nth(1).fill('15:00');
r.endField = (await page.getByTestId('sch-end-date').count()) === 1;
await page.getByTestId('sch-end-date').fill(end); await page.waitForTimeout(200);
await page.getByTestId('sch-modal-save').click(); await page.waitForTimeout(800);
const ev = await page.evaluate(() => (JSON.parse(localStorage.getItem('daycareAppData_v3')).scheduleEvents || []).find(e => e.title === '三日続く研修テスト'));
r.saved = !!ev && ev.date === today && ev.endDate === end && ev.start === '10:00' && ev.end === '15:00';
// 月の表: 3日とも出る(開始の日は時刻、続きの日は「（続き）」)
const cnt = await page.locator(':visible', { hasText: /三日続く研修テスト/ }).evaluateAll(els => els.filter(el => !el.children.length || [...el.childNodes].some(n => n.nodeType === 3 && /三日続く研修テスト/.test(n.textContent))).length);
r.shownOn3Days = cnt >= 3; if (!r.shownOn3Days) console.log('count', cnt);
r.contLabel = (await page.locator(':visible', { hasText: /（続き）三日続く研修テスト/ }).count()) > 0;
// 詳細は期間
await page.locator(':visible', { hasText: /^10:00〜 三日続く研修テスト/ }).last().click().catch(async () => { await page.getByText('三日続く研修テスト').first().click(); }); await page.waitForTimeout(400);
const body = await page.evaluate(() => document.body.innerText); r.detailRange = /〜\s*\d+月\d+日\([^)]+\)\s*15:00/.test(body); if (!r.detailRange) console.log('BODY', body.slice(0, 400));
// 同じ日にする: 終わりの日を開始日と同じにすると endDate は消える
await page.keyboard.press('Escape').catch(() => {});
// ホームの本日の予定に期間
await go('dashboard');
const home = await page.evaluate(() => document.body.innerText);
const m1 = Number(today.slice(5, 7)), dd1 = Number(today.slice(8, 10)), m2 = Number(end.slice(5, 7)), dd2 = Number(end.slice(8, 10));
r.homeRange = home.includes(`${m1}/${dd1} 10:00〜${m2}/${dd2} 15:00`); if (!r.homeRange) console.log('HOME', home.slice(0, 600));
console.log(r); const ok = Object.values(r).every(Boolean); console.log(ok ? 'PASS' : 'FAIL'); await b.close(); process.exit(ok ? 0 : 1);
