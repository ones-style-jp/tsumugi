// 2026-11-13: node chk/perf_tpdrag.mjs — 見本ビルド(:4175)で見本データを入れ、送迎表の車→車ドラッグの「離してから描画まで」と長いタスクを測る(trial572 の計測用)
// 送迎表のドラッグ後の重さを測る(見本データ70名): 長いタスクと、離してから画面が変わるまでの時間
import { chromium } from 'playwright';
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
const page = await ctx.newPage(); page.on('dialog', d => d.accept().catch(() => {}));
await page.goto('http://localhost:4175/', { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(900); }
await page.evaluate(() => { localStorage.setItem('tsumugiSidebarOpen', '0'); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'settings', pid: null, t: Date.now() })); });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 400 }).catch(() => {});
const fill = page.getByTestId('demo-fill'); for (const lab of [/^データ/, /^システム$/]) { if (await fill.count()) break; const tb = page.locator('button:visible', { hasText: lab }).first(); if (await tb.count()) { await tb.click().catch(() => {}); await page.waitForTimeout(600); } }
if (await fill.count()) { await fill.click(); await page.waitForFunction(() => /入れました|入れられません/.test(document.querySelector('[data-testid="demo-msg"]')?.textContent || ''), null, { timeout: 180000 }); console.log('demo', await page.getByTestId('demo-msg').innerText()); }
await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, t: Date.now() })));
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 400 }).catch(() => {});
await page.evaluate(() => { window.__lt = []; try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]))).observe({ type: 'longtask', buffered: true }); } catch {} });
const rows = page.locator('[data-tprow]'); console.log('rows', await rows.count());
const r0 = rows.first(); const pid = await r0.getAttribute('data-tppid'); const iso = await r0.getAttribute('data-tpiso'); const sl = await r0.getAttribute('data-tpslot'); const cid0 = await r0.getAttribute('data-tpcid');
const bb = await r0.boundingBox(); console.log('first row', pid, iso, sl, cid0, bb);
const tgt = page.locator(`[data-tprow][data-tpiso="${iso}"][data-tpslot="${sl}"]:not([data-tpcid="${cid0}"])`).first(); const hasT = await tgt.count();
const tb = hasT ? await tgt.boundingBox() : null; console.log('target', hasT, tb && await tgt.getAttribute('data-tpcid'));
if (bb && tb) {
  await page.evaluate(() => { window.__lt = []; });
  await page.mouse.move(bb.x + 60, bb.y + bb.height / 2); await page.mouse.down(); await page.waitForTimeout(350); await page.mouse.move(bb.x + 70, bb.y + bb.height / 2 + 6, { steps: 3 }); await page.waitForTimeout(100);
  await page.mouse.move(tb.x + 60, tb.y + tb.height / 2, { steps: 12 }); await page.waitForTimeout(150);
  const tUp = await page.evaluate(() => performance.now()); await page.mouse.up();
  const moved = await page.waitForFunction(([pid, iso, sl, cid0]) => { const el = document.querySelector(`[data-tprow][data-tpiso="${iso}"][data-tpslot="${sl}"][data-tppid="${pid}"]`); return el && el.getAttribute('data-tpcid') !== cid0; }, [pid, iso, sl, cid0], { timeout: 30000 }).then(() => true).catch(() => false);
  const tDone = await page.evaluate(() => performance.now());
  console.log('moved', moved, 'ms from mouseup to DOM change:', Math.round(tDone - tUp));
  console.log('long tasks (start,ms):', JSON.stringify(await page.evaluate(() => window.__lt.slice(-15))));
  // 2回目(続けて動かすと重いか)
  const r1 = page.locator(`[data-tprow][data-tpiso="${iso}"][data-tpslot="${sl}"][data-tppid="${pid}"]`).first(); const b1 = await r1.boundingBox(); const t1 = page.locator(`[data-tprow][data-tpiso="${iso}"][data-tpslot="${sl}"][data-tpcid="${cid0}"]`).first(); const tb1 = await t1.boundingBox();
  if (b1 && tb1) { await page.evaluate(() => { window.__lt = []; }); await page.mouse.move(b1.x + 60, b1.y + b1.height / 2); await page.mouse.down(); await page.waitForTimeout(350); await page.mouse.move(b1.x + 70, b1.y + b1.height / 2 + 6, { steps: 3 }); await page.mouse.move(tb1.x + 60, tb1.y + tb1.height / 2, { steps: 12 }); await page.waitForTimeout(150);
    const u2 = await page.evaluate(() => performance.now()); await page.mouse.up();
    const ok2 = await page.waitForFunction(([pid, iso, sl, cid0]) => { const el = document.querySelector(`[data-tprow][data-tpiso="${iso}"][data-tpslot="${sl}"][data-tppid="${pid}"]`); return el && el.getAttribute('data-tpcid') === cid0; }, [pid, iso, sl, cid0], { timeout: 30000 }).then(() => true).catch(() => false);
    const d2 = await page.evaluate(() => performance.now()); console.log('2nd moved', ok2, 'ms:', Math.round(d2 - u2), 'long tasks:', JSON.stringify(await page.evaluate(() => window.__lt.slice(-15)))); }
} else console.log('no drag target found');
await b.close();
