// 2026-10-29 ユーザー要望「過去に作成した連絡帳のお迎え時間や日付は、あとで送迎表を直しても変えないでほしい(この日はこれを渡したと分かるように)」
//   見本の1人(毎日 午前)で確かめる。今日・明日の送迎表は 10:40
//   ①昨日の連絡帳(控え 9時10分・11月30日（日）あり) → 控えのまま出る・画面に「前の日の連絡帳です」
//   ②今日の連絡帳(古い控えあり) → 今までどおり送迎表の 10時40分
//   ③今日の連絡帳をダウンロード → 出した内容(10時40分)が控えに入る
//   ④昨日の連絡帳で次回予定のお迎え時間を 11時05分 に直して保存 → 次回は直した内容で出る(連絡事項の控えは残る)
//   連絡事項(全員あて・個別)も: 今の中身は「（今）」、昨日の控えは「（渡した）」。昨日は控え・今日は今の中身・出力で控えに入る
//   実行: node scripts/chk_1029cbissued.mjs [--port 4175]
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4175'; })();
const b = await chromium.launch(); const r = {};
const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage();
page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => d.accept());
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const T = new Date(); T.setHours(0, 0, 0, 0); const Y = new Date(T); Y.setDate(T.getDate() - 1); const M = new Date(T); M.setDate(T.getDate() + 1);
const D = { Y: iso(Y), T: iso(T), M: iso(M) };
const info = await page.evaluate((D) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3'));
  const md = (s) => { const [y, m, dd] = s.split('-').map(Number); return { date: `${m}月${dd}日`, year: y }; };
  d.systemSettings = d.systemSettings || {}; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [] }; d.holidays = []; d.systemSettings.transportEnabled = true;
  const ps = d.patients.filter(p => p.status === '利用中' && !p.endDate); d.patients.forEach(p => { p.scheduleAmPm = ['', '', '', '', '', '', '']; p.pauseHistory = []; p.scheduleChangeHistory = []; });
  const P = ps[0]; P.scheduleAmPm = ['AM', 'AM', 'AM', 'AM', 'AM', 'AM', 'AM']; d.monthlyShifts = {};
  d.contactBookConfig = { ...(d.contactBookConfig || {}), renrakuAll: { html: '全員あて（今）', from: '', until: '' } }; P.contactBookRenraku = { html: '個別（今）', from: '', until: '' };
  const y = md(D.Y), t = md(D.T);
  d.ticketRecords = (d.ticketRecords || []).filter(x => !([y.date, t.date].includes(x.date)));
  const snap = JSON.stringify({ d: '11月30日（日）', t: '9時10分', drop: '', ra: '全員あて（渡した）', rp: '個別（渡した）', at: 1 });
  const base = { patientId: P.id, name: P.name, kana: P.kana || '', status: '出席', temp_AM: '36.5', bpUpSt_AM: '128', bpDnSt_AM: '70', plSt_AM: '66', cbIssued: snap, _fieldTs: { cbIssued: 1 }, _savedAt: Date.now() - 60000 };
  d.ticketRecords.push({ ...base, id: `tr_${P.id}_${y.year}_${D.Y.slice(5, 7) * 1}_${D.Y.slice(8) * 1}`, date: y.date, year: y.year });
  d.ticketRecords.push({ ...base, id: `tr_${P.id}_${t.year}_${D.T.slice(5, 7) * 1}_${D.T.slice(8) * 1}`, date: t.date, year: t.year });
  d.transportPlans = d.transportPlans || {};
  for (const k of [D.T, D.M]) d.transportPlans[`${k}_AM`] = { cars: { car1: [{ pid: P.id, t: '10:40' }] }, walkers: [], others: [], un: [], memo: '' };
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0');
  sessionStorage.setItem('tsumugiActiveRecorder', JSON.stringify({ id: 'demo_rec', name: '見本 職員', roleLabel: '介護職員' }));
  return { id: P.id, rY: d.ticketRecords[d.ticketRecords.length - 2].id, rT: d.ticketRecords[d.ticketRecords.length - 1].id }; }, D);
const open = async (date) => { await page.evaluate((dt) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'print', pid: null, date: dt, t: Date.now() })), date);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2200); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {}); };
const card = () => page.evaluate(() => { const el = document.querySelector('[data-cb-next-t]'); return el ? { d: el.getAttribute('data-cb-next-d'), t: el.getAttribute('data-cb-next-t'), ra: el.getAttribute('data-cb-ren-all'), rp: el.getAttribute('data-cb-ren-pat'), txt: el.innerText } : null; });
const rec = (rid) => page.evaluate((rid) => ((JSON.parse(localStorage.getItem('daycareAppData_v3')).ticketRecords || []).find(x => String(x.id) === rid) || {}).cbIssued, rid);
// ① 昨日
await open(D.Y); const c1 = await card(); console.log('昨日', JSON.stringify(c1));
r.pastKeepsSnap = !!c1 && c1.t === '9時10分' && c1.d === '11月30日（日）';
r.pastKeepsRenraku = !!c1 && c1.txt.includes('全員あて（渡した）') && c1.txt.includes('個別（渡した）') && !c1.txt.includes('（今）');
r.pastNote = (await page.getByTestId('cb-issued-note').count()) > 0;
// ② 今日
await open(D.T); const c2 = await card(); console.log('今日', JSON.stringify(c2));
r.todayLive = !!c2 && c2.t === '10時40分';
r.todayRenrakuLive = !!c2 && c2.txt.includes('全員あて（今）') && c2.txt.includes('個別（今）');
r.todayNoNote = (await page.getByTestId('cb-issued-note').count()) === 0;
// ③ 今日をダウンロード → 控え
await page.getByTestId('cb-pdf').click(); await page.waitForTimeout(800);
const go = page.locator('button', { hasText: /選択した\d+名を(ダウンロード|印刷)/ }).first();
if (await go.count()) { await go.click(); await page.waitForTimeout(2500); }
const sT = await rec(info.rT); console.log('今日の控え', sT);
try { const o = JSON.parse(sT); r.printStamps = o.t === '10時40分' && o.d === c2.d && o.at > 1 && o.ra === '全員あて（今）' && o.rp === '個別（今）'; } catch { r.printStamps = false; }
// ④ 昨日の次回予定を直す
await open(D.Y);
await page.getByTestId('cb-input-hub').click(); await page.waitForTimeout(500); await page.getByTestId('cb-hub-next').click(); await page.waitForTimeout(800);
r.modalNote = (await page.getByTestId('cb-issued-modal-note').count()) > 0;
const tin = page.locator(`[data-testid="cb-next-time-${info.id}"] input`);
if (await tin.count() >= 2) { await tin.nth(0).fill('11'); await tin.nth(1).fill('05'); await page.waitForTimeout(300); }
await page.locator('button', { hasText: /^保存$/ }).last().click(); await page.waitForTimeout(1500);
const sY = await rec(info.rY); const c4 = await card(); console.log('昨日を直した後', JSON.stringify(c4), '控え', JSON.stringify(sY));
let oY = null; try { oY = JSON.parse(sY); } catch {}
r.editClearsNext = !!oY && oY.t === undefined && oY.d === undefined && !!c4 && c4.t === '11時05分';
r.editKeepsRenraku = !!oY && oY.ra === '全員あて（渡した）' && !!c4 && c4.txt.includes('個別（渡した）');
await b.close();
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
