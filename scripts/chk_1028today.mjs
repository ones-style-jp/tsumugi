// 2026-10-28 不具合: 0時〜9時に作った計画書などの日付が前の日になっていた(世界標準時で今日を作っていた)。新規作成の作成日が端末の今日か
//   ※ 0時〜9時に実行すると違いが分かる(それ以外の時間は世界標準時でも同じ日)
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4173'; })();
const b = await chromium.launch(); const r = {};
const page = await (await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage(); page.on('dialog', d => d.accept());
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
const want = await page.evaluate(() => { const d = new Date(); return `令和${d.getFullYear() - 2018}年${d.getMonth() + 1}月${d.getDate()}日`; });
const utc = await page.evaluate(() => { const d = new Date(new Date().toISOString().slice(0, 10)); return `令和${d.getUTCFullYear() - 2018}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日`; });
for (const [view, key] of [['kinou_keikaku', 'kk'], ['tsusho_keikaku', 'tk'], ['seikatsu_kinou', 'sk'], ['kyomi_kanshin', 'ky']]) {
  await page.evaluate((v) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: null, t: Date.now() })), view);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
  await page.locator('button', { hasText: '＋ 新規作成' }).first().click(); await page.waitForTimeout(600);
  const vals = await page.locator('input').evaluateAll(els => els.map(e => e.value).filter(v => /^令和\d+年\d+月\d+日$/.test(v)));
  r[key] = vals.includes(want); if (!r[key]) console.log(key, 'want', want, 'got', vals.slice(0, 3));
}
console.log('device today', want, '/ UTC today', utc, want === utc ? '(同じ日の時間帯: 違いは0〜9時に確かめる)' : '(違う日: このときに確かめた)');
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
