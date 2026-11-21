// 2026-10-21 送迎表の週の運行表: 1枚に入りきらない(車4台・1コマ28名)ときは午前1枚・午後1枚に分けて全員が載る／入るときは1枚のまま
//   ＋(試験版のみ・--opt) ダウンロードの「送りの時間も入れる」を外すと、週・1日の運行表に送りの時間が出ない
//   使い方: node scripts/chk_1021tpsplit.mjs [port] [--opt]
import { chromium } from 'playwright';
const PORT = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '4185'; const OPT = process.argv.includes('--opt');
const b = await chromium.launch(); const r = {};
const mon = new Date(); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7)); const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const days = Array.from({ length: 6 }, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return isoOf(d); });
async function run(big) {
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 160)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  const names = await page.evaluate(([days, big]) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3'));
    const caps = big ? [8, 8, 7, 7] : [7, 6, 5]; const sizes = big ? [8, 7, 7, 6] : [6, 5, 4]; const per = sizes.reduce((a, x) => a + x, 0);
    d.diarySettings.cars = caps.map((c, i) => ({ id: 'c' + (i + 1), name: `${i + 1}号車`, type: '', cap: String(c) }));
    const act = d.patients.filter(p => p.status === '利用中').slice(0, per * 2); const tp = {}; const used = new Set();
    days.forEach(iso => ['AM', 'PM'].forEach((sl, si) => { const L = act.slice(si * per, si * per + per); let o = 0; const cars = {}; sizes.forEach((n, ci) => { cars['c' + (ci + 1)] = L.slice(o, o + n).map((p, i) => ({ pid: p.id, t: sl === 'AM' ? `8:${String(20 + i * 5).padStart(2, '0')}` : `13:${String(5 + i * 5).padStart(2, '0')}` })); o += n; });
      const dropAt = {}; Object.values(cars).forEach(ms => [...ms].reverse().forEach((m, i) => { dropAt[String(m.pid)] = sl === 'AM' ? `12:${String(10 + i * 6).padStart(2, '0')}` : `16:${String(10 + i * 6).padStart(2, '0')}`; used.add(m.pid); }));
      tp[`${iso}_${sl}`] = { cars, walkers: [], others: [], un: [], dropAt, _savedAt: Date.now() }; }));
    d.transportPlans = tp; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); return d.patients.filter(p => used.has(p.id)).map(p => p.name); }, [days, big]);
  await page.evaluate((iso) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, date: iso, t: Date.now() })), days[0]);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 800 }).catch(() => {});
  const cap = async (mode, dropOff) => { await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 800 }).catch(() => {}); await page.waitForTimeout(200); await page.evaluate(() => { window.__ph = ''; window.addEventListener('setPrintHtml', e => { window.__ph = (e.detail && e.detail.html) || ''; }, { once: true }); });
    await page.locator('button:visible', { hasText: /^ダウンロード$/ }).first().click(); await page.waitForTimeout(400);
    if (mode === 'days') { await page.locator('button:visible', { hasText: /^日ごと/ }).first().click(); await page.waitForTimeout(200); }
    if (dropOff) { if (mode === 'week') await page.getByTestId('tp-print-drop-none').check(); else await page.getByTestId('tp-print-dropat').locator('input').uncheck(); } else if (mode === 'week') await page.getByTestId('tp-print-drop-col').check().catch(() => {});
    await page.locator('button:visible', { hasText: /^ダウンロード$/ }).last().click(); await page.waitForTimeout(1500);
    const ph = await page.evaluate(() => window.__ph); await page.keyboard.press('Escape').catch(() => {}); await page.locator('button:visible', { hasText: /^(閉じる|×|✕)$/ }).last().click().catch(() => {}); await page.waitForTimeout(400); return ph; };
  const w = await cap('week', false);
  const out = { pages: (w.match(/data-page-break="1"/g) || []).length, allNames: names.every(n => w.includes(n)), am: w.includes('運行表（午前）'), drop: />12:\d\d</.test(w) };
  if (OPT) { const w2 = await cap('week', true); out.dropOffWeek = !/>12:\d\d</.test(w2) && />8:\d\d</.test(w2); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500); const d2 = await cap('days', true); out.dropOffDay = !d2.includes('午前　送り') && d2.includes('午前　迎え'); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500); const d3 = await cap('days', false); out.dropOnDay = d3.includes('午前　送り') && /12:\d\d/.test(d3); }
  await ctx.close(); return out;
}
const small = await run(false), big = await run(true);
console.log('small', JSON.stringify(small), 'big', JSON.stringify(big));
r.smallOnePage = small.pages === 1 && small.allNames && !small.am;
r.bigTwoPages = big.pages === 2 && big.allNames && big.am;
if (OPT) { r.dropShown = small.drop === true; r.dropOffWeek = small.dropOffWeek === true; r.dropOffDay = small.dropOffDay === true; r.dropOnDay = small.dropOnDay === true; }
console.log(r, Object.values(r).every(v => v === true) ? 'PASS' : 'FAIL'); await b.close();
