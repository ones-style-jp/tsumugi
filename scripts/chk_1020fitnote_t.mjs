// 体力測定: 項目の備考(15文字・定型文のプルダウン・自由入力・定型文に追加)・この日のメモ(200文字)・各種設定の定型文カード。PC と iPhone 幅
import { chromium } from 'playwright';
const OUT = '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad';
const b = await chromium.launch();
const run = async (w, h, tag) => {
  const page = await (await b.newContext({ viewport: { width: w, height: h }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
  page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.goto('http://localhost:4185/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const p = d.patients.find(x => x.status === '利用中');
    d.fitnessRecords = (d.fitnessRecords || []).filter(r => r.patientId !== p.id);
    d.fitnessRecords.push({ id: 1, patientId: p.id, date: '2026-09-01', values: { tug: '12.5' }, notes: { tug: '杖使用' } });
    delete d.systemSettings.fitnessNotePresets;
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'fitness', pid: p.id, t: Date.now() })); });
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
  const r = {};
  r.prevNote = /杖使用/.test(await page.getByTestId('fit-prev-note-tug').first().innerText().catch(() => ''));
  await page.getByTestId('fit-note-btn-tug').first().click(); await page.waitForTimeout(200);
  const box = page.getByTestId('fit-note-tug').first();
  const inp = box.locator('input'); await inp.fill('あ'.repeat(40)); r.limit15 = (await inp.inputValue()).length === 15 && /15\/15/.test(await box.innerText());
  await inp.fill(''); await page.getByTestId('fit-note-preset-tug').selectOption('杖使用'); await page.getByTestId('fit-note-preset-tug').selectOption('休憩あり');
  r.presetJoin = (await inp.inputValue()) === '杖使用・休憩あり';
  await inp.fill('手すり使用'); r.addBtn = (await page.getByTestId('fit-note-addpreset-tug').count()) === 1;
  await page.getByTestId('fit-note-addpreset-tug').click(); await page.waitForTimeout(600);
  r.presetAdded = (await page.getByTestId('fit-note-preset-tug').locator('option', { hasText: '手すり使用' }).count()) === 1;
  const memo = page.getByTestId('fit-memo').locator('textarea'); await memo.fill('い'.repeat(250)); r.memo200 = (await memo.inputValue()).length === 200;
  await memo.fill('膝の痛みの訴えあり。歩行は慎重に実施。');
  await page.getByTestId('fit-note-tug').scrollIntoViewIfNeeded(); await page.screenshot({ path: `${OUT}/fitnote_${tag}.png`, fullPage: false });
  await page.locator('button', { hasText: /^保存$/ }).first().click(); await page.waitForTimeout(1200);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
  const txt = await page.locator('body').innerText();
  r.saved = /手すり使用/.test(txt) && /膝の痛みの訴えあり/.test(txt);
  r.memoCleared = (await page.getByTestId('fit-memo').locator('textarea').inputValue()) === '';
  // 前回の備考が上に出る(9/1 の杖使用 → 今日保存した手すり使用が「前回」になる場合もある)。まとめて入れるボタン
  const pnb = page.getByTestId('fit-prev-notes'); r.prevBox = (await pnb.count()) === 1 && /(手すり使用|杖使用)/.test(await pnb.innerText());
  await page.getByTestId('fit-copy-prev-notes').click(); await page.waitForTimeout(200);
  r.copied = /(手すり使用|杖使用)/.test(await page.getByTestId('fit-note-tug').locator('input').inputValue().catch(() => ''));
  // 各種設定 → 体力測定 の定型文カード
  await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'settings', pid: null, t: Date.now() }))); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1200);
  await page.evaluate(() => { const bs = [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === '体力測定' && [...b.parentElement.querySelectorAll('button')].some(x => x.textContent.trim() === 'システム')); if (bs[0]) bs[0].click(); }); await page.waitForTimeout(600);
  const card = page.getByTestId('fit-preset-card'); r.card = (await card.count()) === 1 && /手すり使用/.test(await card.innerText()) && /踏み台使用/.test(await card.innerText());
  await card.locator('input').fill('見守り'); await card.locator('button', { hasText: '追加' }).click(); await page.waitForTimeout(500);
  await card.locator('button[aria-label="踏み台使用 を削除"]').click(); await page.waitForTimeout(500);
  const ps = await page.evaluate(() => JSON.parse(localStorage.getItem('daycareAppData_v3')).systemSettings.fitnessNotePresets || []);
  r.cardEdit = ps.includes('見守り') && !ps.includes('踏み台使用') && ps.includes('手すり使用');
  console.log(tag, r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL');
};
await run(1280, 900, 'pc'); await run(390, 844, 'phone'); await b.close();
