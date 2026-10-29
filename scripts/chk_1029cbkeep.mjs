// 2026-10-29 連絡帳で付けた印・控えが、提供記録の保存(記録の作り直し)で消えないか
//   今日の午前の見本の1人に「送り時間反映」(renrakuDropAt)・連絡帳を出力した時刻(cbPrintedAt_AM)・(あれば)連絡帳の控え(cbIssued)を入れておき、
//   提供記録で特記を入れて「保存」を押す → 3つとも残っているか(端末の中の記録)
//   実行: node scripts/chk_1029cbkeep.mjs [--port 4175] [--no-issued(連絡帳の控えがまだ無い安定版)]
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4175'; })();
const NOISS = process.argv.includes('--no-issued');
const b = await chromium.launch(); const r = {};
const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage();
page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => d.accept());
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const SNAP = JSON.stringify({ d: '11月2日（月）', t: '9時10分', drop: '12:30', at: 1 });
const info = await page.evaluate((snap) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const t = new Date(); const dow = t.getDay(); const md = `${t.getMonth() + 1}月${t.getDate()}日`;
  d.systemSettings = d.systemSettings || {}; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [] }; d.holidays = [];
  const ps = d.patients.filter(p => p.status === '利用中' && !p.endDate); ps.forEach((p, i) => { p.scheduleAmPm = ['', '', '', '', '', '', '']; if (i < 3) p.scheduleAmPm[dow] = 'AM'; p.pauseHistory = []; p.scheduleChangeHistory = []; });
  const P = ps[0]; d.ticketRecords = (d.ticketRecords || []).filter(x => !(ps.slice(0, 3).some(p => p.id === x.patientId) && x.date === md));
  const now = Date.now() - 60000;
  d.ticketRecords.push({ id: `tr_cbkeep_${P.id}`, patientId: P.id, name: P.name, kana: P.kana || '', date: md, year: t.getFullYear(), status: '出席', temp_AM: '36.5', bpUpSt_AM: '128', bpDnSt_AM: '70', plSt_AM: '66', tokki: '',
    renrakuDropAt: '1', cbPrintedAt_AM: now, cbIssued: snap, _fieldTs: { renrakuDropAt: now, cbPrintedAt_AM: now, cbIssued: now }, _savedAt: now });
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0');
  sessionStorage.setItem('tsumugiActiveRecorder', JSON.stringify({ id: 'demo_rec', name: '見本 職員', roleLabel: '介護職員' }));
  sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'record', pid: null, ampm: 'AM', t: Date.now() })); return { id: P.id, rid: `tr_cbkeep_${P.id}` }; }, SNAP);
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
const rec = () => page.evaluate((rid) => { const x = (JSON.parse(localStorage.getItem('daycareAppData_v3')).ticketRecords || []).find(y => String(y.id) === rid) || {}; return { drop: x.renrakuDropAt, pr: x.cbPrintedAt_AM, iss: x.cbIssued, tokki: x.tokki, saved: x._savedAt }; }, info.rid);
const before = await rec(); console.log('before', JSON.stringify(before));
// 特記を入れて保存
const tk = page.locator(`[data-testid="tokki-${info.id}"]:visible, textarea:visible`).first();
if (await tk.count()) { await tk.click(); await tk.fill('検証の特記'); await page.waitForTimeout(300); }
await page.locator('[data-testid="rec-actions"] button:visible', { hasText: /^保存/ }).first().click(); await page.waitForTimeout(1500);
const after = await rec(); console.log('after ', JSON.stringify(after));
r.saved = after.saved !== before.saved;
r.dropKept = after.drop === '1'; r.printedKept = after.pr === before.pr; if (!NOISS) r.issuedKept = after.iss === SNAP;
await b.close();
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
