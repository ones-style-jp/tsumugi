// 2026-10-22 試験版: iPad(縦・横)で本画面が出たあと・画面を移ったあとに、上の帯(header)が作り直される(古い描き跡を残さない)。パソコンでは作り直さない
import { webkit, chromium, devices } from 'playwright';
const PORT = process.argv[2] || '4173'; const r = {};
const run = async (eng, dev, tag, wantRemount) => { const b = await eng.launch(); const ctx = await b.newContext({ ...dev, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 160)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  await page.evaluate(() => { sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'dashboard', pid: null, t: Date.now() })); }); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(300);
  await page.evaluate(() => { window.__hdr0 = document.querySelector('header.tsu-app-header'); });
  await page.waitForTimeout(2500); const re1 = await page.evaluate(() => !!document.querySelector('header.tsu-app-header') && document.querySelector('header.tsu-app-header') !== window.__hdr0);
  await page.evaluate(() => { window.__hdr1 = document.querySelector('header.tsu-app-header'); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'record', pid: null, t: Date.now() })); });
  const txt = await page.locator('header.tsu-app-header h1').innerText();
  await page.waitForTimeout(2500); // 描き直しが落ち着くまで
  const nz = await page.evaluate(() => ({ n: window.__tsuScaleNudged || 0, meta: document.querySelector('meta[name="viewport"]').getAttribute('content'), sc: window.visualViewport ? window.visualViewport.scale : 1 })); console.log(tag, 'nudge', JSON.stringify(nz));
  r[`${tag}_nudge`] = wantRemount ? (nz.n >= 1 && /maximum-scale=4\.0/.test(nz.meta) && Math.abs(nz.sc - 1) < 0.01) : nz.n === 0; // 最後は元の 4.0 に戻っている
  r[`${tag}_load`] = re1 === wantRemount && /ホーム/.test(txt); await b.close(); };
await run(webkit, devices['iPad (gen 7) landscape'], 'ipadL', true);
await run(webkit, devices['iPad Pro 11'], 'ipadP', true);
await run(chromium, { viewport: { width: 1440, height: 900 } }, 'pc', false);
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL');
