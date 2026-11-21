// 2026-10-22 試験版: デモ用の見本データ(テスト店舗だけ)。自動テスト用のビルドで「入れる」→ 中身を確かめる → 月の表 → 「消す」
//   見本の利用者70名・平日の午前午後に10名ずつ・9月1日〜昨日の提供記録(体温あり・欠席は少し)・フェイスシート・住所(町名＋丁目)・10月の送迎表
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4173'; })();
const b = await chromium.launch(); const r = {};
const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage();
page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const before = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); return { p: (d.patients || []).length, r: (d.ticketRecords || []).length }; });
await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'settings', pid: null, t: Date.now() }))); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800);
await page.locator('button', { hasText: /^システム$/ }).first().click(); await page.waitForTimeout(800);
const fill = page.getByTestId('demo-fill'); r.shown = await fill.count() > 0;
await fill.scrollIntoViewIfNeeded(); await fill.click();
await page.waitForFunction(() => /入れました|入れられません/.test(document.querySelector('[data-testid="demo-msg"]')?.textContent || ''), null, { timeout: 90000 });
console.log('msg', await page.getByTestId('demo-msg').innerText());
const st = await page.evaluate(() => { const d = window.__tsumugiE2E.peek(); /* 端末の控え(localStorage)は直近35日分だけなので、画面の中の中身を見る */ const dp = (d.patients || []).filter(p => p._demo); const slot = {}; dp.forEach(p => p.scheduleAmPm.forEach((v, dw) => { if (v) { const k = `${dw}${v}`; slot[k] = (slot[k] || 0) + 1; } }));
  const recs = (d.ticketRecords || []).filter(x => x._demo); const sep1 = recs.filter(x => x.date === '9月1日'); const att = recs.filter(x => x.status === '出席'); const abs = recs.filter(x => x.status === '欠席');
  const p0 = dp[0] || {}; const fs = (p0.personalFile && p0.personalFile.faceSheet) || {};
  const plans = Object.keys(d.transportPlans || {}).filter(k => d.transportPlans[k] && d.transportPlans[k]._demo);
  const ind = att.filter(x => Object.values(x.exercises || {}).some(v => v && typeof v === 'object' && v.itemId && v.value)).length;
  return { n: dp.length, slot, recs: recs.length, sep1: sep1.length, att: att.length, abs: abs.length, tempOk: att.every(x => /^3[5-7]\.\d$/.test(x.temp) && x[`temp_${(dp.find(p => p.id === x.patientId) || {}).scheduleAmPm?.[['日','月','火','水','木','金','土'].indexOf(x.dayOfWeek)]}`] === x.temp),
    fsKeys: Object.keys(fs).length, addr: p0.address, phone: p0.phone, kana: p0.kana, plans: plans.length, ind, names: [...new Set(dp.map(p => p.lastName))].join(','), pid: p0.id, maxRecDate: recs.reduce((m, x) => { const [mo, dd] = [parseInt(x.date), parseInt(x.date.split('月')[1])]; const v = mo * 100 + dd; return v > m ? v : m; }, 0) }; });
console.log(JSON.stringify({ ...st, before }));
const today = new Date(); const yest = new Date(today); yest.setDate(today.getDate() - 1);
r.count70 = st.n === 70; r.slots10 = Object.keys(st.slot).length === 10 && Object.values(st.slot).every(v => v === 10);
r.recsMany = st.recs > 500 && st.sep1 > 0 && st.att > st.abs && st.abs > 0; r.vitals = st.tempOk; r.faceSheet = st.fsKeys >= 15;
r.addrChome = /^東京都.+[区市].+(丁目|町)$/.test(st.addr || '') && /^03-0000-\d{4}$/.test(st.phone || ''); r.plans = st.plans > 20; r.indEx = st.ind > 100;
r.untilYesterday = st.maxRecDate <= (yest.getMonth() + 1) * 100 + yest.getDate() && st.maxRecDate >= 1000;
r.fictionalNames = st.names.split(',').every(s => /^(見本|架空|仮名|例示|試作|模擬|標本|参考|雛形|練習|体験|演習)$/.test(s));
// 月の表(9月)に体温と個別運動の名前が出る
await page.evaluate((pid) => { sessionStorage.setItem('tsumugiOpenTicket', JSON.stringify({ patientId: pid, month: '2026-09' })); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'ticket', pid, t: Date.now() })); }, st.pid);
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
const tk = await page.evaluate(() => (document.querySelector('#print-content-ticket') || {}).innerText || '');
r.ticketVitals = /3[5-7]\.\d/.test(tk) && /9月 サービス提供記録/.test(tk);
r.noDoubleUnit = !/セット秒|回回|分分|kgkg/.test(tk); console.log('ticket head', (tk.match(/設定数値[^\n]*\n[^\n]*/g) || []).slice(0, 2).join(' | ').slice(0, 200));
await page.screenshot({ path: '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad/demo_ticket.jpg', type: 'jpeg', quality: 55 });
// 消す
await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'settings', pid: null, t: Date.now() }))); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800);
await page.locator('button', { hasText: /^システム$/ }).first().click(); await page.waitForTimeout(800);
await page.getByTestId('demo-clear').scrollIntoViewIfNeeded(); await page.getByTestId('demo-clear').click();
await page.waitForFunction(() => /消しました|消せません/.test(document.querySelector('[data-testid="demo-msg"]')?.textContent || ''), null, { timeout: 30000 });
const after = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); return { p: (d.patients || []).length, r: (d.ticketRecords || []).length, demo: (d.patients || []).filter(p => p._demo).length, demoR: (d.ticketRecords || []).filter(x => x._demo).length }; });
console.log('after', JSON.stringify(after)); r.cleared = after.demo === 0 && after.demoR === 0 && after.p === before.p;
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
