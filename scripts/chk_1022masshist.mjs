// 2026-10-22 不具合修正: 介護整体の「直近の実施」に別の店舗の記録(同じ番号の別の方・この店舗にいない担当)を出さない
//   見本: 同じ方・この店舗の担当 → 出る ／ この店舗にいない担当 → 出ない ／ 名前が違う(同じ番号の別の方) → 出ない
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4173'; })();
const b = await chromium.launch(); const r = {};
const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'record', pid: null, t: Date.now() }))); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 600 }).catch(() => {});
const row = page.locator('#record-table tr[data-rv-pid]:not([data-rv-status="欠席"]):not([data-rv-status="休業"]):not([data-rv-status="休止"])').first();
const pid = await row.getAttribute('data-rv-pid');
const info = await page.evaluate((pid) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const p = (d.patients || []).find(x => String(x.id) === String(pid)); const staff = (d.systemSettings && d.systemSettings.massageStaff) || []; return { name: p && p.name, staff, pidRaw: p && p.id }; }, pid);
const y = new Date().getFullYear(); const dn = ['日','月','火','水','木','金','土'];
await page.evaluate(({ info, y, dn }) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3'));
  const mk = (id, m, day, extra) => ({ id, patientId: info.pidRaw, name: info.name, date: `${m}月${day}日`, year: y, dayOfWeek: dn[new Date(y, m - 1, day).getDay()], status: '出席', exercises: {}, ...extra });
  d.ticketRecords = (d.ticketRecords || []).filter(t => !String(t.id).startsWith('tst_mh_'));
  d.ticketRecords.push(mk('tst_mh_ok', 10, 1, { massage: info.staff[1] }));
  d.ticketRecords.push(mk('tst_mh_other_staff', 10, 8, { massage: '他店担当' }));
  d.ticketRecords.push(mk('tst_mh_other_name', 10, 15, { massage: info.staff[2], name: '別人 花子' }));
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); }, { info, y, dn });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 600 }).catch(() => {});
const cell = page.locator(`#record-table tr[data-rv-pid="${pid}"] td button`, { hasText: /^選ぶ$/ }).first();
await cell.click(); await page.waitForTimeout(500);
const hist = await page.evaluate(() => { const lbl = [...document.querySelectorAll('div')].find(e => e.textContent === '直近の実施(タップで選択)'); if (!lbl) return []; return [...lbl.parentElement.querySelectorAll('button')].filter(bt => /月|\//.test(bt.textContent) && bt.querySelector('span')).map(bt => bt.textContent); });
console.log('hist', JSON.stringify(hist));
r.okShown = hist.some(h => h.includes(info.staff[1]) && /10\/01|10月1日|10-01/.test(h) || h.includes(info.staff[1]));
r.otherStaffHidden = !hist.some(h => h.includes('他店担当'));
r.otherNameHidden = !hist.some(h => /10月15日|10\/15|10-15/.test(h));
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
