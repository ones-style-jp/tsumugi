// 2026-10-28 提供記録(スマホ)の「利用者」一覧から方を選ぶと、その方のカードへ移る(背面を止める仕組みを入れた後も動くか)
//   iPhone 相当(touch)と Android 相当で: 一覧を開く → 後ろの方(20番目)を押す → その方のカードが上の帯のすぐ下に来る・黄色く光る
//   --fs: 全画面でも(全画面の帯の「利用者」から)同じ(試験版)
//   実行: node scripts/chk_1028recjump.mjs [--port 4175] [--fs]
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4175'; })(); const FS = process.argv.includes('--fs');
const b = await chromium.launch(); const r = {};
for (const [k, ua] of [['iphone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'], ['android', 'Mozilla/5.0 (Linux; Android 13; CPH2437) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36']]) {
  const ctx = await b.newContext({ viewport: { width: 393, height: 780 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, userAgent: ua, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => d.accept());
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const dow = new Date().getDay();
    d.systemSettings = d.systemSettings || {}; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [] }; d.holidays = [];
    d.patients.filter(p => p.status === '利用中' && !p.endDate).slice(0, 24).forEach(p => { p.scheduleAmPm = ['', '', '', '', '', '', '']; p.scheduleAmPm[dow] = 'AM'; p.scheduleChangeHistory = []; p.pauseHistory = []; });
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0');
    sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'record', pid: null, ampm: 'AM', t: Date.now() })); });
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
  if (FS) { await page.getByTestId('fold-btn-record').click().catch(() => {}); await page.waitForTimeout(400); await page.getByTestId('rec-act-fullscreen').click(); await page.waitForTimeout(900); r[`${k}_fsBtn`] = (await page.getByTestId('fs-rec-jump').count()) > 0; if (!r[`${k}_fsBtn`]) { await ctx.close(); continue; } await page.getByTestId('fs-rec-jump').click(); }
  else await page.getByTestId('rec-fold-jump').click();
  await page.waitForTimeout(700);
  const items = page.getByTestId('rec-jump-item'); const n = await items.count(); const idx = Math.min(19, n - 1);
  const sheetTop = (await page.getByTestId('rec-jump').boundingBox())?.y || 0; const barBottom = FS ? ((await page.getByTestId('rec-fs-bar').boundingBox()) || {}) : {};
  r[`${k}_sheetBelowBar`] = !FS || Math.abs(sheetTop - (barBottom.y + barBottom.height)) < 4;
  r[`${k}_sheetOnTop`] = await page.evaluate(() => { const s = document.querySelector('[data-testid="rec-jump"]'); if (!s) return false; const bb = s.querySelector('[data-testid="rec-jump-list"]').getBoundingClientRect(); const el = document.elementFromPoint(bb.x + 20, bb.y + 20); return !!(el && s.contains(el)); });
  const nm = (await items.nth(idx).innerText()).split('\n')[0].trim();
  await items.nth(idx).tap(); await page.waitForTimeout(1600);
  const res = await page.evaluate((nm) => { const cards = [...document.querySelectorAll('[data-rec-card]')]; const c = cards.find(x => (x.innerText || '').trim().startsWith(nm)); if (!c) return null;
    const bar = document.querySelector('[data-testid="rec-fs-bar"]') || document.querySelector('.tsu-pin'); const off = bar ? bar.getBoundingClientRect().bottom : 96; return { top: Math.round(c.getBoundingClientRect().top), off: Math.round(off), lock: document.documentElement.classList.contains('tsu-back-lock'), open: !!document.querySelector('[data-testid="rec-jump"]') }; }, nm);
  console.log(k, FS ? 'fs' : 'normal', 'pick', idx, nm, res); r[`${k}_jumped`] = !!res && Math.abs(res.top - res.off - 8) < 40 && !res.lock && !res.open;
  await ctx.close();
}
await b.close();
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
