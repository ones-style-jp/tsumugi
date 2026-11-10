// 2026-11-10 trial550: LIFE提出 — 提出ダッシュボードのチェック(選んだ人だけまとめて保存)・利用者ごとの「この利用者の様式をまとめて保存」
//   node chk/chk_1110lifesel.mjs [port]   (見本データ VITE_E2E_DEMO=1)
import { chromium } from 'playwright';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', acceptDownloads: true });
const page = await ctx.newPage(); page.on('pageerror', e => { console.log('PAGEERROR', e.message.slice(0, 200)); fails++; });
const dialogs = []; page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
const downloads = []; page.on('download', d => downloads.push(d.suggestedFilename()));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
// 見本データに ADL評価(Barthel)を2人分入れて提出可を作る(架空・番号も架空)
await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3'));
  d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), officeNumber: '1300000000', serviceCode: '78', insurerNo: '130000' };
  d.systemSettings.addons = { ...(d.systemSettings.addons || {}), kasan_kagaku: true, kasan_adl: true, kasan_kinou2: true };
  const ps = (d.patients || []).filter(p => !p.endDate).slice(0, 2); const items = {}; ['eat','transfer','groom','toilet','bath','walk','stairs','dress','stool','urine'].forEach(k => items[k] = 5);
  ps.forEach((p, i) => { p.insuranceNo = String(1000000001 + i); p.careLevel = p.careLevel || '要介護1'; p.birthDate = p.birthDate || '1940-01-01'; p.gender = p.gender || '女'; p.personalFile = { ...(p.personalFile || {}), faceSheet: { ...((p.personalFile || {}).faceSheet || {}), adlLevel: 'A1', dementiaLevel: 'Ⅰ' } }; });
  d.kinouKeikakuRecords = [{ id: 'chk-kk-0', patientId: ps[0].id, createdDate: '令和8年10月1日', nyuinDate: '', taiinDate: '', hasshoDate: '', life: { dates: { adm: { y: '2024.0', m: '3.0', d: '' }, dis: { y: '令和6', m: '４', d: '15.0' }, onset: { y: 'abc', m: '13', d: '' } } } }];
  d.diarySettings = { ...(d.diarySettings || {}), staff: [ ...((d.diarySettings || {}).staff || []).filter(x => x && x.name !== '検査 看護' && x.name !== '検査 機能'), { id: 'chk-st-n', name: '検査 看護', role: '看護師' }, { id: 'chk-st-k', name: '検査 機能', role: '機能訓練指導員' } ] };
  d.seikatsuKinouRecords = [{ id: 'chk-sk-old', patientId: ps[1].id, recordDate: '令和8年9月1日', recorder: 'LIFE移行取込', recorderJob: '', adl: {}, kikyo: {}, iadl: {}, shinshin: {}, createdAt: 1 }];
  d.adlRecords = ps.map((p, i) => ({ id: `chk-adl-${i}`, patientId: p.id, evalDate: '2026-10-15', evaluator: i === 0 ? '検査' : 'LIFE移行取込', items, total: 50, adlMonth: i === 0 ? 'first' : '', science: { height: '150', weight: '45', denture: 0, choke: 0, stains_on_teeth: 0, condition_of_gums: 0, demScale: [0,0,0,0,0,0,0], vitality: [1,1,1,1,1] } }));
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0');
  sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'life_submit', pid: null, t: Date.now() })); });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
ok(await page.getByTestId('life-sel-all').count() === 1, 'ダッシュボードの見出しに「全員を選ぶ」チェックがある');
const boxes = page.locator('input[data-testid^="life-sel-"]:not([data-testid="life-sel-all"])'); const n = await boxes.count(); ok(n > 0, `各行にチェックがある(${n})`);
ok(await page.getByTestId('life-export-selected').count() === 0, 'なにも選んでいないときは「選んだ人だけ」のボタンは出ない');
const okRows = await page.locator('tr', { hasText: '提出可' }).count(); console.log('提出可の行', okRows);
if (okRows) {
  const row = page.locator('tr', { hasText: '提出可' }).first(); await row.locator('input[type=checkbox]').check(); await page.waitForTimeout(300);
  const btn = page.getByTestId('life-export-selected'); ok(await btn.isVisible() && /選んだ 1名/.test(await btn.innerText()), '1人チェックすると「選んだ 1名 だけまとめて保存」が出る');
  ok(/提出ダッシュボード|LIFE/.test(await page.locator('h1, h2').first().innerText().catch(() => 'LIFE')), '画面はLIFE提出のまま(行のクリックで移動していない)');
  await btn.click(); await page.waitForTimeout(2500);
  const msg = dialogs[dialogs.length - 1] || ''; console.log('確認:', msg.replace(/\n/g, ' | ').slice(0, 300));
  ok(/選んだ 1名/.test(msg) && /提出可 1名/.test(msg), '確認の文に「選んだ 1名」と様式ごとの人数');
  ok(downloads.length >= 1 && downloads.every(f => /\.csv$/.test(f)), `CSV が保存される(${downloads.join(', ')})`);
  // ★ trial552: チェック中は「まとめてCSV出力」もその人だけ・一覧のそばのボタン
  ok(/チェックした 1名 をこの様式でCSV出力/.test(await page.getByTestId('life-export-form').innerText()), 'チェック中は様式の「まとめてCSV出力」の名前が「チェックした 1名 を…」になる');
  { const n0 = downloads.length; dialogs.length = 0; await page.getByTestId('life-export-form').click(); await page.waitForTimeout(1500); ok(/チェックした 1名のうち提出可能 1名分/.test(dialogs[0] || ''), `様式の出力もチェックした人だけ(${(dialogs[0] || '').slice(0, 60)})`); ok(downloads.length === n0 + 1, '1ファイル保存'); }
  ok(await page.getByTestId('life-export-selected2').isVisible(), '一覧のそばにも「チェックした N名 の算定中の様式をまとめて保存」がある');
  // 全員を選ぶ
  await page.getByTestId('life-sel-all').check(); await page.waitForTimeout(300);
  ok(new RegExp(`選んだ ${okRows}名`).test(await btn.innerText()), `見出しのチェックで提出可の${okRows}名が全員選ばれる`);
  await page.getByTestId('life-sel-all').uncheck(); await page.waitForTimeout(300); ok(await page.getByTestId('life-export-selected').count() === 0, '外すとボタンも消える');
}
// 利用者ごとの画面: この利用者の様式をまとめて保存
const pid = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); return (d.adlRecords || [])[0]?.patientId; });
await page.evaluate((pid) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'life_hub', pid, t: Date.now() })), pid);
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
const card = page.getByTestId('life-person-bundle'); ok(await card.count() === 1, '利用者の画面に「この利用者の様式をまとめて保存」がある');
if (await card.count()) {
  const t = await card.innerText(); console.log('カード:', t.replace(/\s+/g, ' ').slice(0, 160));
  const before = downloads.length; dialogs.length = 0;
  await page.getByTestId('life-person-bundle-btn').click(); await page.waitForTimeout(2500);
  const msg = dialogs[0] || ''; console.log('確認:', msg.replace(/\n/g, ' | ').slice(0, 300));
  ok(/この利用者の算定中の様式をまとめて保存/.test(msg) && /出す（評価/.test(msg), '確認の文に 出す／出さない の内訳');
  ok(downloads.length > before, `CSV が保存される(+${downloads.length - before})`);
}
// ★ trial553: 個別機能訓練の入院・退院の年月は LIFE の形に整う(2024/03・2024/04・発症は空)
{
  const cards = page.locator('div.bg-white.rounded-xl', { hasText: 'LIFE提出CSV（IDUA2024' }); ok(await cards.count() === 1, '個別機能訓練のカードがある');
  const dl = page.waitForEvent('download', { timeout: 8000 }); await cards.locator('button', { hasText: 'この利用者のCSVを出力' }).click(); const f = await dl; const path = await f.path(); const txt = (await import('node:fs')).readFileSync(path, 'utf-8');
  const lines = txt.split(/\r?\n/).filter(Boolean); const cols = lines[1].split(','); const vals = lines[2].split(',');
  const at = (k) => vals[cols.indexOf(k)];
  console.log('IDUA 年月:', ['onset_date_year','onset_date_month','latest_admission_date_year','latest_admission_date_month','latest_admission_date_day','latest_discharge_date_year','latest_discharge_date_month'].map(k => `${k}=${at(k)}`).join(' '));
  ok(at('latest_admission_date_year') === '' && at('latest_admission_date_month') === '' && at('latest_admission_date_day') === '', '入院 2024.0/3.0/日なし → 年月日そろわないので全部空(trial554)');
  ok(at('latest_discharge_date_year') === '2024' && at('latest_discharge_date_month') === '04' && at('latest_discharge_date_day') === '15', '退院 令和6/４/15.0 → 2024/04/15');
  ok(/直近の入院の年月日は取込の値/.test(await page.locator('body').innerText()), '要確認に「入院の年月日がそろっていないため出しません」');
  ok(at('onset_date_year') === '' && at('onset_date_month') === '', '発症 abc/13 → 空/空(年が無ければ月も出さない)');
}
// ★ trial553: 2人目(対象月区分なし)の ADL維持等は「対象外」と出る(緑の「出力できます」ではない)
{
  const pid2 = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); return (d.adlRecords || [])[1]?.patientId; });
  await page.evaluate((pid) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'life_hub', pid, t: Date.now() })), pid2);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
  ok(await page.getByTestId('life-skip-AINT2024').isVisible(), 'ADL維持等のカードに「対象外」と理由が出る');
  // ★ trial554: 「LIFE移行取込」の評価者は名簿の機能訓練指導員に直る(ADL評価・生活機能チェック)
  await page.waitForTimeout(1500);
  const healed = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const k = (d.diarySettings.staff || []).find(x => x && x.role === '機能訓練指導員' && x.name); return { exp: k && k.name, adl: (d.adlRecords || []).map(r => r.evaluator), sk: (d.seikatsuKinouRecords || []).map(r => r.recorder) }; });
  console.log('評価者:', JSON.stringify(healed));
  ok(!!healed.exp && healed.adl.includes(healed.exp) && !healed.adl.includes('LIFE移行取込') && healed.adl.includes('検査'), `ADL評価の「LIFE移行取込」→ 名簿の機能訓練指導員(${healed.exp})・他の評価者はそのまま`);
  ok(healed.sk.length === 1 && healed.sk[0] === healed.exp, '生活機能チェックの記録者も直る');
  ok(/出せるもの 1／/.test(await page.getByTestId('life-person-bundle').innerText()), 'まとめて保存の「出せるもの」は ADL維持等を除いた数');
}
await ctx.close(); await b.close();
console.log(fails ? `FAILS ${fails}` : 'ALL PASS'); process.exit(fails ? 1 : 0);
