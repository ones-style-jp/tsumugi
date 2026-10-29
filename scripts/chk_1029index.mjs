// 2026-10-29 西馬込店の報告(ユーザー経由): 「利用者マスタのサービス提供内容で基準値を入れたのに、提供記録入力に出ない」「直しても基準値が変わらない」
//   「個別運動のチェックを押して、また押しても外れない」「個別運動の既定を登録しているのに、提供記録入力では違う運動が入っている」
//   見本の1人に、基準値の控え(履歴)が古いまま(空)の状態を作る:
//     個別運動 iA=15回・iB=10回・iC=500g(控えは iA/iB 空)、既定 ①=iC ②=iB、ふつうの運動の1つ目=20分(控えは空)
//   ①提供記録入力(今日): 個別運動①②の薄い基準値が「500g」「10回」、ふつうの運動の1つ目が「20分」
//   ②①の値の欄に入れて消す(押しただけと同じ・前の運動が記録に書き込まれる)→ 保存 → 既定を ①=iA に変えて読み込み直す → ①が iA(15回)になる
//   ②' ②を自分で別の運動に選び直したら、既定と違ってもそのまま
//   ③利用者マスタのサービス提供内容で、個別運動のチェックを外す → 外れる → また押す → 付く
//   実行: node scripts/chk_1029index.mjs [--port 4175] [--base 4173]
import { chromium } from 'playwright';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const PORT = arg('--port', '4175'), BASE = arg('--base', '');
const r = {};
const run = async (port) => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept());
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  const info = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const ss = d.systemSettings = d.systemSettings || {}; const dow = new Date().getDay();
    ss.facilityInfo = { ...(ss.facilityInfo || {}), closedDays: [] }; d.holidays = [];
    let ex = Array.isArray(ss.exerciseItems) && ss.exerciseItems.length ? ss.exerciseItems : null;
    if (!ex) { ex = [{ id: 'ex_bike', name: 'バイク', type: 'number', defaultUnit: '分' }]; }
    ex = ex.filter(e => e.type !== 'individual'); ex.push({ id: 'ind1', name: '個別運動①', type: 'individual' }, { id: 'ind2', name: '個別運動②', type: 'individual' }); ss.exerciseItems = ex;
    ss.individualExerciseItems = [{ id: 'iA', name: '足ぐー', defaultUnit: '回' }, { id: 'iB', name: '踵上げ', defaultUnit: '回' }, { id: 'iC', name: 'タオル体操', defaultUnit: 'g' }];
    const ps = d.patients.filter(p => p.status === '利用中' && !p.endDate); ps.forEach((p, i) => { p.scheduleAmPm = ['', '', '', '', '', '', '']; if (i < 3) p.scheduleAmPm[dow] = 'AM'; p.pauseHistory = []; p.scheduleChangeHistory = []; });
    const P = ps[0]; const ex1 = ex.find(e => e.type !== 'individual');
    P.individualExercises = [{ itemId: 'iA', defaultValue: '15回' }, { itemId: 'iB', defaultValue: '10回' }, { itemId: 'iC', defaultValue: '500g' }];
    P.individualExercisesHistory = [{ from: '1900-01', values: [{ itemId: 'iA', defaultValue: '' }, { itemId: 'iB', defaultValue: '' }, { itemId: 'iC', defaultValue: '500g' }] }];
    P.individualExerciseSlotDefaults = { ind1: 'iC', ind2: 'iB' };
    P.plannedExercises = { ...(P.plannedExercises || {}), [ex1.id]: '20分' }; P.plannedExercisesHistory = [{ from: '1900-01', values: { [ex1.id]: '' } }];
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); localStorage.setItem('tsumugiKeypad', '0');
    sessionStorage.setItem('tsumugiActiveRecorder', JSON.stringify({ id: 'demo_rec', name: '見本 職員', roleLabel: '介護職員' })); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'record', pid: null, ampm: 'AM', t: Date.now() }));
    return { pid: P.id, name: P.name, ex1: ex1.id }; });
  const openRecord = async () => { await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'record', pid: null, ampm: 'AM', t: Date.now() }))); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2200); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 400 }).catch(() => {}); };
  await openRecord();
  const row = () => page.locator(`#record-table tr[data-rv-pid="${info.pid}"]`).first();
  const cells = async () => { const tds = row().locator('td[data-ind-cell]'); const n = await tds.count(); const out = []; for (let i = 0; i < Math.min(n, 2); i++) { const td = tds.nth(i); out.push({ sel: await td.locator('select').inputValue(), ph: await td.locator('input').getAttribute('placeholder'), val: await td.locator('input').inputValue() }); } return out; };
  const c1 = await cells(); const exPh = await row().locator('input[placeholder="20分"]').count();
  const res = { c1, exPh };
  // ② ①に入れて消す → 保存
  const in1 = row().locator('td[data-ind-cell]').first().locator('input');
  if (await in1.isEditable().catch(() => false)) { await in1.fill('3'); await in1.fill(''); await in1.blur(); }
  else { await in1.click(); await page.waitForTimeout(500); await page.keyboard.press('Escape'); await page.waitForTimeout(400); } // テンキーのときは押しただけ(値なし)
  await page.waitForTimeout(400); await page.locator('[data-testid="rec-actions"] button', { hasText: /^保存$/ }).first().click().catch(() => {}); await page.waitForTimeout(1500);
  res.baked = await page.evaluate((pid) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const t = new Date(); const recs = [...(d.ticketRecords || []), ...(d.records || [])].filter(x => x.patientId === pid); const rr = recs.find(x => x.exercises && x.exercises.ind1); return rr ? rr.exercises.ind1 : null; }, info.pid);
  await page.evaluate((pid) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const P = d.patients.find(p => p.id === pid); P.individualExerciseSlotDefaults = { ind1: 'iA', ind2: 'iB' }; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); }, info.pid);
  await openRecord(); res.c2 = await cells();
  // ②' ②を自分で iC に選び直して保存 → 読み込み直しても iC のまま(既定 iB に戻らない)
  await row().locator('td[data-ind-cell]').nth(1).locator('select').selectOption('iC'); await page.waitForTimeout(400);
  await page.locator('[data-testid="rec-actions"] button', { hasText: /^保存$/ }).first().click().catch(() => {}); await page.waitForTimeout(1500);
  await openRecord(); res.c3 = await cells();
  // ③ 利用者マスタのチェック
  await page.evaluate((pid) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'master', pid, t: Date.now() })), info.pid); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
  for (let k = 0; k < 3 && await page.getByTestId('pf-close-btn').count(); k++) { await page.getByTestId('pf-close-btn').first().click().catch(() => {}); await page.waitForTimeout(500); }
  const nm = page.locator('button:visible', { hasText: info.name }).first(); if (await nm.count()) { await nm.click().catch(() => {}); await page.waitForTimeout(1200); }
  await page.locator('button:visible', { hasText: /^サービス提供内容$/ }).first().click().catch(() => {}); await page.waitForTimeout(800);
  const cb = page.locator('label', { hasText: '踵上げ' }).locator('input[type="checkbox"]').first();
  const seq = []; if (await cb.count()) { seq.push(await cb.isChecked()); for (let k = 0; k < 3; k++) { await cb.click(); await page.waitForTimeout(500); seq.push(await cb.isChecked()); } }
  res.seq = seq;
  await b.close(); return res; };
const now = await run(PORT); console.log('直した後', JSON.stringify(now));
r.ph1 = now.c1[0] && now.c1[0].sel === 'iC' && now.c1[0].ph === '500g'; r.ph2 = now.c1[1] && now.c1[1].ph === '10回'; r.exPh = now.exPh >= 1;
r.followDefault = now.c2[0] && now.c2[0].sel === 'iA' && now.c2[0].ph === '15回';
r.baked = !!(now.baked && now.baked.itemId === 'iC' && !now.baked.value); // 押しただけで前の既定(iC)が記録に書き込まれた状態を作れた
r.pickedStays = now.c3 && now.c3[1] && now.c3[1].sel === 'iC' && now.c3[1].ph === '500g' && now.c3[0].sel === 'iA';
r.toggle = JSON.stringify(now.seq) === JSON.stringify([true, false, true, false]);
if (BASE) { const old = await run(BASE); console.log('直す前', JSON.stringify(old)); }
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
