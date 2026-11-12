// 2026-11-12 調査用: スマホの「操作」小窓(TsuPhoneFold sheet)の中のボタンを順に押し、新しく出た部品が画面の外・小窓の後ろに出ていないかを調べる
//   node chk/probe_1112sheets.mjs [port]
import { chromium } from 'playwright';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
const page = await ctx.newPage(); page.on('dialog', d => d.dismiss().catch(() => {}));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(900); }
await page.evaluate(() => { localStorage.setItem('tsumugiSidebarOpen', '0'); localStorage.setItem('tsumugiTpDriveAck', String(Date.now())); });
const VIEWS = [['record', 'record'], ['print', 'renraku'], ['diary', 'diary'], ['monitoring', 'monitoring']];
const snapshot = () => page.evaluate(() => {
  const out = []; document.querySelectorAll('body *').forEach(el => { const cs = getComputedStyle(el); if ((cs.position === 'fixed' || cs.position === 'absolute') && cs.display !== 'none' && cs.visibility !== 'hidden') { const r = el.getBoundingClientRect(); if (r.width >= 60 && r.height >= 30) out.push({ tag: el.tagName, id: el.getAttribute('data-testid') || '', cls: String(el.className).slice(0, 60), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), z: cs.zIndex, pos: cs.position }); } }); return out; });
for (const [view, key] of VIEWS) {
  await page.evaluate((v) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: null, t: Date.now() })), view);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 400 }).catch(() => {});
  const fb = page.getByTestId(`fold-btn-${key}`); if (!(await fb.count())) { console.log(`[${view}] 操作ボタンなし`); continue; }
  const n = await (async () => { await fb.click(); await page.waitForTimeout(400); const c = await page.locator(`[data-testid="fold-body-${key}"] button:visible`).count(); await page.getByTestId(`fold-sheet-close-${key}`).click().catch(() => {}); await page.waitForTimeout(300); return c; })();
  console.log(`[${view}] 小窓の中のボタン ${n} 個`);
  for (let i = 0; i < n; i++) {
    await page.evaluate((v) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: null, t: Date.now() })), view);
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1200); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 400 }).catch(() => {});
    await page.getByTestId(`fold-btn-${key}`).click(); await page.waitForTimeout(400);
    const btn = page.locator(`[data-testid="fold-body-${key}"] button:visible`).nth(i); const label = ((await btn.innerText().catch(() => '')) || (await btn.getAttribute('aria-label')) || (await btn.getAttribute('data-testid')) || '?').replace(/\s+/g, ' ').slice(0, 24);
    const before = await snapshot();
    await btn.click({ timeout: 1500 }).catch(e => console.log(`  [${label}] 押せない: ${String(e.message).split('\n')[0].slice(0, 80)}`)); await page.waitForTimeout(500);
    const after = await snapshot();
    const key2 = (o) => `${o.tag}|${o.id}|${o.cls}|${o.w}x${o.h}`; const bset = new Set(before.map(key2));
    const added = after.filter(o => !bset.has(key2(o)));
    const sheet = after.find(o => o.cls.includes('tsu-fold-sheet') && !o.cls.includes('back'));
    const bad = added.filter(o => (o.y >= 844 - 20) || (o.y + o.h > 844 + 10 && o.y > 400) || (sheet && Number(o.z || 0) < 46 && o.y + o.h > sheet.y && o.y < sheet.y + sheet.h && !o.cls.includes('tsu-fold')));
    const stillSheet = !!(await page.locator(`[data-testid="fold-body-${key}"][data-open="1"]`).count());
    console.log(`  [${label}] 新しい部品 ${added.length} / 小窓は${stillSheet ? '開いたまま' : '閉じた'}${bad.length ? ' ★ 見えない可能性: ' + bad.map(o => `${o.id || o.cls.slice(0, 30)}@y${o.y}+${o.h} z${o.z}`).join(' ; ') : ''}`);
  }
}
await b.close();
