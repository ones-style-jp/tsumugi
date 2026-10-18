// 2026-10-18 データ保護(段階3.5): ポータルの計算部品(ブラウザ・サーバー共通)
import { describe, it, expect } from 'vitest';
import { portalSliceState, portalAppendDocUpdate, portalMarkDocUpdatesRead, portalMergePatientFromFamily, portalMergePatientDocsFromCM, portalMergeFaceSheetFromCM, PORTAL_SETTINGS_KEYS } from './portalLogic.js';

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
