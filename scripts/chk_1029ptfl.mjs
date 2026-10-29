// 2026-10-29 ユーザー「電話、住所、メール、既往歴などは、削除しても後で戻ることがある→修正して」
//   ご家族・ケアマネの保存(portalLogic.js・サーバーの /api/portal と共通)で、直した基本情報に項目時刻(_fieldTs)が刻まれるか。
//   ①ご家族が電話を変える → _fieldTs.phone が刻まれる・変えていない住所は刻まれない・前からある時刻(cmName 等)は残る
//   ②同じ値を送っただけ(変わっていない)なら刻まない ③ケアマネのフェイスシートで既往歴を変える → _fieldTs.kiou が刻まれる・変えなければ刻まない
//   ④3か所の一覧がそろっている(App.jsx の _PT_FL・supabase.js の PATIENT_FIELDLEVEL が PATIENT_TEXT_FL を含む)
//   実行: node scripts/chk_1029ptfl.mjs
import { portalMergePatientFromFamily, portalMergeFaceSheetFromCM, PATIENT_TEXT_FL } from '../src/lib/portalLogic.js';
import fs from 'node:fs';
const r = {};
const T0 = 1700000000000;
const base = () => ({ patients: [{ id: 7, name: '見本 太郎', phone: '03-0000-0000', address: '東京都新宿区西新宿2-8-1', kiou: '高血圧', _savedAt: T0, _fieldTs: { cmName: T0, phone: T0 } }], systemSettings: {} });
{ const out = portalMergePatientFromFamily(base(), 7, { phone: '090-0000-0000', address: '東京都新宿区西新宿2-8-1' });
  const p = out.patients[0]; console.log('①', p.phone, JSON.stringify(p._fieldTs));
  r.famPhone = p.phone === '090-0000-0000' && p._fieldTs.phone > T0; r.famAddrNot = p._fieldTs.address === undefined; r.famKeep = p._fieldTs.cmName === T0; r.famSavedAt = p._savedAt === T0; }
{ const out = portalMergePatientFromFamily(base(), 7, { phone: '03-0000-0000', kiou: '高血圧' });
  const p = out.patients[0]; console.log('②', JSON.stringify(p._fieldTs)); r.famSameNot = p._fieldTs.phone === T0 && p._fieldTs.kiou === undefined; }
{ const out = portalMergeFaceSheetFromCM(base(), 7, { kiou: '高血圧、糖尿病' }, { updatedBy: '見本 ケアマネ' }, new Date().toISOString(), 'du_x1');
  const p = out.patients[0]; console.log('③', p.kiou, JSON.stringify(p._fieldTs)); r.cmKiou = p.kiou === '高血圧、糖尿病' && p._fieldTs.kiou > T0 && p._fieldTs.cmName === T0;
  const out2 = portalMergeFaceSheetFromCM(base(), 7, { kiou: '高血圧' }, { updatedBy: '見本 ケアマネ' }, new Date().toISOString(), 'du_x2');
  r.cmKiouSameNot = out2.patients[0]._fieldTs.kiou === undefined; }
{ const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8'); const sb = fs.readFileSync(new URL('../src/lib/supabase.js', import.meta.url), 'utf8');
  r.appList = /const _PT_FL = \[[^\]]*\.\.\.PATIENT_TEXT_FL\]/.test(app); r.sbList = /const PATIENT_FIELDLEVEL = new Set\(\[[^\]]*\.\.\.PATIENT_TEXT_FL\]\)/.test(sb);
  r.listHas = ['phone', 'phoneMobile', 'email', 'address', 'zipCode', 'kiou', 'ryui', 'doctor'].every(k => PATIENT_TEXT_FL.includes(k)); }
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
