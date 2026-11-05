// 2026-11-05 1105c(安定版・不具合修正): 写真が読めないときは「写真を読み込めません」・担当者会議の「検討した項目」の欄が枠からはみ出さない
//   実行: node scripts/chk_1105c.mjs [port]
import { chromium, devices } from 'playwright';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4173';
const b = await chromium.launch(); const all = {};
for (const [label, dev] of [['pc', { viewport: { width: 1366, height: 900 } }], ['phone', devices['iPhone 13']]]) {
  const r = {}; const ctx = await b.newContext({ ...dev, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage();
  page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
  const pid = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const p = d.patients.find(x => x.status === '利用中');
    p.personalFile = { ...(p.personalFile || {}), meetings: [] }; p.docBurden = [{ id: 'b1', name: 'image.jpg', type: 'image/jpeg', data: 'data:image/jpeg;base64,AAAA', uploadedAt: '2026年8月4日' }];
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); return p.id; });
  const openPF = async (tab) => { await page.evaluate(([pid, tab]) => { sessionStorage.setItem('tsumugiReopenPF', JSON.stringify(tab ? { patientId: pid, tab } : { patientId: pid })); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'master', pid, t: Date.now() })); }, [pid, tab]); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2200); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {}); };
  await openPF(null); await page.getByTestId('personal-file-modal').getByText('基本情報', { exact: true }).locator('visible=true').first().click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(800);
  r.img_missing_shown = await page.getByTestId('stored-image-missing').count() >= 1;
  await openPF('cat_3'); await page.locator('[data-testid="personal-file-modal"] button:visible', { hasText: /ケアプラン・担当者会議/ }).first().click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(300);
  await page.locator('button', { hasText: '+ 新規作成' }).first().click(); await page.waitForTimeout(500);
  r.content_in_card = await page.evaluate(() => { const ta = [...document.querySelectorAll('textarea')].find(t => (t.placeholder || '').startsWith('〇様子')); if (!ta) return false; const c = ta.parentElement.getBoundingClientRect(), t = ta.getBoundingClientRect(); return t.top >= c.top - 1 && t.bottom <= c.bottom + 1; });
  all[label] = r; console.log(label, r); await ctx.close();
}
await b.close(); const ok = Object.values(all).every(r => Object.values(r).every(Boolean)); console.log(ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
