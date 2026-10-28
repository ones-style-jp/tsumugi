// 2026-10-28 ユーザー報告「体力測定で『全員』にしているのに、午前の方が帰ると午後の方だけになる(AM を押すと午前の方、PM で午後の方)」
//   見本の2人を 今日の午前(A)・午後(B) の利用にし、どちらも今日の提供記録は出席・体力測定は未実施。提供記録などの AM/PM を「PM」にした状態で開く
//   ①「全員」の当日出席に A・B の両方 ②AM=A だけ・PM=B だけ ③全員に戻すと両方
//   --trial: ④スマホで、前の画面で選んでいた方がいても、開いたら名簿が出る(利用者マスタと同じ)
//   実行: node scripts/chk_1028fitall.mjs [--port 4175] [--trial]
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4175'; })(); const TRIAL = process.argv.includes('--trial');
const b = await chromium.launch(); const r = {};
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage();
page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => d.accept());
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const info = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const t = new Date(); const dow = t.getDay(); const md = `${t.getMonth() + 1}月${t.getDate()}日`;
  d.systemSettings = d.systemSettings || {}; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [] }; d.holidays = [];
  const ps = (d.patients || []).filter(p => p.status === '利用中' && !p.endDate && (p.name || '').trim()).slice(0, 2); if (ps.length < 2) return null;
  ['AM', 'PM'].forEach((v, i) => { const p = ps[i]; p.scheduleAmPm = ['', '', '', '', '', '', '']; p.scheduleAmPm[dow] = v; p.scheduleChangeHistory = []; p.pauseHistory = []; });
  const ids = ps.map(p => p.id);
  d.fitnessRecords = (d.fitnessRecords || []).filter(f => !ids.includes(f.patientId));
  d.ticketRecords = (d.ticketRecords || []).filter(x => !(ids.includes(x.patientId) && x.date === md));
  ps.forEach(p => d.ticketRecords.push({ id: `tr_fit_${p.id}`, patientId: p.id, name: p.name, kana: p.kana || '', date: md, year: t.getFullYear(), status: '出席', tokki: '', _savedAt: Date.now() }));
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); return { A: { id: ps[0].id, name: ps[0].name }, B: { id: ps[1].id, name: ps[1].name } }; });
r.seed = !!info; if (!info) { console.log('NO SEED'); process.exit(1); }
await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'fitness', pid: null, ampm: 'PM', t: Date.now() })));
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
const present = async () => { const g = page.locator('div.border-blue-400', { hasText: '当日出席' }).first(); if (!(await g.count())) return ''; return g.innerText(); };
const has = (t) => ({ A: t.includes(info.A.name), B: t.includes(info.B.name) });
const all1 = has(await present()); console.log('全員', all1); r.allBoth = all1.A && all1.B;
const amp = page.getByTestId('fit-ampm');
await amp.locator('button', { hasText: /^AM$/ }).click(); await page.waitForTimeout(400); const am = has(await present()); console.log('AM', am); r.amOnlyA = am.A && !am.B;
await amp.locator('button', { hasText: /^PM$/ }).click(); await page.waitForTimeout(400); const pm = has(await present()); console.log('PM', pm); r.pmOnlyB = !pm.A && pm.B;
await amp.locator('button', { hasText: /^全員$/ }).click(); await page.waitForTimeout(400); const all2 = has(await present()); console.log('全員(戻す)', all2); r.allBothAgain = all2.A && all2.B;
await ctx.close();
if (TRIAL) {
  const c2 = await b.newContext({ viewport: { width: 393, height: 820 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const p2 = await c2.newPage(); p2.on('dialog', d => d.accept());
  await p2.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await p2.waitForTimeout(800);
  if (await p2.getByText('担当者を選択', { exact: false }).count()) { await p2.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await p2.waitForTimeout(800); }
  const pid = await p2.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); localStorage.setItem('tsumugiSidebarOpen', '0'); return (d.patients || []).find(p => p.status === '利用中')?.id; });
  await p2.evaluate((pid) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'fitness', pid, t: Date.now() })), pid);
  await p2.reload({ waitUntil: 'networkidle' }); await p2.waitForTimeout(1800); await p2.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
  r.phoneRosterOpen = (await p2.locator('div.translate-x-0', { hasText: '対象者一覧' }).count()) > 0;
  console.log('phone roster open (pid selected before):', r.phoneRosterOpen);
}
await b.close();
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
