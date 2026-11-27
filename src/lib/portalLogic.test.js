// 2026-10-18 データ保護(段階3.5): ポータルの計算部品(ブラウザ・サーバー共通)
import { describe, it, expect } from 'vitest';
import { portalSliceState, portalAppendDocUpdate, portalMarkDocUpdatesRead, portalMergePatientFromFamily, portalMergePatientDocsFromCM, portalMergeFaceSheetFromCM, PORTAL_SETTINGS_KEYS, mergeEmergencyContacts } from './portalLogic.js';

const cloud = () => ({
  patients: [
    { id: 1, name: '見本 太郎', emergencyContacts: [{ name: '見本 花子', relation: '妻', phone: '000' }], docUpdates: [] },
    { id: 2, name: '見本 次郎', docUpdates: [] },
    { id: 3, name: '見本 三郎' },
  ],
  systemSettings: { facilityInfo: { name: 'テスト店' }, cmOffices: [{ name: 'A事業所' }], careManagers: [{ office: 'A事業所', name: '担当 甲', email: 'x@example.com', _emailTs: 1 }], policies: { family: { version: '2' } }, adminAuth: { hash: 'SECRET' }, members: [{ name: '職員' }] },
  familyAnnouncements: [{ id: 'a1', text: '全体' }],
  familyPersonalAnnouncements: [{ id: 'p1', patientId: 1, text: '1だけ' }, { id: 'p2', patientId: 2, text: '2だけ' }],
  familyPhotos: [{ id: 'f1', patientId: 2 }, { id: 'f2', patientId: 3 }],
  ticketRecords: [{ id: 'tr_1' }],
  _lastSync: { device: 'x', at: 1 }, __clock: 5,
});

describe('portalSliceState: その利用者の分だけ', () => {
  it('許可した利用者・その人宛てのお知らせ・写真だけ。設定は決めた項目だけ(管理者パスワード等は渡さない)', () => {
    const s = portalSliceState(cloud(), ['2']);
    expect(s.patients.map(p => p.id)).toEqual([2]);
    expect(s.familyPersonalAnnouncements.map(a => a.id)).toEqual(['p2']);
    expect(s.familyPhotos.map(f => f.id)).toEqual(['f1']);
    expect(s.familyAnnouncements.length).toBe(1);
    expect(Object.keys(s.systemSettings).sort()).toEqual(PORTAL_SETTINGS_KEYS.filter(k => k !== 'x').sort());
    expect(s.systemSettings.adminAuth).toBeUndefined(); expect(s.systemSettings.members).toBeUndefined();
    expect(s.systemSettings.careManagers[0]._emailTs).toBeUndefined();
    expect(s.ticketRecords).toBeUndefined();
  });
  it('複数の利用者(切替先)をまとめて', () => {
    const s = portalSliceState(cloud(), ['1', '3']);
    expect(s.patients.map(p => p.id)).toEqual([1, 3]);
    expect(s.familyPhotos.map(f => f.id)).toEqual(['f2']);
  });
  it('空や不正な入力では何も返さない', () => {
    expect(portalSliceState(null, ['1'])).toBe(null);
    expect(portalSliceState(cloud(), []).patients).toEqual([]);
  });
});

describe('書き込みの計算(冪等)', () => {
  it('appendDocUpdate: 1回目は追加・同じ id の2回目は null(書かない)', () => {
    const e = { id: 'du_x', at: 't', by: 'family', items: ['連絡先'] };
    const n1 = portalAppendDocUpdate(cloud(), '1', e);
    expect(n1.patients[0].docUpdates.map(u => u.id)).toEqual(['du_x']);
    expect(portalAppendDocUpdate(n1, '1', e)).toBe(null);
    expect(portalAppendDocUpdate(cloud(), '99', e)).toBe(null); // 対象なし
  });
  it('markDocUpdatesRead: 未読があるときだけ更新', () => {
    const c = cloud(); c.patients[0].docUpdates = [{ id: 'a', readCm: false }, { id: 'b', readCm: true }];
    const n = portalMarkDocUpdatesRead(c, '1', 'readCm');
    expect(n.patients[0].docUpdates.every(u => u.readCm)).toBe(true);
    expect(portalMarkDocUpdatesRead(n, '1', 'readCm')).toBe(null);
  });
  it('mergePatientFromFamily: 連絡先は重複を足さない・空の値で上書きしない・他の利用者は触らない', () => {
    const n = portalMergePatientFromFamily(cloud(), '1', { emergencyContacts: [{ name: '見本 花子', relation: '妻', phone: '999' }, { name: '見本 一郎', relation: '長男', phone: '111' }], name: '', familyPhone: '03' }, null);
    const p = n.patients.find(x => x.id === 1);
    expect(p.emergencyContacts.length).toBe(2);
    expect(p.name).toBe('見本 太郎'); expect(p.familyPhone).toBe('03');
    expect(n.patients.find(x => x.id === 2)).toEqual(cloud().patients[1]);
  });
  it('mergePatientDocsFromCM: 変更が無ければ null、介護度が変われば履歴と通知が付く', () => {
    expect(portalMergePatientDocsFromCM(cloud(), '1', {}, 'ケアマネ', '2026-10-18T00:00:00Z', 'du_1')).toBe(null);
    const n = portalMergePatientDocsFromCM(cloud(), '1', { master: { careLevel: '要介護2', careLevelFrom: '2026-10-01' } }, 'ケアマネ', '2026-10-18T00:00:00Z', 'du_1');
    const p = n.patients[0];
    expect(p.careLevel).toBe('要介護2'); expect(p.careLevelHistory.length).toBeGreaterThan(0);
    expect(p.docUpdates[0]).toMatchObject({ id: 'du_1', by: 'caremanager', readOffice: false });
  });
  it('mergeFaceSheetFromCM: フェイスシートの版が増え、同じ id は二重に付かない', () => {
    const n = portalMergeFaceSheetFromCM(cloud(), '1', { kiou: '高血圧' }, { updatedBy: '担当 甲', source: 'caremanager' }, '2026-10-18T00:00:00Z', 'du_2');
    const p = n.patients[0];
    expect(p.kiou).toBe('高血圧'); expect(p.personalFile.faceSheetHistory.length).toBe(1); expect(p.docUpdates[0].id).toBe('du_2');
    expect(portalMergeFaceSheetFromCM(n, '1', { kiou: '高血圧' }, {}, '2026-10-18T00:00:00Z', 'du_2')).toBe(null);
  });
});

// ★ 2026-11-16 1116d: ご家族の登録で入った緊急連絡先・代表家族が、取り込み前の店舗の端末の保存で消えないように
describe('1116d 緊急連絡先の付き合わせ(mergeEmergencyContacts)と、ご家族の登録の項目時刻', () => {
  const T0 = 1700000000000;
  it('ご家族の登録(2人目)で増えた連絡先には _famAt が付き、_fieldTs.emergencyContacts が刻まれる。代表が空なら代表の項目にも刻む', () => {
    const c = cloud(); c.patients[0]._savedAt = T0; c.patients[0]._fieldTs = { phone: T0 };
    const n = portalMergePatientFromFamily(c, '1', { emergencyContacts: [{ name: '見本 一子', relation: '長女', phoneMobile: '090' }], docUpdates: [] });
    const p = n.patients[0];
    expect(p.emergencyContacts.map(x => x.name)).toEqual(['見本 花子', '見本 一子']);
    expect(p.emergencyContacts[1]._famAt).toBeGreaterThan(T0);
    expect(p._fieldTs.emergencyContacts).toBeGreaterThan(T0); expect(p._fieldTs.phone).toBe(T0); expect(p._savedAt).toBe(T0);
    // 1人目(代表)の登録: familyName 等に時刻が付く・緊急連絡先は変わらないので刻まない
    const n2 = portalMergePatientFromFamily(cloud(), '2', { familyName: '見本 二子', familyRelation: '長女', familyPhoneMobile: '080', docUpdates: [] });
    const p2 = n2.patients.find(x => x.id === 2);
    expect(p2.familyName).toBe('見本 二子'); expect(p2._fieldTs.familyName).toBeGreaterThan(0); expect(p2._fieldTs.familyRelation).toBeGreaterThan(0); expect(p2._fieldTs.emergencyContacts).toBeUndefined();
    // 同じ内容をもう一度送っても刻まない
    const n3 = portalMergePatientFromFamily(n, '1', { emergencyContacts: [{ name: '見本 一子', relation: '長女', phoneMobile: '090' }], docUpdates: [] });
    expect(n3.patients[0]._fieldTs.emergencyContacts).toBe(p._fieldTs.emergencyContacts);
  });
  it('店舗の端末(取り込み前・時刻なし)が土台でも、クラウド側の _famAt の連絡先は残る。墓石にあれば戻さない。ケアマネ由来は足さない', () => {
    const local = { emergencyContacts: [{ name: '見本 花子', relation: '妻' }], _savedAt: T0 + 10 };
    const cloudP = { emergencyContacts: [{ name: '見本 花子', relation: '妻' }, { name: '見本 一子', relation: '長女', phoneMobile: '090', _famAt: T0 + 5 }, { name: '担当 甲', relation: 'ケアマネ', _famAt: T0 + 5 }], _fieldTs: { emergencyContacts: T0 + 5 } };
    const m = mergeEmergencyContacts(local, cloudP, true);
    expect(m.emergencyContacts.map(x => x.name)).toEqual(['見本 花子', '見本 一子']);
    // 端末側で消してある(墓石)なら戻らない
    const local2 = { ...local, _deletedEC: ['見本 一子|長女||090'], _fieldTs: { emergencyContacts: T0 + 20 } };
    const m2 = mergeEmergencyContacts(local2, cloudP, true);
    expect(m2.emergencyContacts.map(x => x.name)).toEqual(['見本 花子']); expect(m2._deletedEC).toEqual(['見本 一子|長女||090']);
    // 端末側の方が新しい時刻で、名前の空白だけ違う同じ方が居れば二重にしない
    const local3 = { emergencyContacts: [{ name: '見本　一子', relation: '長女' }], _fieldTs: { emergencyContacts: T0 + 20 } };
    expect(mergeEmergencyContacts(local3, cloudP, true).emergencyContacts.length).toBe(1);
    // 時刻がクラウドの方が新しければクラウドの一覧が土台(端末だけの手入力の連絡先は _famAt が無いので足されない=従来どおり新しい一覧が勝つ)
    const local4 = { emergencyContacts: [{ name: '見本 三郎', relation: '次男' }], _fieldTs: { emergencyContacts: T0 + 1 } };
    expect(mergeEmergencyContacts(local4, cloudP, true).emergencyContacts.map(x => x.name)).toEqual(['見本 花子', '見本 一子']);
    // どちらにも一覧が無ければ undefined(触らない)
    expect(mergeEmergencyContacts({}, {}, true).emergencyContacts).toBeUndefined();
  });
});

import { histDedup, appendValueHist, histKeyOf } from './portalLogic.js';
describe('histDedup / appendValueHist(介護度・負担割合の変更履歴・1128a)', () => {
  const A = { value: '要介護1', from: '2025-10-22', to: '2026-11-01', note: '' };
  const B = { value: '要介護1', from: '2026-11-01', to: '2027-10-31', note: '認定更新', by: '職員A' };
  it('同じ「値 + 開始日」の行は 1 件にまとめる(終了日・メモは入っている方、記入者は先の方)。変わらなければ同じ一覧を返す', () => {
    const l = [A, B]; expect(histDedup(l)).toBe(l);
    const r = histDedup([{ ...A, to: null }, B, { ...A, note: '認定更新' }, { ...B, by: '職員B', to: null }]);
    expect(r).toEqual([{ ...A, note: '認定更新' }, B]);
    expect(histDedup([A, null, 'x'])).toEqual([A]);
    expect(histKeyOf({ value: 'x', from: null, to: '2026-01-01' })).not.toBe(histKeyOf({ value: 'x', from: null, to: '2026-02-01' }));
  });
  it('前にある同じ期間を入れ直しても、2 つ目は足さない(今回の件: 前の期間に戻ったあと、新しい期間を入れ直した)', () => {
    // 戻ったときに足された行(前の期間の「認定更新」)がいちばん後ろにある
    const hist = [A, B, { value: '要介護1', from: '2025-10-22', to: '2026-10-31', note: '認定更新' }];
    const r = appendValueHist(hist, '要介護1', '要介護1', '2026-11-01', '2027-10-31', '2025-10-22', { today: '2026-11-27', by: '職員C' });
    expect(r.filter(h => h.from === '2026-11-01').length).toBe(1);
    expect(r.filter(h => h.from === '2025-10-22').length).toBe(1); // 前からの重なりもまとまる
    expect(r.length).toBe(2);
  });
  it('新しい期間は 1 件足す(値が同じなら「認定更新」・記入者つき)。終了日だけの直しはその行に入れる', () => {
    const r = appendValueHist([{ value: '要介護1', from: '2025-10-22', to: null }], '要介護1', '要介護1', '2026-11-01', '2027-10-31', '2025-10-22', { today: '2026-11-27', by: '職員C' });
    expect(r).toEqual([{ value: '要介護1', from: '2025-10-22', to: '2026-11-01' }, { value: '要介護1', from: '2026-11-01', to: '2027-10-31', note: '認定更新', by: '職員C' }]);
    const r2 = appendValueHist(r, '要介護1', '要介護1', '2026-11-01', '2027-11-30', '2026-11-01', {});
    expect(r2.length).toBe(2); expect(r2[1].to).toBe('2027-11-30');
    expect(appendValueHist([], '', '要介護2', '', '', undefined, { today: '2026-11-27' })).toEqual([{ value: '要介護2', from: '2026-11-27', to: null, note: '' }]);
    expect(appendValueHist([A], '要介護1', '', '2026-11-01', '', '2025-10-22', {})).toEqual([A]);
  });
  it('ケアマネの保存: 直した項目に時刻を刻み、同じ内容をもう一度送っても履歴は増えない', () => {
    const cloud = { patients: [{ id: 1, careLevel: '要介護1', careLevelFrom: '2025-10-22', careLevelTo: '2026-10-31', _fieldTs: { careLevelFrom: 5 } }] };
    const n = portalMergePatientDocsFromCM(cloud, '1', { master: { careLevel: '要介護1', careLevelFrom: '2026-11-01', careLevelTo: '2027-10-31' } }, 'ケアマネ', '2026-11-27T00:00:00Z', 'du_a');
    const p = n.patients[0];
    expect(p.careLevelFrom).toBe('2026-11-01'); expect(p.careLevelHistory.length).toBe(2);
    expect(p._fieldTs.careLevelFrom).toBeGreaterThan(5); expect(p._fieldTs.careLevelTo).toBeGreaterThan(0); expect(p._fieldTs.careLevelHistory).toBeGreaterThan(0);
    expect(p._fieldTs.careLevel).toBeUndefined(); // 変わっていない項目には刻まない
    // 事業所の端末が前の期間に戻したあと、ケアマネがもう一度同じ期間を送る → 履歴は 2 件のまま
    const back = { patients: [{ ...p, careLevelFrom: '2025-10-22', careLevelTo: '2026-10-31' }] };
    const n2 = portalMergePatientDocsFromCM(back, '1', { master: { careLevel: '要介護1', careLevelFrom: '2026-11-01', careLevelTo: '2027-10-31' } }, 'ケアマネ', '2026-11-28T00:00:00Z', 'du_b');
    expect(n2.patients[0].careLevelHistory.length).toBe(2);
  });
});
