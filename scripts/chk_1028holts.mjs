// 2026-10-28 施設休業日が消える件の対策: 登録・削除で時刻(_holTs)が刻まれ、変更ログに「施設休業日 休業日 a日→b日」が残る。再読込しても残る
//   (同期で時刻の新しい方を採る規則 pickHolidays は src/lib/logic.test.js で確かめる)
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4173'; })();
const b = await chromium.launch(); const r = {};
const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage();
page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
const st = () => page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3') || '{}'); return { n: (d.holidays || []).length, ts: Number(d._holTs) || 0, log: (d.auditLog || []).filter(x => x && x.cat === '施設休業日').map(x => x.detail) }; });
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.holidays = []; delete d._holTs; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'settings', pid: null, t: Date.now() })); });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
const nameIn = page.locator('input[placeholder="例: 夏季休暇"]').first(); await nameIn.scrollIntoViewIfNeeded();
const box = nameIn.locator('xpath=ancestor::div[contains(@class,"bg-slate-50")][1]');
await box.locator('input[type=date]').nth(0).fill('2026-12-29'); await box.locator('input[type=date]').nth(1).fill('2026-12-31'); await nameIn.fill('年末年始');
const t0 = Date.now(); await box.getByRole('button', { name: '登録' }).click(); await page.waitForTimeout(1500);
const s1 = await st(); r.added = s1.n === 3; r.stamped = s1.ts >= t0 - 60000; r.logAdd = s1.log.includes('休業日 0日→3日'); if (!(r.added && r.stamped && r.logAdd)) console.log('S1', s1);
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
const s2 = await st(); r.keptAfterReload = s2.n === 3 && s2.ts === s1.ts && /年末年始/.test(await page.locator('body').innerText());
await page.waitForTimeout(20);
const row = page.locator('div.rounded-xl', { hasText: '年末年始' }).filter({ has: page.locator('button[title="削除"]') }).last(); await row.scrollIntoViewIfNeeded();
await row.locator('button[title="削除"]').click(); await page.waitForTimeout(1500);
const s3 = await st(); r.removedStamped = s3.n === 0 && s3.ts > s1.ts && s3.log.includes('休業日 3日→0日'); if (!r.removedStamped) console.log('S3', s3);
await b.close();
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); process.exit(Object.values(r).every(Boolean) ? 0 : 1);
