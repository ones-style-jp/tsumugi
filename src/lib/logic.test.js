import { describe, it, expect } from 'vitest';
import {
  encodeInviteToken,
  decodeInviteToken,
  normalizeInviteCode,
  resolveIndividualExerciseValue,
  monitoringStatusFromRate,
  exercisePrimaryNumber,
  mergeTpTelDone,
} from './logic.js';

describe('invite token', () => {
  it('encode→decode で元のオブジェクトに戻る (日本語含む)', () => {
    const obj = { c: 'FAM-1234-5678', p: 5, s: 'store_a', e: 'a@b.jp', r: '長男', x: '2026-07-01' };
    const t = encodeInviteToken(obj);
    expect(typeof t).toBe('string');
    expect(t).not.toMatch(/[+/=]/); // URLセーフ
    expect(decodeInviteToken(t)).toEqual(obj);
  });
  it('不正トークンは null', () => {
    expect(decodeInviteToken('')).toBeNull();
    expect(decodeInviteToken('!!!notbase64')).toBeNull();
  });
});

describe('normalizeInviteCode', () => {
  it('小文字・記号混じりを FAM-XXXX-XXXX 形に整形', () => {
    expect(normalizeInviteCode('fam12345678')).toBe('FAM-1234-5678');
    expect(normalizeInviteCode('FAM-1234-5678')).toBe('FAM-1234-5678');
    expect(normalizeInviteCode('ab')).toBe('AB');
  });
  it('数字だけの入力は 1234-5678 形に整形(全角・空白・ハイフン混じりも)', () => {
    expect(normalizeInviteCode('12345678')).toBe('1234-5678');
    expect(normalizeInviteCode('1234-5678')).toBe('1234-5678');
    expect(normalizeInviteCode('1234 5678')).toBe('1234-5678');
    expect(normalizeInviteCode('123')).toBe('123');
    expect(normalizeInviteCode('123456789')).toBe('1234-5678');
  });
});

describe('resolveIndividualExerciseValue (個別運動 ○→基準値)', () => {
  const inds = [{ itemId: 'walk', defaultValue: '15分' }, { itemId: 'bar', defaultValue: '10/20' }];
  it('通常運動(オブジェクトでない)は undefined', () => {
    expect(resolveIndividualExerciseValue('15分', inds)).toBeUndefined();
    expect(resolveIndividualExerciseValue('○', inds)).toBeUndefined();
  });
  it('○ は基準値に変換', () => {
    expect(resolveIndividualExerciseValue({ itemId: 'walk', value: '○' }, inds)).toBe('15分');
    expect(resolveIndividualExerciseValue({ itemId: 'bar', value: '◯' }, inds)).toBe('10/20');
  });
  it('基準値が無ければ null', () => {
    expect(resolveIndividualExerciseValue({ itemId: 'none', value: '○' }, inds)).toBeNull();
  });
  it('数値はそのまま', () => {
    expect(resolveIndividualExerciseValue({ itemId: 'walk', value: '20分' }, inds)).toBe('20分');
  });
  it('×・ー・空 は null', () => {
    expect(resolveIndividualExerciseValue({ itemId: 'walk', value: '×' }, inds)).toBeNull();
    expect(resolveIndividualExerciseValue({ itemId: 'walk', value: 'ー' }, inds)).toBeNull();
    expect(resolveIndividualExerciseValue({ itemId: 'walk', value: '' }, inds)).toBeNull();
  });
  it('circleモード(連絡帳): 実施なら○、×・空は非表示', () => {
    expect(resolveIndividualExerciseValue({ itemId: 'walk', value: '20分' }, inds, 'circle')).toBe('○');
    expect(resolveIndividualExerciseValue({ itemId: 'walk', value: '○' }, inds, 'circle')).toBe('○');
    expect(resolveIndividualExerciseValue({ itemId: 'walk', value: '×' }, inds, 'circle')).toBeNull();
  });
});

describe('monitoringStatusFromRate', () => {
  it('未通所→実施できなかった', () => { expect(monitoringStatusFromRate(0, null)).toBe('実施できなかった'); });
  it('100%→実施できた', () => { expect(monitoringStatusFromRate(5, 100)).toBe('実施できた'); });
  it('67%→概ね実施できた', () => { expect(monitoringStatusFromRate(2, 67)).toBe('概ね実施できた'); });
  it('30%→一部実施できなかった', () => { expect(monitoringStatusFromRate(1, 30)).toBe('一部実施できなかった'); });
});

describe('exercisePrimaryNumber', () => {
  it('分数・単位つきから主数値を抽出', () => {
    expect(exercisePrimaryNumber('10/20')).toBe(10);
    expect(exercisePrimaryNumber('15分')).toBe(15);
    expect(exercisePrimaryNumber('3往復')).toBe(3);
    expect(exercisePrimaryNumber('36.5')).toBe(36.5);
  });
  it('○・ー・空 は null', () => {
    expect(exercisePrimaryNumber('○')).toBeNull();
    expect(exercisePrimaryNumber('ー')).toBeNull();
    expect(exercisePrimaryNumber('')).toBeNull();
    expect(exercisePrimaryNumber(null)).toBeNull();
  });
});

// ★ 2026-10-02 同期の穴の対策(扇橋 上野様の件)
import { deepSame, sameStateIgnoringMeta, reconcileRemoteRecords, mergeDraftRows } from './logic.js';
describe('deepSame / sameStateIgnoringMeta', () => {
  it('キーの順番が違っても同じ・undefined のキーは無いのと同じ', () => {
    expect(deepSame({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 })).toBe(true);
    expect(deepSame({ a: 1, x: undefined }, { a: 1 })).toBe(true);
    expect(deepSame({ a: '8:10' }, { a: '8:15' })).toBe(false);
  });
  it('時刻の印と最後に保存した端末だけ違う店舗データは「同じ」(書かない)', () => {
    const cloud = { patients: [{ id: 1, name: 'a' }], __clock: 100, _lastSync: { device: 'A', at: 1 } };
    const next = { _lastSync: { device: 'B', at: 2 }, patients: [{ name: 'a', id: 1 }], __clock: 200 };
    expect(sameStateIgnoringMeta(next, cloud)).toBe(true);
    expect(sameStateIgnoringMeta({ ...next, patients: [{ id: 1, name: 'b' }] }, cloud)).toBe(false);
  });
});
describe('reconcileRemoteRecords (保存で、届いたばかりの他端末の変更を消さない)', () => {
  const base = [{ id: 'tr_75', status: '出席', temp_AM: '', _fieldTs: { status: 1 } }, { id: 'tr_31', kibunArrival: '' }];
  it('土台の後に届いた欠席は、保存で触っていなければ残る', () => {
    const cur = [{ id: 'tr_75', status: '欠席', temp_AM: '', _fieldTs: { status: 9 } }, base[1]];
    const next = [{ id: 'tr_75', status: '出席', temp_AM: '', _fieldTs: { status: 1 } }, { id: 'tr_31', kibunArrival: 'good' }];
    const { recs, n } = reconcileRemoteRecords(cur, base, next);
    expect(n).toBe(1);
    expect(recs[0].status).toBe('欠席');
    expect(recs[0]._fieldTs.status).toBe(9);
    expect(recs[1].kibunArrival).toBe('good');
  });
  it('保存で変えた項目は保存の値が勝つ', () => {
    const cur = [{ id: 'tr_75', status: '欠席', temp_AM: '' }, base[1]];
    const next = [{ id: 'tr_75', status: '振替', temp_AM: '' }, base[1]];
    expect(reconcileRemoteRecords(cur, base, next).recs[0].status).toBe('振替');
  });
  it('手元にだけ届いた新しい記録は足し、この保存で消した記録は戻さない', () => {
    const cur = [...base, { id: 'tr_new', status: '欠席' }];
    const next = [base[0]]; // tr_31 はこの保存で削除
    const { recs } = reconcileRemoteRecords(cur, base, next);
    expect(recs.map(r => r.id).sort()).toEqual(['tr_75', 'tr_new']);
  });
});
describe('mergeDraftRows (編集中でも、触っていない人・項目は最新に)', () => {
  it('触っていない上野様の行は最新(欠席)・編集中の方の入力は残る', () => {
    const base = [{ id: 75, status: '出席', temp_AM: '' }, { id: 31, status: '出席', kibunArrival: '' }];
    const draft = [{ id: 75, status: '出席', temp_AM: '' }, { id: 31, status: '出席', kibunArrival: 'good' }];
    const fresh = [{ id: 75, status: '欠席', temp_AM: '' }, { id: 31, status: '出席', kibunArrival: '' }];
    const { rows, base: nb, kept } = mergeDraftRows(fresh, draft, base);
    expect(rows[0].status).toBe('欠席');
    expect(rows[1].kibunArrival).toBe('good');
    expect(kept).toBe(1);
    expect(nb[1].kibunArrival).toBe(''); // 次回も「この端末の入力」として残すため base は元のまま
  });
});
describe('mergeDraftRows (外した行・足した行)', () => {
  it('この端末で外した行は作り直しても戻らない／足した行は残る', () => {
    const base = [{ id: 1, status: '出席' }, { id: 2, status: '出席' }];
    const draft = [{ id: 2, status: '出席' }, { id: 3, status: '臨時' }];
    const fresh = [{ id: 1, status: '出席' }, { id: 2, status: '欠席' }];
    const r1 = mergeDraftRows(fresh, draft, base);
    expect(r1.rows.map(r => r.id)).toEqual([2, 3]);
    expect(r1.rows[0].status).toBe('欠席');
    const r2 = mergeDraftRows(fresh, r1.rows, r1.base);
    expect(r2.rows.map(r => r.id)).toEqual([2, 3]);
  });
});

describe('送迎表の連絡済の同期(mergeTpTelDone)', () => {
  it('新しい方のコマを採用しても、もう一方で付けた連絡済は残る', () => {
    const a = { cars: {}, _savedAt: 200, _telDone: { 1: { ck: '10', on: true, t: 100 } } };
    const b = { cars: {}, _savedAt: 150, _telDone: { 2: { ck: '20', on: true, t: 140 } } };
    const m = mergeTpTelDone(a, b);
    expect(m._savedAt).toBe(200);
    expect(m._telDone[1].on).toBe(true);
    expect(m._telDone[2].on).toBe(true);
  });
  it('同じ方は時刻(t)が新しい方(外した操作も)を残し、変化が無ければ同じ参照を返す', () => {
    const a = { _savedAt: 200, _telDone: { 1: { ck: '10', on: true, t: 100 } } };
    const b = { _savedAt: 150, _telDone: { 1: { ck: '10', on: false, t: 180 } } };
    expect(mergeTpTelDone(a, b)._telDone[1].on).toBe(false);
    const c = { _savedAt: 150, _telDone: { 1: { ck: '10', on: false, t: 50 } } };
    expect(mergeTpTelDone(a, c)).toBe(a);
    expect(mergeTpTelDone(a, { _savedAt: 1 })).toBe(a);
  });
});
