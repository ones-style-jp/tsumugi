// 2026-11-09 trial532: 姓と名の間を半角1つに(開いたときの自動修復・CSV取込の姓/名の列・緊急連絡先・ケアマネ)、CSV の「こちらで直した項目は残す」、連絡先一覧 35行＋注記1行
//   実行: node scripts/chk_1109names.mjs [port]
import { chromium } from 'playwright';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
const b = await chromium.launch(); const r = {}; const dialogs = [];
const page = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
page.on('dialog', d => { dialogs.push(d.message()); d.accept(); }); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
// ① 全角の空白の名前を仕込む → 開き直すと半角に(利用者名・フリガナ・緊急連絡先・担当ケアマネ・ケアマネ担当者マスタ＋前の鍵の墓石)
const S = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const ps = d.patients.filter(p => p.status === '利用中');
  const A = ps[0], B = ps[1]; A.name = '検名　太郎'; A.kana = 'けんめい　たろう'; A.emergencyContacts = [{ name: '検名　花子', relation: '長女', phone: '03-0000-0001' }]; A.familyName = '検名　花子';
  B.cmOffice = '検名居宅'; B.cmName = '検名　一郎'; d.systemSettings = d.systemSettings || {}; d.systemSettings.careManagers = [...(d.systemSettings.careManagers || []), { office: '検名居宅', name: '検名　一郎', phone: '03-0000-0002' }];
  d.systemSettings.cmOffices = [...(d.systemSettings.cmOffices || []), { name: '検名居宅', phone: '03-0000-0003' }];
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0');
  sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'master', pid: A.id, t: Date.now() })); return { aId: A.id, bId: B.id }; });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(3500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
const d1 = await page.evaluate(() => JSON.parse(localStorage.getItem('daycareAppData_v3')));
const A1 = d1.patients.find(p => p.id === S.aId), B1 = d1.patients.find(p => p.id === S.bId);
r.heal_name = A1.name === '検名 太郎' && A1.kana === 'けんめい たろう'; r.heal_emg = A1.emergencyContacts[0].name === '検名 花子' && A1.familyName === '検名 花子';
r.heal_cm = B1.cmName === '検名 一郎' && (d1.systemSettings.careManagers || []).some(c => c.office === '検名居宅' && c.name === '検名 一郎') && !!(d1.systemSettings.cmTombstones || {})['cm|検名居宅|検名　一郎'];
// ② CSV: 姓・名・セイ・メイ の列 → 半角1つでつなぐ。氏名の列が全角空白でも半角に
await page.getByTestId('csv-open').click(); await page.waitForTimeout(400);
await page.getByTestId('csv-mode-import').click(); console.log('step', JSON.stringify(r));
await page.waitForTimeout(300);
const csv1 = '姓,名,セイ,メイ,性別,生年月日,状態\n検新,次郎,ケンシン,ジロウ,男性,1940-01-02,利用中\n';
await page.getByTestId('csv-import-text').fill(csv1); await page.waitForTimeout(200);
r.keep_disabled_when_pasted = await page.getByTestId('csv-keep-newer').isDisabled();
await page.getByTestId('csv-import-go').click(); await page.waitForTimeout(1200);
const d2 = await page.evaluate(() => JSON.parse(localStorage.getItem('daycareAppData_v3')));
const N = d2.patients.find(p => p.name === '検新 次郎'); r.csv_split_cols = !!N && N.kana === 'ケンシン ジロウ' && N.lastName === '検新' && N.firstName === '次郎';
// ③ CSV(ファイル): 氏名が全角空白・緊急連絡先氏名が全角空白 → 半角に。「CSV より後にこちらで直した項目は残す」: 住所(こちらで直した・_fieldTs が未来)は残り、既往歴(こちらで直していない)は入る
await page.evaluate((aId) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const A = d.patients.find(p => p.id === aId); A.address = 'こちらで直した住所1-2-3'; A._fieldTs = { ...(A._fieldTs || {}), address: Date.now() + 3600 * 1000 }; A._updatedAt = Date.now() - 86400 * 1000 * 30; A.kiou = ''; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); }, S.aId);
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
await page.getByTestId('csv-open').click(); await page.waitForTimeout(400); await page.getByTestId('csv-mode-import').click(); console.log('step', JSON.stringify(r)); await page.waitForTimeout(300);
const csv2 = '﻿氏名,フリガナ,住所,既往歴,緊急連絡先氏名,続柄\n検名　太郎,けんめい　たろう,CSVの古い住所9-9-9,高血圧（CSV）,検名　花子,長女\n';
await page.locator('input[type=file][accept*="csv"]').setInputFiles({ name: 'old.csv', mimeType: 'text/csv', buffer: Buffer.from(csv2, 'utf8') }); await page.waitForTimeout(500);
r.keep_enabled_with_file = !(await page.getByTestId('csv-keep-newer').isDisabled());
await page.getByTestId('csv-keep-newer').check(); await page.getByTestId('csv-import-go').click(); await page.waitForTimeout(800);
await page.locator('button:visible', { hasText: /^この内容で取り込む$/ }).first().click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(1500); // 氏名が同じ方がいる → 1人ずつ選ぶ画面(初期値=更新)
const d3 = await page.evaluate(() => JSON.parse(localStorage.getItem('daycareAppData_v3'))); const A3 = d3.patients.find(p => p.id === S.aId);
r.keep_kept_address = A3.address === 'こちらで直した住所1-2-3'; r.keep_filled_kiou = A3.kiou === '高血圧（CSV）'; r.keep_name_half = A3.name === '検名 太郎' && (A3.emergencyContacts || [])[0]?.name === '検名 花子';
r.keep_msg = dialogs.some(m => /こちらで直した項目を残しました: 1か所/.test(m)); if (!r.keep_msg) console.log('dialogs', dialogs.slice(-2));
r.no_dup_added = d3.patients.filter(p => p.name === '検名 太郎').length === 1;
// ④ 連絡先一覧: 35行・注記は1行(個人情報の注意だけ)
await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const t = new Date(); if (t.getDay() === 0) t.setDate(t.getDate() + 1); const iso = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`; localStorage.setItem('tsumugiTpDriveAck', String(Date.now())); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, date: iso, t: Date.now(), ampm: 'AM' })); });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
await page.evaluate(() => { window.__pd = null; window.addEventListener('setPrintHtml', e => { window.__pd = { html: (e.detail && e.detail.html) || '' }; }, { once: true }); });
await page.locator('button:visible', { hasText: /^ダウンロード$/ }).first().click(); await page.waitForTimeout(400);
await page.locator('button:visible, label:visible', { hasText: /^利用者連絡先一覧のみ$/ }).first().click(); await page.waitForTimeout(200);
await page.locator('button:visible', { hasText: /^ダウンロード$/ }).last().click(); await page.waitForTimeout(1500);
const pd = await page.evaluate(() => window.__pd); const firstTbody = (pd.html.match(/<tbody>([\s\S]*?)<\/tbody>/) || [])[1] || '';
const nRows = (firstTbody.match(/<tr>/g) || []).length; r.rows35 = nRows === 35; if (!r.rows35) console.log('rows', nRows);
r.note_short = pd.html.includes('※ この一覧には個人情報が含まれます。取り扱い・保管にご注意ください。') && !pd.html.includes('送迎時にかける相手');
console.log(r); const ok = Object.values(r).every(Boolean); console.log(ok ? 'PASS' : 'FAIL'); await b.close(); process.exit(ok ? 0 : 1);
