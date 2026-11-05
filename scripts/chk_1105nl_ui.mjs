// 2026-11-05 trial525: 特記(提供記録 入力)の数が改行でその行の残りも増える・上限で止まる
//   実行: node scripts/chk_1105nl_ui.mjs [port]
import { chromium } from 'playwright';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
const b = await chromium.launch(); let ok = true;
for (const [label, dev] of [['pc', { viewport: { width: 1366, height: 900 } }]]) { // スマホの特記は1行の入力欄(改行が入らない)ので対象外
  const page = await (await b.newContext({ ...dev, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 160)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
  await page.locator('button:visible, a:visible', { hasText: /サービス提供記録 入力/ }).first().click({ timeout: 3000 }).catch(async () => { await page.locator('button[aria-label*="メニュー"], button:has(svg.lucide-menu)').first().click().catch(() => {}); await page.waitForTimeout(400); await page.locator('button:visible', { hasText: /サービス提供記録 入力/ }).first().click().catch(() => {}); });
  await page.waitForTimeout(1500); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
  const ta = page.locator('textarea[placeholder="特記事項..."]:visible, textarea[placeholder="欠席理由等..."]:visible').first();
  const n = await ta.count(); if (!n) { console.log(label, 'tokki textarea not found'); ok = false; continue; }
  await ta.fill(''); await ta.fill('あいう\n'); await page.waitForTimeout(200);
  const cnt = await ta.evaluate(el => { const sp = [...el.parentElement.querySelectorAll('span')].find(s => / \/ 100$/.test(s.textContent)); return sp ? sp.textContent : ''; });
  await ta.fill('\n'.repeat(3)); await page.waitForTimeout(200); const v3 = await ta.inputValue();
  const r = { count_after_nl: cnt === '50 / 100', two_lines_max: v3.length === 2 };
  console.log(label, r, JSON.stringify(cnt)); if (!Object.values(r).every(Boolean)) ok = false;
}
await b.close(); console.log(ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
