import { chromium } from 'playwright';
const OUT = '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad';
const W = Number(process.env.W || 440); const VIEW = process.env.VIEW || 'monitoring';
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: W, height: 900 }, isMobile: true, hasTouch: true, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.goto('http://localhost:4174/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
if (VIEW === 'monitoring') await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const t = new Date(); const per = `${t.getFullYear()}年${t.getMonth() + 1}月`; const L = '体調不良や通院（抜歯予定を含む）により3回の欠席がありました。参加した日程では、バイクやマシンを使った運動に意欲的に取り組まれ、帰宅時も満足そうなご様子でした。';
  const ps = d.patients.slice(0, 3); d.monitoringRecords = ps.map((p, i) => ({ id: 'm' + i, patientId: p.id, period: per, confirmed: i === 0, sheet: { s1: { sel: '一部実施できなかった', text: L }, goal: { sel: '評価困難', text: L }, s2: { sel: '概ね満足', text: L } } }));
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); });
await page.evaluate((v) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: null, t: Date.now() })), VIEW); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
const m = await page.evaluate((W) => { const out = []; document.querySelectorAll('body *').forEach(e => { const r = e.getBoundingClientRect(); if (r.width > 0 && r.right > W + 2 && !e.closest('[aria-hidden=true]')) { const cs = getComputedStyle(e); out.push({ tag: e.tagName, cls: String(e.className || '').slice(0, 60), tid: e.getAttribute('data-testid') || '', w: Math.round(r.width), right: Math.round(r.right), minW: cs.minWidth, width: cs.width }); } }); const sc = [...document.querySelectorAll('*')].filter(e => { const cs = getComputedStyle(e); return (cs.overflowX === 'auto' || cs.overflowX === 'scroll') && e.scrollWidth > e.clientWidth + 1; }).map(e => ({ tag: e.tagName, cls: String(e.className || '').slice(0, 50), id: e.id, sw: e.scrollWidth, cw: e.clientWidth })); return { n: out.length, first: out.slice(0, 12), sc }; }, W);
console.log(JSON.stringify(m, null, 1).slice(0, 3000));
if (VIEW === 'monitoring') { const t = page.locator('.tsu-mon-text', { hasText: 'バイク' }).first(); if (await t.count()) await t.scrollIntoViewIfNeeded(); }
await page.screenshot({ path: `${OUT}/dbg_${VIEW}_${W}.png` }); await b.close();
