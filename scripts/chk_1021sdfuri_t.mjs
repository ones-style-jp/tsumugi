// 2026-10-21 同じ日の振替(試験版):
//  月間スケジュール(振替元=午前のセルから): 「同じ日の午後へ」→確定 → 記録1件(振替・furikaeAmpm=PM・特記=M月D日AM分振替（理由）)・午前=欠席/午後=振(M/D)
//    → 提供記録: 午後の一覧に出て午前には出ない → 午後で「取り消し」→保存 → 記録なし(または出席)・印なし・午前の一覧に戻る
//  月間スケジュール(振替先=午後のセルから): 振替元の選択肢に「同じ日 午前（同じ日）」→確定 → 同じ形 → 午後のセルで取り消し「出席に戻す」→ 元どおり
//  月間スケジュール: 取り消し「欠席のまま」→ 記録はこの日の欠席(理由つき)・午前=欠席・午後の印なし
//  送迎表: 午前の方を同じ日の午後へ動かす → 同じ形(セルは「振替」) → 午前へ戻す → 取り消し(元どおり)
import { chromium } from 'playwright';
const b = await chromium.launch(); const r = {};
const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.goto('http://localhost:4185/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
// 営業日(月〜土)の、今日以降でいちばん近い日
const base = new Date(); while (base.getDay() === 0) base.setDate(base.getDate() + 1);
const iso = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`; const label = `${base.getMonth() + 1}月${base.getDate()}日`; const mk = iso.slice(0, 7); const dn = base.getDate(); const dow = base.getDay(); const md = `${base.getMonth() + 1}/${dn}`;
const go = async (view, ampm, extra = {}) => { await page.evaluate(([v, a, ex, d]) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: null, date: d, ampm: a, t: Date.now(), ...ex })), [view, ampm, extra, iso]); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 600 }).catch(() => {}); };
const data = () => page.evaluate(() => JSON.parse(localStorage.getItem('daycareAppData_v3')));
const recOf = async (pid) => { const d = await data(); return (d.ticketRecords || []).filter(x => String(x.patientId) === String(pid) && x.date === label); };
const shOf = async (pid) => { const d = await data(); return ((d.monthlyShifts || {})[mk] || {})[pid] || {}; };
const brief = (rs) => JSON.stringify(rs.map(x => ({ s: x.status, fa: x.furikaeAmpm, t: x.tokki })));
const rowPids = () => page.locator('#record-table tr[data-rv-pid]').evaluateAll(els => els.map(e => e.getAttribute('data-rv-pid')));
const save = async () => { await page.locator('button:visible', { hasText: /^保存$/ }).first().click(); await page.waitForTimeout(1500); };
const pickAm = async (skip = []) => { const d = await data(); const p = (d.patients || []).find(x => x.status === '利用中' && (x.scheduleAmPm || [])[dow] === 'AM' && !skip.includes(String(x.id)) && !(d.ticketRecords || []).some(t => t.patientId === x.id && t.date === label && t.status !== '出席') && !Object.keys(((d.monthlyShifts || {})[mk] || {})[x.id] || {}).some(k => k.startsWith(`${dn}_`))); return p ? String(p.id) : null; };
const openMaster = async (pid) => { await go('master', 'AM'); const d = await data(); const nm = ((d.patients || []).find(x => String(x.id) === String(pid)) || {}).name; await page.locator('button:visible').filter({ hasText: new RegExp('^' + nm) }).first().click(); await page.waitForTimeout(1200); await page.locator('button:visible', { hasText: /^サービス提供内容$/ }).first().click({ timeout: 4000 }).catch(() => console.log('tab not found')); await page.waitForTimeout(800); await page.getByTestId(`ms-cell-${dn}-AM`).scrollIntoViewIfNeeded().catch(() => {}); };
const cellClick = async (ap) => { await page.getByTestId(`ms-cell-${dn}-${ap}`).click(); await page.waitForTimeout(400); };
const sdOk = (rs, sh, cellPm) => rs.length === 1 && rs[0].status === '振替' && rs[0].furikaeAmpm === 'PM' && rs[0].tokki.startsWith(`${label}AM分振替`) && sh[`${dn}_AM`] === '欠席' && sh[`${dn}_PM`] === cellPm;
// ---- 1) 月間スケジュール: 午前のセル → 同じ日の午後へ ----
const p1 = await pickAm(); r.has1 = !!p1;
await openMaster(p1); r.cellFound = (await page.getByTestId(`ms-cell-${dn}-AM`).count()) === 1;
await cellClick('AM'); await page.locator('button:visible', { hasText: /^振替$/ }).first().click(); await page.waitForTimeout(400);
r.fwdBtn = (await page.getByTestId('ms-furi-sameday').count()) === 1 && /同じ日の午後へ/.test(await page.getByTestId('ms-furi-sameday').innerText());
await page.getByTestId('ms-furi-sameday').click(); await page.waitForTimeout(200);
await page.locator('input[placeholder^="例: 発熱"]:visible').first().fill('通院');
await page.locator('button:visible', { hasText: /^確定$/ }).last().click(); await page.waitForTimeout(1200);
{ const rs = await recOf(p1), sh = await shOf(p1); console.log('1 fwd', brief(rs), JSON.stringify(sh)); r.fwdSaved = sdOk(rs, sh, `振(${md})`) && /（通院）$/.test(rs[0].tokki); }
await go('record', 'PM'); r.recPmShows = (await rowPids()).includes(p1);
await go('record', 'AM'); r.recAmHides = !(await rowPids()).includes(p1);
// 提供記録の午後で取り消し → 保存
await go('record', 'PM');
await page.locator(`#record-table tr[data-rv-pid="${p1}"] select`).first().selectOption('取り消し'); await page.waitForTimeout(400); await save();
{ const rs = await recOf(p1), sh = await shOf(p1); console.log('1 rec cancel', brief(rs), JSON.stringify(sh)); r.recCancel = (rs.length === 0 || (rs[0].status === '出席' && !rs[0].furikaeAmpm)) && sh[`${dn}_AM`] === undefined && sh[`${dn}_PM`] === undefined; }
await go('record', 'AM'); r.recBackAm = (await rowPids()).includes(p1);
// ---- 2) 月間スケジュール: 午後のセル → 振替元の選択肢に同じ日の午前 → 取り消し(出席に戻す) ----
const p2 = await pickAm([p1]); r.has2 = !!p2; console.log('p', p1, p2);
await openMaster(p2); await cellClick('PM'); await page.locator('button:visible', { hasText: /^振替$/ }).first().click(); await page.waitForTimeout(400);
const opt = page.locator('button:visible', { hasText: new RegExp(`${base.getMonth() + 1}月${dn}日.*午前（同じ日）`) }); r.bwdOption = (await opt.count()) === 1;
if (r.bwdOption) { await opt.click(); await page.waitForTimeout(200); await page.locator('button:visible', { hasText: /^確定$/ }).last().click(); await page.waitForTimeout(1200);
  { const rs = await recOf(p2), sh = await shOf(p2); console.log('2 bwd', brief(rs), JSON.stringify(sh)); r.bwdSaved = sdOk(rs, sh, `振(${md})`); }
  await cellClick('PM'); await page.locator('button:visible', { hasText: /^取り消し$/ }).first().click(); await page.waitForTimeout(400);
  await page.locator('button:visible', { hasText: /「出席」に戻す/ }).first().click(); await page.waitForTimeout(1200);
  { const rs = await recOf(p2), sh = await shOf(p2); console.log('2 restore', brief(rs), JSON.stringify(sh)); r.msRestore = (rs.length === 0 || rs[0].status === '出席') && sh[`${dn}_AM`] === undefined && sh[`${dn}_PM`] === undefined; }
}
// ---- 3) 月間スケジュール: 取り消し「欠席のまま」 ----
const p3 = await pickAm([p1, p2]); r.has3 = !!p3;
await openMaster(p3); await cellClick('AM'); await page.locator('button:visible', { hasText: /^振替$/ }).first().click(); await page.waitForTimeout(400);
await page.getByTestId('ms-furi-sameday').click(); await page.locator('input[placeholder^="例: 発熱"]:visible').first().fill('通院'); await page.locator('button:visible', { hasText: /^確定$/ }).last().click(); await page.waitForTimeout(1200);
await cellClick('PM'); await page.locator('button:visible', { hasText: /^取り消し$/ }).first().click(); await page.waitForTimeout(400);
await page.locator('button:visible', { hasText: /「欠席」のまま/ }).first().click(); await page.waitForTimeout(1200);
{ const rs = await recOf(p3), sh = await shOf(p3); console.log('3 keepAbsent', brief(rs), JSON.stringify(sh)); r.keepAbsent = rs.length === 1 && rs[0].status === '欠席' && /通院/.test(rs[0].tokki || '') && sh[`${dn}_AM`] === '欠席' && sh[`${dn}_PM`] === undefined; }
// ---- 4) 送迎表: 午前→同じ日の午後へ動かす → 午前へ戻す ----
const p4 = await pickAm([p1, p2, p3]); r.has4 = !!p4;
await go('transport', 'AM');
const drag = async (fromSl, toSl) => {
  const d0 = await data(); const nm = ((d0.patients || []).find(x => String(x.id) === String(p4)) || {}).name;
  const row = page.locator(`[data-tpdrop="un"][data-tpiso="${iso}"][data-tpslot="${fromSl}"] span.select-none`, { hasText: nm }).first();
  const zone = page.locator(`[data-tpdrop="un"][data-tpiso="${iso}"][data-tpslot="${toSl}"]`).first();
  if (!(await row.count()) || !(await zone.count())) { console.log('drag target missing', await row.count(), await zone.count()); return false; }
  await row.scrollIntoViewIfNeeded(); const a = await row.boundingBox(); await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.mouse.down(); await page.waitForTimeout(700);
  await zone.scrollIntoViewIfNeeded().catch(() => {}); const z = await zone.boundingBox(); await page.mouse.move(z.x + z.width / 2, z.y + Math.min(z.height - 4, 12), { steps: 8 }); await page.waitForTimeout(200); await page.mouse.up(); await page.waitForTimeout(600); return true; };
r.drag1 = await drag('AM', 'PM');
if (r.drag1) { r.tpTitle = await page.getByText(/を同じ日の振替として登録/).count() > 0; await page.locator('input[placeholder="例: 通院のため"]:visible').first().fill('通院').catch(() => {}); await page.locator('button:visible', { hasText: /^振替を登録$/ }).first().click(); await page.waitForTimeout(1200);
  { const rs = await recOf(p4), sh = await shOf(p4); console.log('4 tp fwd', brief(rs), JSON.stringify(sh)); r.tpSaved = sdOk(rs, sh, '振替') && /（通院）$/.test(rs[0].tokki); }
  r.drag2 = await drag('PM', 'AM');
  if (r.drag2) { r.tpBackTitle = await page.getByText(/の振替を取り消し/).count() > 0; await page.locator('button:visible', { hasText: /^取り消す$/ }).first().click(); await page.waitForTimeout(1200);
    const rs = await recOf(p4), sh = await shOf(p4); console.log('4 tp back', brief(rs), JSON.stringify(sh)); r.tpBack = (rs.length === 0 || (rs[0].status === '出席' && !rs[0].furikaeAmpm)) && sh[`${dn}_AM`] === undefined && sh[`${dn}_PM`] === undefined; }
}
console.log(r, Object.values(r).every(v => v === true) ? 'PASS' : 'FAIL'); await b.close();
