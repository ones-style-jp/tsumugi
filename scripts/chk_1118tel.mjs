// 2026-11-18 trial587 送迎表(パソコン): 名前を押した小窓に電話番号(押すと tel: で発信)
//   ① 本人の携帯・固定がある方 → 住所の下に「電話:」携帯(先頭・濃い)→固定(薄い)、href が tel:数字だけ
//   ② 送迎時の連絡先=緊急連絡先(娘さん等)の方 → 先頭はその相手(名前つき)、本人は後ろ
//   ③ 番号が無い方 → 「電話未登録」
//   実行: node chk/chk_1118tel.mjs [port]   (見本データ VITE_E2E_DEMO=1 のビルド)
import { chromium } from 'playwright';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
const b = await chromium.launch();
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const now = new Date(); const dow = now.getDay(); const today = iso(now);
const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage();
page.on('dialog', d => d.accept()); page.on('pageerror', e => { console.log('PAGEERROR', e.message.slice(0, 200)); fails++; });
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
const ids = await page.evaluate(([dow, today]) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.systemSettings = d.systemSettings || {}; d.holidays = []; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [0] };
  const all = (d.patients || []).filter(p => p.status === '利用中' && !p.endDate); const ps = all.slice(0, 3); all.slice(3).forEach(p => { p.scheduleAmPm = ['', '', '', '', '', '', '']; });
  d.diarySettings = d.diarySettings || {}; d.diarySettings.cars = [{ id: 'car1', name: '1号車', type: '' }]; d.transportPlans = {};
  ps.forEach((p, i) => { p.pauseHistory = []; p.scheduleChangeHistory = []; p.startDate = '2025-01-01'; p.scheduleAmPm = ['', '', '', '', '', '', '']; p.scheduleAmPm[dow] = 'AM'; p.pickupMinutes = 2; p.status = '利用中'; p.address = `架空市見本町${i + 1}-2-3`; });
  // ① 本人の携帯と固定 ② 送迎時の連絡先=緊急連絡先 ③ 番号なし
  ps[0].phoneMobile = '090-0000-0001'; ps[0].phone = '03-0000-0001'; ps[0].pickupCallTo = '';
  ps[1].phoneMobile = '090-0000-0002'; ps[1].phone = ''; ps[1].pickupCallTo = 'family'; ps[1].familyRelation = '長女'; ps[1].familyName = '見本 花子'; ps[1].familyPhoneMobile = '080-0000-0002'; ps[1].familyPhone = '';
  ps[2].phoneMobile = ''; ps[2].phone = ''; ps[2].pickupCallTo = ''; ps[2].familyPhoneMobile = ''; ps[2].familyPhone = '';
  d.transportPlans[`${today}_AM`] = { cars: { car1: ps.map((p, i) => ({ pid: p.id, t: `8:${String(30 + i).padStart(2, '0')}`, mark: false })) }, walkers: [], others: [], un: [], memo: '', driver: {}, _savedAt: Date.now() - 86400000 };
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); localStorage.setItem('tsumugiTpDriveAck', String(Date.now()));
  sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, date: today, t: Date.now(), ampm: 'AM' })); return ps.map(p => p.id); }, [dow, today]);
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
const openPt = async (pid) => { const row = page.locator(`[data-tprow][data-tppid="${pid}"][data-tpiso="${today}"]`).first(); await row.locator('button[title^="タップ=場所"]').first().click(); await page.waitForTimeout(500); };
const tels = () => page.evaluate(() => [...document.querySelectorAll('[data-testid^="tp-edit-tel-"]')].map(a => ({ t: a.textContent.trim(), h: a.getAttribute('href'), c: a.className })));
const close = async () => { await page.locator('button', { hasText: /^閉じる$/ }).last().click(); await page.waitForTimeout(300); };
// ①
await openPt(ids[0]); ok((await page.locator('#tp-edit-place').count()) === 1 && (await page.getByTestId('tp-edit-tel').count()) === 1, '小窓が開き、住所の下に電話の行');
let t = await tels(); ok(t.length === 2 && t[0].t === '090-0000-0001' && t[0].h === 'tel:09000000001' && /text-slate-800/.test(t[0].c), `本人の携帯が先頭・tel: は数字だけ (${JSON.stringify(t[0])})`);
ok(t[1] && t[1].t === '本人 03-0000-0001' && t[1].h === 'tel:0300000001' && /text-slate-500/.test(t[1].c), `固定は2番目(薄い) (${JSON.stringify(t[1])})`);
ok(await page.getByText('住所: 架空市見本町1-2-3', { exact: false }).count() === 1, '住所の行はそのまま');
await close();
// ②
await openPt(ids[1]); t = await tels();
ok(t.length === 2 && t[0].t === '長女 見本 花子 080-0000-0002' && t[0].h === 'tel:08000000002', `送迎時の連絡先(緊急連絡先)が先頭に名前つき (${JSON.stringify(t[0])})`);
ok(t[1] && t[1].t === '本人 090-0000-0002', `本人の携帯は後ろ (${JSON.stringify(t[1])})`);
await close();
// ③
await openPt(ids[2]); t = await tels();
ok(t.length === 0 && (await page.getByText('電話未登録', { exact: false }).count()) === 1, '番号が無い方は「電話未登録」');
await close();
await b.close(); console.log(fails ? `FAIL ${fails}` : 'ALL PASS'); process.exit(fails ? 1 : 0);
