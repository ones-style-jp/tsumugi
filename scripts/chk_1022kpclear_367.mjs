// 2026-10-22 試験版: 提供記録でテンキーを閉じたら、選んでいたマスの黄色い枠と行の黄色も消える
//   ①同じマスをもう一度押す ②テンキーの × ③Esc ④テンキーの外の空いた所 → どれも 枠なし・行の黄色なし
//   ⑤別の行のマスを押す → テンキーは新しいマスで開き、新しい行だけ黄色・新しいマスに枠
//   スマホ(390px)のカードでも①
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4187'; })();
const b = await chromium.launch(); const r = {};
async function open(opt) { const ctx = await b.newContext({ locale: 'ja-JP', timezoneId: 'Asia/Tokyo', ...opt }); const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'record', pid: null, t: Date.now() }))); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
  await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 600 }).catch(() => {}); return page; }
const kpOpen = (page) => page.locator('button:visible', { hasText: /^36\.$/ }).count().then(n => n > 0);
const curRows = (page, sel) => page.locator(`${sel}[data-rv-cur]`).evaluateAll(els => els.map(e => e.getAttribute('data-rv-pid') || e.getAttribute('data-rec-card')));
const amber = (loc) => loc.evaluate(e => /ring-amber-300/.test(e.className));
// ---- iPad 横(表) ----
{ const page = await open({ viewport: { width: 1180, height: 820 }, hasTouch: true });
  const rows = page.locator('#record-table tr[data-rv-pid]:not([data-rv-status="欠席"]):not([data-rv-status="休業"]):not([data-rv-status="休止"])');
  const pidAt = (i) => rows.nth(i).getAttribute('data-rv-pid'); const p0 = await pidAt(0), p1 = await pidAt(1);
  const temp = (pid) => page.locator(`#record-table tr[data-rv-pid="${pid}"] input[inputmode="decimal"]`).first();
  const state = async () => ({ kp: await kpOpen(page), cur: await curRows(page, '#record-table tr'), a0: await amber(temp(p0)), a1: await amber(temp(p1)) });
  await temp(p0).click(); await page.waitForTimeout(400); let s = await state(); console.log('open', JSON.stringify(s)); r.open = s.kp && s.cur.length === 1 && s.cur[0] === p0 && s.a0;
  await temp(p0).click(); await page.waitForTimeout(400); s = await state(); console.log('retap', JSON.stringify(s)); r.retapClears = !s.kp && s.cur.length === 0 && !s.a0;
  await temp(p0).click(); await page.waitForTimeout(400); r.reopen = await kpOpen(page);
  await page.locator('button:visible').filter({ has: page.locator('svg.lucide-x') }).filter({ hasNotText: /./ }).last().click().catch(() => console.log('no x')); await page.waitForTimeout(400);
  s = await state(); console.log('x', JSON.stringify(s)); r.xClears = !s.kp && s.cur.length === 0 && !s.a0;
  await temp(p0).click(); await page.waitForTimeout(400); await page.keyboard.press('Escape'); await page.waitForTimeout(400); s = await state(); console.log('esc', JSON.stringify(s)); r.escClears = !s.kp && s.cur.length === 0 && !s.a0;
  await temp(p0).click(); await page.waitForTimeout(400); await page.mouse.click(600, 60); await page.waitForTimeout(500); s = await state(); console.log('outside', JSON.stringify(s)); r.outsideClears = !s.kp && s.cur.length === 0 && !s.a0;
  await temp(p0).click(); await page.waitForTimeout(400); await temp(p1).click(); await page.waitForTimeout(500); s = await state(); console.log('other', JSON.stringify(s)); r.otherRow = s.kp && s.cur.length === 1 && s.cur[0] === p1 && s.a1 && !s.a0;
  await page.context().close(); }
// ---- スマホ(カード) ----
{ const page = await open({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const card = page.locator('.tsu-rv-cards [data-rec-card]').first(); const cid = await card.getAttribute('data-rec-card');
  const cell = card.locator('button:visible', { hasText: /体温/ }).first();
  const st = async () => ({ kp: await kpOpen(page), cur: await curRows(page, '.tsu-rv-cards [data-rec-card]'), act: await cell.evaluate(e => /border-amber-500/.test(e.className)) });
  await cell.click(); await page.waitForTimeout(500); let s = await st(); console.log('phone open', JSON.stringify(s)); r.phoneOpen = s.kp && s.cur.length === 1 && s.cur[0] === cid;
  await cell.click(); await page.waitForTimeout(500); s = await st(); console.log('phone retap', JSON.stringify(s)); r.phoneRetap = !s.kp && s.cur.length === 0 && !s.act;
  await page.context().close(); }
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
