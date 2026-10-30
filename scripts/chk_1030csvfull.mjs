// 2026-10-30 ユーザー要望「CSVのテンプレートを10人分、全部の列を埋めて読み込み、利用者マスタにバグなく入るかを自動で確かめたい」
//   ①テンプレートの全45列を埋めた架空の10名(日付・性別・介護度・負担割合・状態・曜日の書き方をわざと変える)を読み込む → 新規10件
//   ②1項目ずつ照合(基本情報・住所・連絡先・保険・ケアマネ・フェイスシート・基本利用曜日)・「休止」の方は今日からの休止の期間が付く(付かないと提供記録入力に出る) ③同じCSVに利用者IDを入れてもう一度読み込む → 更新10件・新規0件・値は変わらない(重複しない)
//   ④取り込んだ方が提供記録入力(今日)に出る・利用者マスタで年齢が出る
//   実行: node scripts/chk_1030csvfull.mjs [--port 4175]
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4175'; })();
const r = {}; const dialogs = [];
const HEAD = ['利用者ID','氏名','フリガナ','性別','生年月日','郵便番号','都道府県','市区町村','町名番地','建物名','電話番号','携帯電話番号','緊急連絡先氏名','続柄','緊急連絡先電話','緊急連絡先電話（携帯）','緊急連絡先メール','被保険者番号','介護度','利用開始日','利用終了日','状態','既往歴','留意点','かかりつけ医','メールアドレス','認定有効期間（開始）','認定有効期間（終了）','負担割合','ケアマネ事業所','ケアマネ事業所電話','ケアマネ事業所FAX','担当ケアマネ','担当ケアマネ電話','医療機関','医療機関連絡先','FAX','世帯区分','障害高齢者の日常生活自立度','認知症高齢者の日常生活自立度','通所の経緯','備考','追記','基本利用曜日（午前）','基本利用曜日（午後）'];
const DOW = '日月火水木金土'; const today = new Date(); const tdow = today.getDay();
// 10名分(架空)。[入れる値, 期待する保存値] の対で書き方のゆれを確かめる
const G = ['男性', '女性', '男', '女', 'M', 'F', '男性', '女性', '男性', '女性']; const Gx = ['男性', '女性', '男性', '女性', '男性', '女性', '男性', '女性', '男性', '女性'];
const B = ['1940-05-15', '1941/6/1', '昭和17年7月7日', 'S18.8.8', '１９４４／９／９', '19451010', '1946年11月11日', 'R1.5.1', '12/13/1947', '1948.1.14']; const Bx = ['1940-05-15', '1941-06-01', '1942-07-07', '1943-08-08', '1944-09-09', '1945-10-10', '1946-11-11', '2019-05-01', '1947-12-13', '1948-01-14'];
const C = ['要介護2', '要支援１', '事業対象者', '介護3', '要介護４', '要支援2', '総合事業', '要介護1', '要介護5', '支援1']; const Cx = ['要介護2', '要支援1', '事業対象者', '要介護3', '要介護4', '要支援2', '事業対象者', '要介護1', '要介護5', '要支援1'];
const F = ['1割', '2割', '3割', '90%', '80%', '70%', '１割', '1', '2', '3']; const Fx = ['90%', '80%', '70%', '90%', '80%', '70%', '90%', '90%', '80%', '70%'];
const ST = ['利用中', '利用中', '休止', '利用中', '一時停止', '利用中', '退所', '通所中', '利用中', '利用中']; const STx = ['利用中', '利用中', '休止', '利用中', '休止', '利用中', '退所', '利用中', '利用中', '利用中'];
const INS = ['12345', '０１２３４５６７８９', 'H12', '1234567890', '98765', '00000000012', '123456', '7777777', 'h000000001', '55555']; const INSx = ['0000012345', '0123456789', 'H12', '1234567890', '0000098765', '00000000012', '0000123456', '0007777777', 'h000000001', '0000055555']; // CSV の整形は6桁以上を10桁に(前から)。短い物・英字は開いたときの修復(healInsuranceNo)で
const INSheal = ['0000012345', '0123456789', 'H000000012', '1234567890', '0000098765', '00000000012', '0000123456', '0007777777', 'H000000001', '0000055555'];
const d1 = (i) => `${DOW[tdow]}`; // 今日の曜日(提供記録入力に出るか)
const rows = []; const exp = [];
for (let i = 0; i < 10; i++) {
  const n = i + 1; const nm = `ＣＳＶ見本 ${'一二三四五六七八九十'[i]}郎`; const kn = `しーえすぶい ${'いちにさんしごろくしちはちきゅうじゅう'.slice(0, 3)}${n}`;
  const am = i % 3 === 0 ? `${d1()}、月` : i % 3 === 1 ? `${d1()}曜日 水曜日` : ''; const pm = i % 3 === 2 ? `${d1()}・金` : (i % 3 === 0 ? '月' : '');
  rows.push(['', nm, kn, G[i], B[i], `100-000${i}`, '東京都', '架空区', `見本町${n}-${n}-${n}`, `見本ハイツ ${100 + n}`, `03-0000-00${String(n).padStart(2, '0')}`, `090-0000-00${String(n).padStart(2, '0')}`, `見本 家族${n}`, '長女', `03-1111-00${String(n).padStart(2, '0')}`, `080-1111-00${String(n).padStart(2, '0')}`, `kazoku${n}@example.com`, INS[i], C[i], '2024/6/1', i === 6 ? '2026/9/30' : '', ST[i], `高血圧${n}`, `歩行見守り${n}`, `見本クリニック 医師${n}`, `riyou${n}@example.com`, '令和6年4月1日', '2027-03-31', F[i], `見本居宅${n}`, `03-2222-00${String(n).padStart(2, '0')}`, `03-3333-00${String(n).padStart(2, '0')}`, `見本 ケアマネ${n}`, `090-4444-00${String(n).padStart(2, '0')}`, `見本病院${n}`, `03-5555-00${String(n).padStart(2, '0')}`, `03-6666-00${String(n).padStart(2, '0')}`, i % 2 ? '独居' : '同居', ['J1', 'A2', 'b1', 'C2', 'J2'][i % 5], ['Ⅰ', 'Ⅱa', 'IIb', 'Ⅲa', 'M'][i % 5], `通所の経緯${n}`, `備考${n}`, `追記${n}`, am, pm]);
  const sc = ['', '', '', '', '', '', '']; const put = (txt, ap) => txt.replace(/曜日|曜/g, '').split(/[、・\s]+/).filter(Boolean).forEach(ch => { const k = DOW.indexOf(ch); sc[k] = (sc[k] && sc[k] !== ap) ? '1日' : ap; });
  if (am) put(am, 'AM'); if (pm) put(pm, 'PM');
  exp.push({ name: nm, kana: kn, gender: Gx[i], birthDate: Bx[i], zipCode: `100-000${i}`, prefecture: '東京都', city: '架空区', addressLine: `見本町${n}-${n}-${n}`, address: `東京都架空区見本町${n}-${n}-${n}`, addressBuilding: `見本ハイツ ${100 + n}`, phone: `03-0000-00${String(n).padStart(2, '0')}`, phoneMobile: `090-0000-00${String(n).padStart(2, '0')}`,
    familyName: `見本 家族${n}`, familyRelation: '長女', familyPhone: `03-1111-00${String(n).padStart(2, '0')}`, familyPhoneMobile: `080-1111-00${String(n).padStart(2, '0')}`, familyEmail: `kazoku${n}@example.com`, insuranceNo: INSheal[i], careLevel: Cx[i], startDate: '2024-06-01', endDate: i === 6 ? '2026-09-30' : undefined, status: STx[i], kiou: `高血圧${n}`, ryui: `歩行見守り${n}`, doctor: `見本クリニック 医師${n}`, email: `riyou${n}@example.com`, careLevelFrom: '2024-04-01', careLevelTo: '2027-03-31', costBurden: Fx[i],
    cmOffice: `見本居宅${n}`, cmOfficePhone: `03-2222-00${String(n).padStart(2, '0')}`, cmFax: `03-3333-00${String(n).padStart(2, '0')}`, cmName: `見本 ケアマネ${n}`, cmPhone: `090-4444-00${String(n).padStart(2, '0')}`, medicalInstitution: `見本病院${n}`, medicalContact: `03-5555-00${String(n).padStart(2, '0')}`, scheduleAmPm: sc,
    fs: { fax: `03-6666-00${String(n).padStart(2, '0')}`, householdType: i % 2 ? '独居' : '同居', adlLevel: ['J1', 'A2', 'B1', 'C2', 'J2'][i % 5], dementiaLevel: ['Ⅰ', 'Ⅱa', 'Ⅱb', 'Ⅲa', 'M'][i % 5], lifeHistory: `通所の経緯${n}`, bikou: `備考${n}`, addendum: `追記${n}`, medicalInstitution: `見本病院${n}`, medicalContact: `03-5555-00${String(n).padStart(2, '0')}`, chronicDiseases: `見本クリニック 医師${n}`, kiou: `高血圧${n}`, updatedBy: 'CSV取込' } });
}
const esc = (v) => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
const csvOf = (rs) => [HEAD.join(','), ...rs.map(x => x.map(esc).join(','))].join('\n');
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
page.on('dialog', d => { dialogs.push(d.message()); d.accept(); }); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
const go = async (view, extra) => { await page.evaluate(([v, x]) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: null, t: Date.now(), ...(x || {}) })), [view, extra]); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 400 }).catch(() => {}); };
const data = () => page.evaluate(() => JSON.parse(localStorage.getItem('daycareAppData_v3')));
const importCsv = async (text) => { await page.getByTestId('csv-open').click(); await page.waitForTimeout(300); await page.getByTestId('csv-mode-import').click(); await page.waitForTimeout(300); await page.getByTestId('csv-import-text').fill(text); await page.getByTestId('csv-import-go').click(); await page.waitForTimeout(2500); return dialogs.filter(m => /取り込み完了/.test(m)).pop() || ''; };
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [] }; d.holidays = []; d.patients = d.patients.filter(p => !/^ＣＳＶ見本/.test(p.name || '')); localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); });
await go('master'); const n0 = (await data()).patients.length;
// ① 新規10件
const m1 = await importCsv(csvOf(rows)); console.log('① ', JSON.stringify(m1.split('\n').slice(0, 3)));
await page.waitForTimeout(1500); // 開いたときの修復(被保険者番号など)が走るのを待つ
let D = await data(); r.added = /新規 10 件 \/ 更新 0 件/.test(m1) && D.patients.length === n0 + 10 && !/日付が読めず/.test(m1);
// ② 1項目ずつ照合
const miss = [];
const same = (a, b) => JSON.stringify(a ?? '') === JSON.stringify(b ?? '');
exp.forEach((e, i) => { const p = D.patients.find(x => x.name === e.name); if (!p) { miss.push(`${i + 1}: 見つからない`); return; }
  Object.keys(e).forEach(k => { if (k === 'fs') { const fs = (p.personalFile || {}).faceSheet || {}; Object.keys(e.fs).forEach(fk => { if (!same(fs[fk], e.fs[fk])) miss.push(`${i + 1}: フェイスシート.${fk} 期待=${e.fs[fk]} 実際=${fs[fk]}`); }); if (!fs.updatedDate) miss.push(`${i + 1}: フェイスシート.updatedDate なし`); return; }
    if (!same(p[k], e[k])) miss.push(`${i + 1}: ${k} 期待=${JSON.stringify(e[k])} 実際=${JSON.stringify(p[k])}`); });
  const ec = (p.emergencyContacts || [])[0] || {}; if (ec.name !== e.familyName || ec.phone !== e.familyPhone || ec.phoneMobile !== e.familyPhoneMobile || ec.email !== e.familyEmail || ec.relation !== e.familyRelation) miss.push(`${i + 1}: 緊急連絡先(emergencyContacts[0]) 不一致`);
  if (p.familyLastName !== '見本') miss.push(`${i + 1}: familyLastName 期待=見本 実際=${p.familyLastName}`);
  if (!p.id || p.id <= 0) miss.push(`${i + 1}: id なし`);
  if (e.status === '休止') { const h = (p.pauseHistory || []); if (!(h.length === 1 && !h[0].toDate && /^\d{4}-\d{2}-\d{2}$/.test(h[0].fromDate) && h[0].reason === 'CSV取込')) miss.push(`${i + 1}: 休止の期間(pauseHistory)が付いていない`); if (!p.statusUpdatedAt) miss.push(`${i + 1}: statusUpdatedAt なし`); } });
// ケアマネ事業所・担当者がマスタにも登録される
const offs = (D.systemSettings.cmOffices || []).map(o => o.name), mgrs = (D.systemSettings.careManagers || []).map(c => `${c.office}|${c.name}`);
exp.forEach((e, i) => { if (!offs.includes(e.cmOffice)) miss.push(`${i + 1}: 事業所マスタに無い`); if (!mgrs.includes(`${e.cmOffice}|${e.cmName}`)) miss.push(`${i + 1}: 担当ケアマネのマスタに無い`); });
console.log('② 不一致', miss.length, miss.slice(0, 20)); r.fields = miss.length === 0;
// ③ 利用者IDを入れてもう一度 → 更新10・新規0・値は変わらない
const ids = exp.map(e => D.patients.find(x => x.name === e.name).id);
const rows2 = rows.map((x, i) => [ids[i], ...x.slice(1)]); const m2 = await importCsv(csvOf(rows2)); console.log('③ ', JSON.stringify(m2.split('\n').slice(0, 1)));
await page.waitForTimeout(1500); const D2 = await data();
const miss2 = []; exp.forEach((e, i) => { const p = D2.patients.find(x => x.id === ids[i]); if (!p) { miss2.push(`${i + 1}: 消えた`); return; } Object.keys(e).forEach(k => { if (k === 'fs') return; if (!same(p[k], e[k])) miss2.push(`${i + 1}: ${k} ${JSON.stringify(p[k])}`); }); });
r.reimport = /新規 0 件 \/ 更新 10 件/.test(m2) && D2.patients.length === n0 + 10 && miss2.length === 0 && D2.patients.filter(p => /^ＣＳＶ見本/.test(p.name)).length === 10; if (miss2.length) console.log('③ 不一致', miss2.slice(0, 10));
// ④ 提供記録入力(今日)と年齢
await go('record', { ampm: 'AM' });
const shouldAM = exp.map((e, i) => [i, e.scheduleAmPm[tdow] === 'AM' || e.scheduleAmPm[tdow] === '1日', e.status]).filter(x => x[1] && x[2] === '利用中');
let rec = 0; for (const [i] of shouldAM) rec += (await page.getByTestId(`rv-name-${ids[i]}`).count()) === 1 ? 1 : 0;
// 休止の方は基本利用日に「休止」の行で出る(押せない)・退所の方は出ない
let pzOk = true; for (let i = 0; i < 10; i++) { const e = exp[i]; const onAM = e.scheduleAmPm[tdow] === 'AM' || e.scheduleAmPm[tdow] === '1日'; const cnt = await page.getByTestId(`rv-name-${ids[i]}`).count();
  if (e.status === '退所') { if (cnt !== 0) { pzOk = false; console.log('退所の方が出た', i + 1); } }
  else if (e.status === '休止' && onAM) { const btn = page.locator(`[data-testid^="rv-kibun-open-"][data-testid$="-${ids[i]}"]`).first(); const dis = (await btn.count()) ? await btn.isDisabled() : false; if (cnt !== 1 || !dis) { pzOk = false; console.log('休止の方が休止の行で出ていない', i + 1, cnt, dis); } } }
console.log('④ 今日の提供記録入力に出る', rec, '/', shouldAM.length, '休止は休止の行・退所は出ない', pzOk);
r.record = rec === shouldAM.length && pzOk;
await go('master', { pid: ids[0] }); const bodyTxt = await page.evaluate(() => document.body.innerText); const age0 = (() => { const n = new Date(); let a = n.getFullYear() - 1940; if (n.getMonth() < 4 || (n.getMonth() === 4 && n.getDate() < 15)) a--; return a; })();
r.age = new RegExp(`${age0}歳`).test(bodyTxt); console.log('④ 年齢', r.age);
await b.close();
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
