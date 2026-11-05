// 2026-11-05 trial526: クラス在籍表の「待ち」は22字まで(印刷で1行約11字×2行)・改行は行の残りも数える・前に保存した長い文は消えない
//   実行: node scripts/chk_1105crwait.mjs [port]
import { chromium } from 'playwright';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
const b = await chromium.launch(); const r = {};
const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage();
page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 160)));
const open = async () => {
  await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'class_roster', pid: null, date: null, t: Date.now() })));
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1600); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 600 }).catch(() => {});
};
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
await open();
const ta = page.locator('textarea[data-testid^="cr-wait-"]').first();
r.found = (await ta.count()) > 0;
const k = r.found ? (await ta.getAttribute('data-testid')).replace('cr-wait-', '') : '';
// 1) 30字入れると22字で止まる
await ta.fill('あ'.repeat(30)); await page.waitForTimeout(150); r.cap22 = [...(await ta.inputValue())].length === 22;
// 2) 3字で改行 → 11字使ったことになり、残りは11字
await ta.fill('いうえ\n' + 'お'.repeat(20)); await page.waitForTimeout(150); r.nlCounts = (await ta.inputValue()) === 'いうえ\n' + 'お'.repeat(11);
await ta.blur(); await page.waitForTimeout(400);
// 3) 前に保存した長い文(40字)は開き直しても消えず、1字消す直しもできる
await page.evaluate((k) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.systemSettings = d.systemSettings || {}; d.systemSettings.classRosterWait = { ...(d.systemSettings.classRosterWait || {}), [k]: 'か'.repeat(40) }; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); }, k);
await open();
const ta2 = page.locator(`textarea[data-testid="cr-wait-${k}"]`);
r.oldKept = [...(await ta2.inputValue())].length === 40;
await ta2.click(); await page.keyboard.press('End'); await page.keyboard.press('Backspace'); await page.waitForTimeout(150);
r.oldShrink = [...(await ta2.inputValue())].length === 39;
await page.keyboard.type('き'); await page.waitForTimeout(150);
r.oldNoGrow = [...(await ta2.inputValue())].length <= 39;
console.log(JSON.stringify(r));
await b.close(); const ok = Object.values(r).every(Boolean); console.log(ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
