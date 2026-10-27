// スマホ縦(提供記録): 血圧の枠が基準値で色分けされる(138/70=橙・147/76=赤・120/70=黒)。体温・脈は従来どおり
import { chromium } from 'playwright';
const OUT = '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad';
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 160)));
await page.goto('http://localhost:4185/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const info = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const t = new Date(); const y = t.getFullYear(), m = t.getMonth() + 1, dd = t.getDate();
  const dow = t.getDay(); const act = d.patients.filter(p => p.status === '利用中'); const ps = act.slice(0, 3);
  ps.forEach(p => { p.scheduleAmPm = p.scheduleAmPm || ['','','','','','','']; p.scheduleAmPm[dow] = 'PM'; });
  d.ticketRecords = (d.ticketRecords || []).filter(r => !ps.some(p => p.id === r.patientId));
  const mk = (p, up, dn, up2, dn2) => ({ id: `tr_${p.id}_${y}_${m}_${dd}`, patientId: p.id, year: y, date: `${m}月${dd}日`, status: '出席', bpUpSt_PM: String(up), bpDnSt_PM: String(dn), bpUpEn_PM: String(up2), bpDnEn_PM: String(dn2), temp_PM: '36.6', plSt_PM: '74' });
  d.ticketRecords.push(mk(ps[0], 138, 70, 147, 76)); d.ticketRecords.push(mk(ps[1], 120, 70, 165, 100)); d.ticketRecords.push(mk(ps[2], 85, 55, 128, 80));
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'record', pid: null, ampm: 'PM', t: Date.now() })); return ps.map(p => p.name); });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
await page.locator('button', { hasText: /^PM$/ }).first().click().catch(() => {}); await page.waitForTimeout(600);
const cls = await page.evaluate(() => { const out = {}; document.querySelectorAll('button, div').forEach(el => { const lbl = el.querySelector(':scope > span.text-\\[12px\\]'); if (!lbl) return; const v = el.querySelector(':scope > span.text-base, :scope > input'); if (!v) return; const key = lbl.textContent.trim(); const val = v.tagName === 'INPUT' ? v.value : v.textContent.trim(); out[key + ':' + val] = v.className; }); return out; });
const has = (k, c) => Object.entries(cls).some(([kk, vv]) => kk === k && vv.includes(c));
const r = { amber138: has('開始 血圧:138/70', 'text-amber-600'), red147: has('終了 血圧:147/76', 'text-red-600'), black120: has('開始 血圧:120/70', 'text-black'), red165: has('終了 血圧:165/100', 'text-red-700'), blue85: has('開始 血圧:85/55', 'text-blue-600'), tempBlack: has('体温:36.6℃', 'text-black') };
await page.screenshot({ path: `${OUT}/bpcolor.png`, fullPage: false });
console.log(Object.keys(cls).slice(0, 12)); console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
