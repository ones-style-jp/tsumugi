// 2026-10-29 マニュアル24章「前の日の連絡帳は、渡したときのまま」の写真(試験版の見本ビルド)
//   見本の1人(毎日 午前)の昨日の連絡帳に控え(次回 今日・9時10分)を入れ、今日の送迎表は 10:40 にしてから、昨日の連絡帳を開いて撮る
//   node scripts/cb_issued_manual_shot_1029.mjs [--base http://localhost:4175] [--out public/manual/img]
import { chromium } from 'playwright';
import path from 'node:path';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://localhost:4175'); const OUT = arg('--out', 'public/manual/img');
const NG = /扇橋|6458|ひかり|佐藤 健一|高橋|岩岡|長谷川|田中/;
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage();
page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 160)));
await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const T = new Date(); T.setHours(0, 0, 0, 0); const Y = new Date(T); Y.setDate(T.getDate() - 1);
const D = { Y: iso(Y), T: iso(T), tLabel: `${T.getMonth() + 1}月${T.getDate()}日（${'日月火水木金土'[T.getDay()]}）` };
await page.evaluate((D) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3'));
  d.systemSettings = d.systemSettings || {}; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [] }; d.holidays = []; d.systemSettings.transportEnabled = true;
  d.patients.forEach(p => { p.scheduleAmPm = ['', '', '', '', '', '', '']; p.pauseHistory = []; p.scheduleChangeHistory = []; });
  const P = d.patients.find(p => p.status === '利用中' && !p.endDate); P.scheduleAmPm = ['AM', 'AM', 'AM', 'AM', 'AM', 'AM', 'AM']; d.monthlyShifts = {};
  const [y, m, dd] = D.Y.split('-').map(Number); const md = `${m}月${dd}日`;
  d.ticketRecords = (d.ticketRecords || []).filter(x => x.date !== md);
  d.ticketRecords.push({ id: `tr_${P.id}_${y}_${m}_${dd}`, patientId: P.id, name: P.name, kana: P.kana || '', date: md, year: y, status: '出席', temp_AM: '36.5', bpUpSt_AM: '128', bpDnSt_AM: '70', plSt_AM: '66', massage: '見本A',
    exercises: { u1: '10分', u2: '○', u3: '○' }, cbIssued: JSON.stringify({ d: D.tLabel, t: '9時10分', drop: '', ra: '本日は秋の作品づくりをしました。', rp: '', at: Date.now() - 86400000 }), _savedAt: Date.now() - 86400000 });
  d.transportPlans = d.transportPlans || {}; d.transportPlans[`${D.T}_AM`] = { cars: { car1: [{ pid: P.id, t: '10:40' }] }, walkers: [], others: [], un: [], memo: '' };
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0');
  sessionStorage.setItem('tsumugiActiveRecorder', JSON.stringify({ id: 'demo_rec', name: '見本 職員', roleLabel: '介護職員' }));
  sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'print', pid: null, date: D.Y, t: Date.now() })); }, D);
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
const t = await page.locator('body').innerText(); const m = t.match(NG); if (m) { console.log('NG 実在のものが残っている', m[0]); process.exit(1); }
const note = page.getByTestId('cb-issued-note'); if (!(await note.count())) { console.log('NG 一言が出ていない'); process.exit(1); }
await page.screenshot({ path: path.join(OUT, 'trial_cb_issued.jpg'), type: 'jpeg', quality: 82 }); console.log('saved trial_cb_issued');
await b.close();
