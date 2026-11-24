// 2026-11-22 trial612 の検査(見本データ VITE_E2E_DEMO=1 のビルド・:4175): 運動器機能向上計画書(要支援・事業対象者)
//   A 利用者ごと: 要支援の方を選ぶと「運動器機能向上計画書」の入口と案内が出る → 作る → 体力測定・要支援度・職員名が自動で入る → 保存 → 一覧に 1 件・印刷の枠に様式の文字
//   B 作成予定(個別機能訓練・LIFE): 保存した方の行に「運動器機能向上計画書」が並ぶ(3か月後)
//   C 左の並び: 要支援の方では「運動器機能向上計画書」が並ぶ(PC 幅)
//   実行: node chk/chk_1122trial612.mjs [port]
import { chromium } from 'playwright';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
page.on('dialog', d => d.accept()); page.on('pageerror', e => { console.log('PAGEERROR', e.message.slice(0, 200)); fails++; });
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
// 要支援で体力測定の記録がある方(無ければ要支援の先頭)。既往歴も入れておく
const seed = await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('daycareAppData_v3'));
  const sh = (d.patients || []).filter(p => p.status === '利用中' && /要支援|事業対象/.test(String(p.careLevel || '')));
  const withFit = sh.find(p => (d.fitnessRecords || []).some(r => r.patientId === p.id && r.values && Object.values(r.values).some(v => String(v || '').trim())));
  const p = withFit || sh[0]; if (!p) return null;
  if (!(d.fitnessRecords || []).some(r => r.patientId === p.id)) { d.fitnessRecords = d.fitnessRecords || []; d.fitnessRecords.push({ id: 99901, patientId: p.id, date: '2026-11-01', values: { height: '150.0', weight: '48.5', grip_r: '18.0', grip_l: '17.0', standup: '8', tug: '12.3' } }); }
  p.personalFile = p.personalFile || {}; p.personalFile.faceSheet = { ...(p.personalFile.faceSheet || {}), kiou: '変形性膝関節症', chronicDiseases: '高血圧' };
  d.undoukiRecords = (d.undoukiRecords || []).filter(r => r.patientId !== p.id);
  d.systemSettings = d.systemSettings || {}; d.systemSettings.undoukiSeparate = true; // ★ trial616: 「別に作る」店舗として検査
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0');
  return { pid: p.id, name: p.name, level: p.careLevel };
});
ok(!!seed, `見本に要支援の方がいる → ${seed ? seed.level : 'なし'}`);
const resume = async (view, pid) => { await page.evaluate(({ view, pid }) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view, pid, t: Date.now() })), { view, pid }); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2200); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {}); };
// 見出しの「利用者を選ぶ」で目当ての方にする(再読み込みの pid が効かない画面があるため)
const pickPatient = async (name) => { const cur = (await page.getByTestId('kk-patient').textContent().catch(() => '')) || ''; if (cur.includes(name)) return; await page.getByTestId('kk-patient').click(); await page.waitForTimeout(300); await page.getByTestId('kk-patient-q').fill(name.split(/[\s　]+/)[0]); await page.waitForTimeout(400); await page.locator('[data-testid="kk-patient-opt"]', { hasText: name }).first().click(); await page.waitForTimeout(1200); };
// ---- A
await resume('kinou_patient', seed.pid); await pickPatient(seed.name);
const noteTxt = (await page.getByTestId('kk-shien-note').textContent().catch(() => '')) || '';
ok(/運動器機能向上計画書/.test(noteTxt), `A1 要支援の案内に「運動器機能向上計画書」 → ${noteTxt.slice(0, 50)}`);
const docsTxt = (await page.getByTestId('kk-docs').textContent().catch(() => '')) || '';
ok(/運動器機能向上計画書/.test(docsTxt), 'A2 書類の一覧に「運動器機能向上計画書」のカード');
const startBtn = (await page.getByTestId('uk-start').count()) ? page.getByTestId('uk-start') : page.getByTestId('kk-start');
await startBtn.first().click(); await page.waitForTimeout(1200);
ok((await page.getByTestId('uk-form').count()) === 1, 'A3 「計画書を作る」で運動器機能向上計画書の入力画面が開く');
ok((await page.getByTestId('uk-goal').count()) === 1 && (await page.getByTestId('uk-fit').count()) === 0, 'A3b 最初は「目標と3ヵ月の計画」だけ。自動で入った内容は畳んである(trial613)');
const presetSel = page.locator('[data-testid="uk-goal"] select').first(); const presetOpts = await presetSel.locator('option').allTextContents().catch(() => []);
ok(presetOpts.some(t => /買い物|転ば|階段/.test(t)), `A3c 長期目標の定型文がプルダウンにある(${presetOpts.length}件)`);
await page.getByTestId('uk-more').click(); await page.waitForTimeout(500);
ok((await page.getByTestId('uk-auto').count()) === 1, 'A3d 「自動で入った内容を見る・直す」で基本・体力測定などが開く');
const fitVals = await page.locator('[data-testid="uk-fit"] input').evaluateAll(els => els.map(e => e.value));
ok(fitVals.some(v => String(v).trim()), `A4 体力測定が自動で入る → ${JSON.stringify(fitVals.slice(0, 6))}`);
const lvl = await page.locator('[data-testid="uk-auto"] select').nth(1).inputValue().catch(() => '');
ok(/要支援|事業対象者/.test(lvl), `A5 要支援度が自動で入る → ${lvl}`);
const hist = await page.locator('[data-testid="uk-auto"] textarea').first().inputValue().catch(() => '');
ok(/膝|高血圧/.test(hist), `A6 既往歴がフェイスシートから入る → ${hist.slice(0, 30)}`);
await page.locator('[data-testid="uk-goal"] textarea').first().fill('膝の痛みなく買い物に歩いて行ける'); await page.waitForTimeout(200);
await page.getByTestId('uk-save').click(); await page.waitForTimeout(1800);
// 「計画書を作る」から入ったので、保存すると「利用者ごと」へ戻る → カードに 1 件
const docsAfter = (await page.getByTestId('kk-docs').textContent().catch(() => '')) || '';
ok((await page.getByTestId('kk-docs').count()) === 1 && /運動器機能向上計画書/.test(docsAfter) && /\d{4}\/\d{1,2}\/\d{1,2}|令和/.test(docsAfter), 'A7 保存して閉じると「利用者ごと」へ戻り、カードに作った計画書(日付)が出る');
const saved = await page.evaluate((pid) => (JSON.parse(localStorage.getItem('daycareAppData_v3')).undoukiRecords || []).filter(r => r.patientId === pid), seed.pid);
ok(saved.length === 1 && saved[0].longGoal === '膝の痛みなく買い物に歩いて行ける' && !saved[0].draft && saved[0]._savedAt, 'A10 端末の控えに undoukiRecords として保存(_savedAt つき)');
// ---- C 左の並び(利用者ごと)
await resume('kinou_patient', seed.pid); await pickPatient(seed.name);
ok((await page.getByTestId('kk-side-kinou-undouki_keikaku').count()) === 1, 'C1 左の並びに「運動器機能向上計画書」(要支援の方)');
await page.getByTestId('kk-side-kinou-undouki_keikaku').click(); await page.waitForTimeout(1200);
ok((await page.getByTestId('uk-list').count()) === 1 && (await page.getByTestId('uk-row').count()) === 1, 'C2 左の並びから一覧へ(1 件)');
const pr = (await page.locator('#uk-print-area').innerHTML().catch(() => '')) || '';
ok(/運動器機能向上計画書/.test(pr) && /３ヵ月評価/.test(pr) && /【運動メニュー】/.test(pr) && !/本人・家族の意向/.test(pr) && pr.includes(seed.name), 'A8 印刷の枠に 題名・3ヵ月評価・運動メニュー・氏名(意向の欄は個別サービス計画書の側なので出ない・trial616)');
ok((await page.getByTestId('uk-print').count()) === 1, 'A9 ダウンロードのボタン');
// ---- B 作成予定
await resume('kinou_yotei', null);
let found = false;
for (const m of [null, ...Array.from({ length: 12 }, (_, i) => i + 1)]) {
  if (m) { const btn = page.locator('button:visible', { hasText: new RegExp(`^${m}月$`) }).first(); if (!(await btn.count())) continue; await btn.click(); await page.waitForTimeout(400); }
  const t = await page.locator('main').innerText().catch(() => '');
  if (t.includes(seed.name) && /運動器機能向上計画書/.test(t)) { found = true; console.log('   月:', m || '直近'); break; }
}
ok(found, 'B1 作成予定に、保存した方の「運動器機能向上計画書」(3か月後)が並ぶ');
await b.close();
console.log(fails ? `FAIL ${fails}` : 'ALL PASS');
process.exit(fails ? 1 : 0);
