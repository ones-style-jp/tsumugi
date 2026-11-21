// 2026-10-28(試験版) ユーザー提案「再検を押したら『再測定しますか？』が出ると誤タップが減る」
//   今日の午前の見本の1人に開始の血圧 141/65 脈46 を入れておき、提供記録で「再検(開始時を再測定)」を押す
//   ①確認が出る(名前・今の値・「1回目」として残る) ②キャンセル=何も変わらない(控えなし) ③OK=控えが1件(ボタンが黄色)
//   スマホ(カード)とiPad(表)の両方
//   実行: node scripts/chk_1028bpre.mjs [--port 4175]
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4175'; })();
const b = await chromium.launch(); const r = {};
for (const [k, vp] of [['phone', { width: 393, height: 820 }], ['ipad', { width: 1180, height: 820 }]]) {
  const ctx = await b.newContext({ viewport: vp, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', ...(vp.width < 768 ? { hasTouch: true, isMobile: true } : {}) }); const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  const info = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const t = new Date(); const dow = t.getDay(); const md = `${t.getMonth() + 1}月${t.getDate()}日`;
    d.systemSettings = d.systemSettings || {}; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [] }; d.holidays = [];
    const ps = d.patients.filter(p => p.status === '利用中' && !p.endDate); ps.forEach((p, i) => { p.scheduleAmPm = ['', '', '', '', '', '', '']; if (i < 3) p.scheduleAmPm[dow] = 'AM'; p.pauseHistory = []; p.scheduleChangeHistory = []; });
    const P = ps[0]; d.ticketRecords = (d.ticketRecords || []).filter(x => !(ps.slice(0, 3).some(p => p.id === x.patientId) && x.date === md));
    d.ticketRecords.push({ id: `tr_bpre_${P.id}`, patientId: P.id, name: P.name, kana: P.kana || '', date: md, year: t.getFullYear(), status: '出席', bpUpSt_AM: '141', bpDnSt_AM: '65', plSt_AM: '46', tokki: '', _savedAt: Date.now() });
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0');
    sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'record', pid: null, ampm: 'AM', t: Date.now() })); return { name: P.name, id: P.id }; });
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
  const ids = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="bp-re-St-"]')].map(e => e.getAttribute('data-testid'))); console.log(k, 'buttons', ids.slice(0, 6), 'want', info.id);
  const btn = page.locator(`[data-testid="bp-re-St-${info.id}"]:visible`).first();
  if (!(await btn.count())) { console.log(k, 'no re button'); r[`${k}_btn`] = false; await ctx.close(); continue; }
  let msg = ''; page.once('dialog', d => { msg = d.message(); d.dismiss(); }); await btn.click(); await page.waitForTimeout(600);
  console.log(k, '確認:', JSON.stringify(msg));
  r[`${k}_confirm`] = /再測定しますか/.test(msg) && msg.includes('141/65') && msg.includes('1回目');
  r[`${k}_cancelKeeps`] = !/bg-amber-100/.test(await btn.getAttribute('class') || '');
  page.once('dialog', d => d.accept()); await btn.click(); await page.waitForTimeout(600);
  r[`${k}_okLogs`] = /bg-amber-100/.test(await btn.getAttribute('class') || '');
  await ctx.close();
}
await b.close();
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
