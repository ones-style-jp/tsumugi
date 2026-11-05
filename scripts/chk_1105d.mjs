// 2026-11-05 1105d(安定版・不具合修正): スマホの利用者マスタで利用開始日・利用終了日の年が見切れない・状態と利用開始日は横に並ぶ
//   実行: node scripts/chk_1105d.mjs [port]
import { chromium, devices } from 'playwright';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4173';
const b = await chromium.launch(); let ok = true;
for (const [label, dev] of [['phone', devices['iPhone 13']], ['pc', { viewport: { width: 1366, height: 900 } }]]) {
  const ctx = await b.newContext({ ...dev, locale: 'ja-JP' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept());
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const p = d.patients.find(x => x.status === '利用中'); p.startDate = '2025-01-27'; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'master', pid: p.id, t: Date.now() })); });
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
  const r = await page.evaluate(() => { const ys = [...document.querySelectorAll('input[aria-label="年"]')]; return { n: ys.length, notCut: ys.every(y => y.scrollWidth <= y.clientWidth + 1), sw: document.documentElement.scrollWidth <= window.innerWidth + 1 }; });
  console.log(label, r); if (!(r.n >= 2 && r.notCut && r.sw)) ok = false; await ctx.close();
}
await b.close(); console.log(ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
