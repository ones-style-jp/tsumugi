// 2026-11-16 1116d: ご家族の登録で入った緊急連絡先が、店舗の端末の保存で消えないように(ある店舗の利用者の長女の件)
//   ① 利用者マスタを開くと、ご家族アカウント(本人・ケアマネを除く)で代表にも追加の緊急連絡先にも居ない方が「追加の緊急連絡先」に戻る(保存で確定・_famAt 付き・_fieldTs.emergencyContacts が刻まれる)
//   ② 消した控え(墓石 _deletedEC)に名前がある方は戻さない
//   ③ 代表のご家族と同じ名前・続柄「本人」・ケアマネのアカウントは戻さない
//   ④ 計算部品: portalLogic.mergeEmergencyContacts(店舗の push/pull と共通)・App.jsx の _PT_FL に emergencyContacts・supabase.js が mergeEmergencyContacts を使う
//   実行: node scripts/chk_1116ec.mjs [port]
import { chromium } from 'playwright';
import fs from 'node:fs';
import { mergeEmergencyContacts, portalMergePatientFromFamily } from '../src/lib/portalLogic.js';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
const r = {}; const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
const S = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const ps = d.patients.filter(p => p.status === '利用中' && !p.endDate);
  const A = ps[0], B = ps[1];
  A.name = '検家 太郎'; A.familyName = '検家 花子'; A.familyLastName = '検家'; A.familyFirstName = '花子'; A.familyRelation = '妻'; A.emergencyContacts = []; delete A._deletedEC; delete A._fieldTs;
  B.name = '検家 次郎'; B.familyName = '検家 梅子'; B.familyLastName = '検家'; B.familyFirstName = '梅子'; B.familyRelation = '妻'; B.emergencyContacts = []; B._deletedEC = ['検家 二子|次女||09000000002']; delete B._fieldTs;
  d.familyAccounts = [
    { id: 'fam_t1', patientId: A.id, kind: 'family', role: 'child', relation: '長女', displayName: '検家 一子', lastName: '検家', firstName: '一子', kana: 'けんけ いちこ', phoneMobile: '09000000001', email: 'ichiko@example.com', createdAt: '2026-11-15' },
    { id: 'fam_t2', patientId: A.id, kind: 'family', role: 'child', relation: '本人', displayName: '検家 太郎' },
    { id: 'fam_t3', patientId: A.id, kind: 'caremanager', role: 'caremanager', relation: 'ケアマネ', displayName: '検家 ケア', cmOffice: '検家居宅' },
    { id: 'fam_t4', patientId: A.id, kind: 'family', role: 'parent', relation: '妻', displayName: '検家 花子' },
    { id: 'fam_t5', patientId: B.id, kind: 'family', role: 'child', relation: '次女', displayName: '検家 二子', phoneMobile: '09000000002', createdAt: '2026-11-15' },
  ];
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0');
  sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'master', pid: A.id, t: Date.now() })); return { aId: A.id, bId: B.id }; });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(3500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
// ① A: 長女が「追加の緊急連絡先」に出る(本人・ケアマネ・代表と同じ花子は出ない)
const txtA = (await page.locator('body').innerText()).replace(/\s/g, '');
r.a_daughter_shown = /検家一子/.test(txtA) && !/検家ケア/.test(txtA) && !/追加の緊急連絡先なし/.test(txtA);
const ecNames = await page.locator('input[placeholder="氏名"]').evaluateAll(els => els.map(e => e.value));
r.a_only_daughter = ecNames.filter(v => /検家/.test(v)).join('|') === '検家 一子';
// 保存 → 端末の控えに _famAt 付きで入り、項目時刻が刻まれる
await page.locator('button:visible', { hasText: /^保存$/ }).last().click(); await page.waitForTimeout(1500);
const d1 = await page.evaluate(() => JSON.parse(localStorage.getItem('daycareAppData_v3')));
const A1 = d1.patients.find(p => p.id === S.aId);
r.a_saved = (A1.emergencyContacts || []).length === 1 && A1.emergencyContacts[0].name === '検家 一子' && A1.emergencyContacts[0].relation === '長女' && A1.emergencyContacts[0].phoneMobile === '09000000001' && !!A1.emergencyContacts[0]._famAt;
r.a_fieldTs = !!(A1._fieldTs && A1._fieldTs.emergencyContacts);
r.a_primary_kept = A1.familyName === '検家 花子';
// ② B: 墓石に名前がある次女は戻らない
await page.evaluate((pid) => { sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'master', pid, t: Date.now() })); }, S.bId);
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(3000); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
const txtB = (await page.locator('body').innerText()).replace(/\s/g, '');
const ecNamesB = await page.locator('input[placeholder="氏名"]').evaluateAll(els => els.map(e => e.value));
r.b_tomb_not_restored = /検家次郎/.test(txtB) && /検家梅子/.test(txtB) && !/検家二子/.test(txtB) && !ecNamesB.some(v => /二子/.test(v)); // 画面の緊急連絡先は代表の梅子だけ(編集用の欄にも二子は無い)
await b.close();
// ④ 計算部品(店舗の端末の保存=push と同じ計算): 取り込み前の端末(時刻なし・一覧は登録前)が土台でも、クラウドの登録分は残る
{ const T0 = 1700000000000;
  const cloud = portalMergePatientFromFamily({ patients: [{ id: 9, name: '検家 太郎', familyName: '検家 花子', emergencyContacts: [], _savedAt: T0 }] }, 9, { emergencyContacts: [{ name: '検家 一子', relation: '長女', phoneMobile: '09000000001' }], docUpdates: [] }).patients[0];
  const local = { id: 9, name: '検家 太郎', familyName: '検家 花子', emergencyContacts: [], _savedAt: T0 + 60000, memo: '端末で別の項目を直した' };
  const m = mergeEmergencyContacts(local, cloud, true);
  r.calc_keep_fam = m.emergencyContacts.length === 1 && m.emergencyContacts[0].name === '検家 一子';
  const m2 = mergeEmergencyContacts({ ...local, _deletedEC: ['検家 一子|長女||09000000001'], _fieldTs: { emergencyContacts: Date.now() + 1000 } }, cloud, true); // 端末で消した(墓石+新しい時刻)
  r.calc_tomb = m2.emergencyContacts.length === 0;
  r.calc_primary_ts = !!(cloud._fieldTs && cloud._fieldTs.emergencyContacts) && cloud.familyName === '検家 花子'; }
{ const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8'); const sb = fs.readFileSync(new URL('../src/lib/supabase.js', import.meta.url), 'utf8');
  r.app_ptfl = /const _PT_FL = \[[^\]]*'emergencyContacts'[^\]]*\]/.test(app) && /mergeEmergencyContacts\(lp, cp, true\)/.test(app);
  r.sb_uses = /mergeEmergencyContacts\(lpArg, cpArg, lp === lpArg\)/.test(sb) && /k === 'emergencyContacts'/.test(sb); }
const ok = Object.values(r).every(v => v === true); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
