// 2026-11-01(ユーザー指摘「フェイスシート→編集に自立度の選択欄はない」) 日常生活自立度の入力欄をフェイスシートに戻す・計画書から空のフェイスシートへ書き戻す
//   ①利用者マスタ→「フェイスシートで編集」→ 障害/認知症の自立度を選んで保存 → personalFile.faceSheet.adlLevel/dementiaLevel に入る
//   ②個別機能訓練計画書(3-3・jiritsuBody/jiritsuDementia。通所介護計画書 3-4 は adlLevel/demLevel で同じ書き戻し)で自立度を選んで「保存して閉じる」→ フェイスシートが空の方は同じ値が入る(①で入れた方は変わらない)
//   ③LIFE提出(科学的介護推進)の一覧で、①②の方に「自立度…未設定」のエラーが出ない
//   実行: node scripts/chk_1101fslevel.mjs [--port 4175]
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4175'; })();
const r = {};
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const S = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3'));
  d.systemSettings.addons = { ...(d.systemSettings.addons || {}), kasan_kagaku: true, kasan_adl: true, kasan_kobetsu: true };
  d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), officeNumber: '1300000001', serviceCode: '78', insurerNo: '131000' };
  const act = d.patients.filter(p => p.status === '利用中' && !p.endDate && String(p.careLevel || '').startsWith('要介護')).slice(0, 2); const [A, B] = act;
  act.forEach((p, i) => { p.insuranceNo = String(1000000001 + i); p.gender = p.gender || '女'; p.birthDate = p.birthDate || '1940-01-01'; delete p.faceSheet;
    const fs = { ...(((p.personalFile || {}).faceSheet) || {}) }; delete fs.adlLevel; delete fs.dementiaLevel; p.personalFile = { ...(p.personalFile || {}), faceSheet: fs }; });
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0');
  sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'master', pid: A.id, t: Date.now() }));
  return { A: A.id, B: B.id, An: A.name, Bn: B.name }; });
const fsOf = async (id) => page.evaluate((id) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const p = d.patients.find(x => String(x.id) === String(id)); const fs = ((p || {}).personalFile || {}).faceSheet || {}; return { adl: fs.adlLevel || '', dem: fs.dementiaLevel || '' }; }, id);
// ① フェイスシートの編集で選んで保存
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
await page.locator('button:visible', { hasText: 'フェイスシートで編集' }).first().click(); await page.waitForTimeout(1500);
const adlSel = page.getByTestId('fs-adl-level'), demSel = page.getByTestId('fs-dem-level');
r.fieldsShown = (await adlSel.count()) === 1 && (await demSel.count()) === 1;
if (r.fieldsShown) { await adlSel.selectOption('A2'); await demSel.selectOption('Ⅱb'); await page.waitForTimeout(200);
  await page.locator('button:visible', { hasText: /^保存$/ }).last().click(); await page.waitForTimeout(1500); }
const a1 = await fsOf(S.A); console.log('① A のフェイスシート', a1);
r.fsSaved = a1.adl === 'A2' && a1.dem === 'Ⅱb';
// ② 3-3 計画書で選んで保存 → 空のフェイスシートへ書き戻る
await page.evaluate((pid) => { sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'kinou_keikaku', pid, t: Date.now() })); }, S.B);
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
await page.locator('button:visible', { hasText: '新規作成' }).first().click(); await page.waitForTimeout(1200);
// 3-3 の自立度は select(見出しの次の select)
const pickLv = async (label, txt) => { const box = page.locator('div', { has: page.locator('label', { hasText: label }) }).filter({ has: page.locator('select') }).last(); await box.locator('select').first().selectOption(txt); };
await pickLv('障害高齢者の日常生活自立度', 'A1'); await pickLv('認知症高齢者の日常生活自立度', 'Ⅲa'); await page.waitForTimeout(200);
await page.locator('button:visible', { hasText: '保存して閉じる' }).first().click(); await page.waitForTimeout(1500);
const b2 = await fsOf(S.B), a2 = await fsOf(S.A); console.log('② B のフェイスシート', b2, 'A はそのまま', a2);
r.planBackfill = b2.adl === 'A1' && b2.dem === 'Ⅲa'; r.keepA = a2.adl === 'A2' && a2.dem === 'Ⅱb';
// ③ LIFE提出の一覧でエラーが出ない
await page.evaluate(() => { sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'life_submit', t: Date.now() })); });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
const sel = page.locator('select').filter({ has: page.locator('option', { hasText: /科学的介護/ }) }).first();
if (await sel.count()) { const v = await sel.locator('option', { hasText: /科学的介護/ }).first().getAttribute('value'); await sel.selectOption(v); await page.waitForTimeout(800); }
const rows = await page.evaluate((names) => [...document.querySelectorAll('tr')].map(tr => tr.innerText.replace(/\s+/g, ' ')).filter(t => names.some(n => t.includes(n))), [S.An, S.Bn]);
const bad = rows.filter(t => /自立度[^。]*未設定/.test(t)); console.log('③ LIFE の行', rows.length, '自立度エラー', bad.length);
r.lifeNoErr = rows.length >= 2 && bad.length === 0;
await b.close();
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
