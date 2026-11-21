// 分析: (稼働)利用者属性がスマホで1列・はみ出しなし／(個人)枠が端から端まで・記録が少ないとグラフが枠の幅いっぱい・PCは従来の余白
import { chromium } from 'playwright';
const OUT = '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad';
const PORT = process.env.PORT || 4173; const PERSONAL = process.env.PERSONAL !== '0';
const b = await chromium.launch(); const r = {};
const today = new Date(); const ymd = (d) => `${d.getMonth() + 1}月${d.getDate()}日`;
for (const W of [390, 440, 1280]) {
  const page = await (await b.newContext({ viewport: { width: W, height: 900 }, ...(W < 800 ? { isMobile: true, hasTouch: true } : {}), locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
  page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'dash_operation', pid: null, t: Date.now() }))); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800);
  await page.locator('button', { hasText: /^利用者属性$/ }).first().click().catch(() => {}); await page.waitForTimeout(1200);
  const op = await page.evaluate((W) => { const root = document.getElementById('tsuContentScroller'); const h = [...document.querySelectorAll('div')].find(d => d.textContent.trim() === '■ 介護度内訳'); const card = h && h.parentElement; const over = card ? [...card.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > W + 1).length : -1; const rc = card && card.getBoundingClientRect(); return { over, cardL: rc && Math.round(rc.left), cardR: rc && Math.round(rc.right) }; }, W);
  r[`opNoOverflow_${W}`] = op.over === 0 && op.cardR <= W + 1; if (!r[`opNoOverflow_${W}`]) console.log(W, op);
  if (W < 800) { await page.locator('text=■ 介護度内訳').first().scrollIntoViewIfNeeded(); await page.screenshot({ path: `${OUT}/dash_op_${W}.png` }); }
  if (PERSONAL) {
    const pid = await page.evaluate((ds) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const p = d.patients[0]; const y = new Date().getFullYear();
      // 今月の記録を2件だけ(グラフが少ない場合)
      d.ticketRecords = (d.ticketRecords || []).filter(r => r.patientId !== p.id); ds.forEach((dt, i) => d.ticketRecords.push({ id: `t_${p.id}_${i}`, patientId: p.id, date: dt, year: y, status: '出席', kibunArrival: i ? '普通' : '良い', kibunDeparture: '良い', temp_AM: '36.5', bpUpSt_AM: '128', bpDnSt_AM: '78', plSt_AM: '70', _savedAt: Date.now() }));
      localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); return p.id; }, [ymd(new Date(today.getFullYear(), today.getMonth(), 1)), ymd(new Date(today.getFullYear(), today.getMonth(), 2))]);
    await page.evaluate((pid) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'dash_personal', pid, t: Date.now() })), pid); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2200);
    const pm = await page.evaluate((W) => { const root = document.getElementById('print-content-analysis'); const cs = getComputedStyle(root); const cards = [...root.querySelectorAll('div')].filter(e => { const r = e.getBoundingClientRect(); const c = getComputedStyle(e); return r.width > W * 0.8 && r.height > 80 && c.backgroundColor === 'rgb(255, 255, 255)'; }); const full = cards.filter(e => { const r = e.getBoundingClientRect(); return r.left <= 0.5 && Math.abs(r.right - W) <= 1.5; }).length;
      const svgs = [...root.querySelectorAll('svg')].filter(s => s.getAttribute('width') && Number(s.getAttribute('height')) >= 100 && s.closest('[style*="overflow-x"]')); const fill = svgs.map(s => { const box = s.closest('[style*="overflow-x"]'); return Math.round(Number(s.getAttribute('width')) / box.clientWidth * 100); });
      return { padL: cs.paddingLeft, nCards: cards.length, full, fill }; }, W);
    console.log(W, JSON.stringify(pm));
    if (W < 800) { r[`personalBleed_${W}`] = pm.full >= 2; } else { r.personalPcPad = pm.padL === '24px'; }
    r[`chartFill_${W}`] = pm.fill.length >= 1 && pm.fill.every(f => f >= 90 && f <= 101);
    if (W < 800) await page.screenshot({ path: `${OUT}/dash_personal_${W}.png`, fullPage: false });
  }
  await page.context().close();
}
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
