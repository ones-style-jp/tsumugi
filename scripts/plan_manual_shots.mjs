// 2026-10-27 マニュアル用の画面写真(試験版 trial435・436 の計画書)。見本データ。試験版の見本ビルドを配信してから
//   node scripts/plan_manual_shots.mjs --port 4175 --out <dir>
import { chromium } from 'playwright';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const PORT = arg('--port', '4175'); const OUT = arg('--out', 'public/manual/img');
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 2, locale: 'ja-JP' })).newPage(); page.on('dialog', d => d.accept());
const K = 'daycareAppData_v3';
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
const ids = await page.evaluate((K) => { const d = JSON.parse(localStorage.getItem(K)); const ps = (d.patients || []).filter(p => p.status === '利用中'); const A = ps[0], B = ps[1];
  A.careLevel = '要支援2'; A.cmOffice = '見本地域包括支援センター'; A.cmName = '見本 花子'; A.careLevelFrom = '2026-04-01'; A.careLevelTo = '2027-03-31';
  B.careLevel = ''; d.tsushoKeikakuRecords = (d.tsushoKeikakuRecords || []).filter(x => x.patientId !== A.id && x.patientId !== B.id);
  d.systemSettings = d.systemSettings || {}; d.systemSettings.addons = { ...(d.systemSettings.addons || {}), kasan_kagaku: true };
  ['adlRecords', 'seikatsuKinouRecords', 'kyomiKanshinRecords'].forEach(k => { d[k] = (d[k] || []).filter(x => x.patientId !== A.id); });
  d.adlRecords.push({ id: 'adl_shot_prev', patientId: A.id, evalDate: '2026-07-15', evaluator: '', items: { eat: 10, transfer: 15, groom: 5, toilet: 10, bath: 5, walk: 15, stairs: 10, dress: 10, stool: 10, urine: 10 }, science: {} });
  localStorage.setItem(K, JSON.stringify(d)); return { A: A.id, B: B.id }; }, K);
const go = async (view, pid) => { await page.evaluate(([v, p]) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: p, t: Date.now() })), [view, pid]); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {}); };
const shot = async (loc, name) => { await loc.evaluate(el => el.scrollIntoView({ block: 'center' })); await page.waitForTimeout(300); await loc.screenshot({ path: `${OUT}/${name}.png` }); };
// タブ(通所介護計画書・3-1・3-2)
await go('tsusho_keikaku', ids.A); await shot(page.getByTestId('kk-tabs'), 'tk_tabs');
// 要支援の計画書: 種類の帯・個別の運動
await page.locator('button', { hasText: '＋ 新規作成' }).first().click(); await page.waitForTimeout(700);
await shot(page.getByTestId('tk-type-bar'), 'tk_type_shien');
await shot(page.getByTestId('tk-ex-card'), 'tk_ex_card');
await page.locator('button', { hasText: '保存して閉じる' }).first().click(); await page.waitForTimeout(700);
// 暫定: 介護度なしの方
await go('tsusho_keikaku', ids.B);
await page.locator('button', { hasText: '＋ 新規作成' }).first().click(); await page.waitForTimeout(700);
await page.getByTestId('tk-zantei-level').selectOption('要介護1'); await page.waitForTimeout(300);
await shot(page.getByTestId('tk-type-bar'), 'tk_zantei');
await page.locator('button', { hasText: '保存して閉じる' }).first().click(); await page.waitForTimeout(800);
await shot(page.getByTestId('tk-finalize').locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]'), 'tk_list_zantei');
// 評価・計画: 前回の内容を写す
await go('kinou_patient', ids.A); await page.getByTestId('kk-start').click(); await page.waitForTimeout(900);
await shot(page.getByTestId('kk-copy-prev-box'), 'kk_copy_prev');
console.log('shots ok'); await b.close();
