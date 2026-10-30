import { describe, it, expect } from 'vitest';
import {
  encodeInviteToken,
  decodeInviteToken,
  normalizeInviteCode,
  resolveIndividualExerciseValue,
  monitoringStatusFromRate,
  exercisePrimaryNumber,
  mergeTpTelDone,
  pickHolidays,
  holidayAmpmOn,
  fullHolidaySet,
  holidayClosesSlots,
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

describe('施設休業日の同期(pickHolidays・2026-10-28)', () => {
  const H1 = [{ date: '2026-12-29', name: '年末年始', ampm: '1日' }, { date: '2026-12-30', name: '年末年始', ampm: '1日' }];
  it('古い中身の端末(時刻が古い)が送っても、クラウドの新しい休業日を消さない', () => {
    const r = pickHolidays({ holidays: [], _holTs: 100 }, { holidays: H1, _holTs: 200 });
    expect(r.from).toBe('cloud'); expect(r.holidays).toEqual(H1); expect(r.ts).toBe(200);
  });
  it('手元で後から編集した(時刻が新しい)ときは手元を採る(削除も含む)', () => {
    expect(pickHolidays({ holidays: [], _holTs: 300 }, { holidays: H1, _holTs: 200 })).toEqual({ from: 'local', holidays: [], ts: 300 });
    expect(pickHolidays({ holidays: H1, _holTs: 300 }, { holidays: [] }).from).toBe('local');
  });
  it('どちらにも時刻が無い(前の版のデータ)ときは手元。ただし手元が空でクラウドにあればクラウドを残す', () => {
    expect(pickHolidays({ holidays: [] }, { holidays: H1 }).from).toBe('cloud');
    expect(pickHolidays({}, { holidays: H1 }).holidays).toEqual(H1);
    const L = [{ date: '2026-08-13', name: '夏季休暇' }];
    expect(pickHolidays({ holidays: L }, { holidays: H1 }).holidays).toEqual(L);
    expect(pickHolidays({ holidays: [] }, { holidays: [] }).from).toBe('local');
  });
  it('同じ時刻なら手元(送り直しで中身が変わらない)', () => {
    expect(pickHolidays({ holidays: H1, _holTs: 200 }, { holidays: H1, _holTs: 200 }).from).toBe('local');
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

describe('半日休業(holidayAmpmOn・holidayClosesSlots・2026-10-28)', () => {
  const H = [{ date: '2026-12-29', name: '年末年始' }, '2026-12-30', { date: '2027-01-20', name: '雪のため', ampm: 'AM' }, { date: '2027-01-21', name: '雪', ampm: 'PM' }, { date: '2027-01-22', ampm: '1日' }];
  it('その日の時間帯', () => {
    expect(holidayAmpmOn(H, '2026-12-29')).toBe('1日');
    expect(holidayAmpmOn(H, '2026-12-30')).toBe('1日');
    expect(holidayAmpmOn(H, '2027-01-20')).toBe('AM');
    expect(holidayAmpmOn(H, '2027-01-21')).toBe('PM');
    expect(holidayAmpmOn(H, '2027-01-22')).toBe('1日');
    expect(holidayAmpmOn(H, '2027-01-23')).toBe(null);
    expect(holidayAmpmOn(null, '2027-01-23')).toBe(null);
  });
  it('全日休業の日付だけ', () => {
    expect([...fullHolidaySet(H)].sort()).toEqual(['2026-12-29', '2026-12-30', '2027-01-22']);
  });
  it('来る時間帯が全部ふさがるか', () => {
    expect(holidayClosesSlots(null, true, false)).toBe(false);
    expect(holidayClosesSlots('1日', false, false)).toBe(true);
    expect(holidayClosesSlots('AM', true, false)).toBe(true);
    expect(holidayClosesSlots('AM', false, true)).toBe(false);
    expect(holidayClosesSlots('AM', true, true)).toBe(false);
    expect(holidayClosesSlots('PM', false, true)).toBe(true);
    expect(holidayClosesSlots('PM', false, false)).toBe(false);
  });
});

import { dateIsoAny, healPatientDates } from './logic';
describe('日付をどの書き方でも読む(dateIsoAny・扇橋店の CSV 取込 2026-10-30)', () => {
  it('よくある書き方', () => {
    expect(dateIsoAny('1940-05-15')).toBe('1940-05-15');
    expect(dateIsoAny('1940/5/15')).toBe('1940-05-15');
    expect(dateIsoAny('2024/06/01 0:00')).toBe('2024-06-01');
    expect(dateIsoAny('1940年5月15日')).toBe('1940-05-15');
    expect(dateIsoAny('１９４０／５／１５')).toBe('1940-05-15');
    expect(dateIsoAny('19400515')).toBe('1940-05-15');
    expect(dateIsoAny('2024.6.1')).toBe('2024-06-01');
  });
  it('和暦・Excel の通し番号・月/日/年', () => {
    expect(dateIsoAny('昭和15年5月15日')).toBe('1940-05-15');
    expect(dateIsoAny('S15.5.15')).toBe('1940-05-15');
    expect(dateIsoAny('s15/5/15')).toBe('1940-05-15');
    expect(dateIsoAny('令和6年6月1日')).toBe('2024-06-01');
    expect(dateIsoAny('R6.6.1')).toBe('2024-06-01');
    expect(dateIsoAny('令和元年5月1日')).toBe('2019-05-01');
    expect(dateIsoAny('H30-4-1')).toBe('2018-04-01');
    expect(dateIsoAny('45444')).toBe('2024-06-01'); // Excel: 2024/6/1
    expect(dateIsoAny('14746')).toBe('1940-05-15');
    expect(dateIsoAny('6/1/2024')).toBe('2024-06-01');
    expect(dateIsoAny('25/12/2024')).toBe('2024-12-25');
  });
  it('読めない文字と空は空', () => {
    expect(dateIsoAny('')).toBe(''); expect(dateIsoAny(null)).toBe(''); expect(dateIsoAny('不明')).toBe('');
    expect(dateIsoAny('2024/13/1')).toBe(''); expect(dateIsoAny('2023/2/29')).toBe(''); expect(dateIsoAny('99999')).toBe(''); expect(dateIsoAny('123')).toBe('');
  });
  it('利用者の日付をそろえる(healPatientDates)', () => {
    const pats = [{ id: 1, birthDate: 'S15.5.15', startDate: '45444', endDate: '', careLevelTo: '2027-03-31' }, { id: 2, birthDate: '1950-01-01', startDate: '不明' }, { id: 3 }];
    const r = healPatientDates(pats);
    expect(r.fixed).toEqual([{ id: 1, field: 'birthDate', from: 'S15.5.15', to: '1940-05-15' }, { id: 1, field: 'startDate', from: '45444', to: '2024-06-01' }]);
    expect(r.patients[0]).toEqual({ id: 1, birthDate: '1940-05-15', startDate: '2024-06-01', endDate: '', careLevelTo: '2027-03-31' });
    expect(r.patients[1]).toBe(pats[1]); expect(r.patients[2]).toBe(pats[2]); // 直す所がない方は同じ参照(同期の時刻を刻まない)
    const r2 = healPatientDates(r.patients); expect(r2.fixed).toEqual([]); expect(r2.patients).toBe(r.patients); // もう一度かけても変わらない
  });
});

import { healPausedStatus } from './logic';
describe('休止の終了日を過ぎた方の状態を利用中に(healPausedStatus・2026-10-30)', () => {
  it('最新の休止の終了日が今日より前なら利用中・それ以外は触らない', () => {
    const pats = [
      { id: 1, status: '休止', pauseHistory: [{ fromDate: '2026-06-01', toDate: '2026-07-01' }, { fromDate: '2026-09-01', toDate: '2026-10-26' }] }, // 直す
      { id: 2, status: '休止', pauseHistory: [{ fromDate: '2026-09-01', toDate: '2026-11-05' }] }, // 終了日が先
      { id: 3, status: '休止', pauseHistory: [{ fromDate: '2026-09-01' }] }, // 終了日なし
      { id: 4, status: '休止', pauseHistory: [{ fromDate: '2026-09-01', toDate: '2026-10-26' }, { fromDate: '2026-12-01' }] }, // 先の休止予定が最新
      { id: 5, status: '利用中', pauseHistory: [{ fromDate: '2026-09-01', toDate: '2026-10-26' }] },
      { id: 6, status: '休止', pauseHistory: [{ fromDate: '2026-09-01', toDate: '2026-10-30' }] }, // 終了日が今日(当日は休止)
      { id: 7, status: '休止', pauseHistory: [] },
    ];
    const r = healPausedStatus(pats, '2026-10-30');
    expect(r.fixed.map(f => f.id)).toEqual([1]);
    expect(r.patients[0].status).toBe('利用中'); expect(typeof r.patients[0].statusUpdatedAt).toBe('number');
    [1, 2, 3, 4, 5, 6].forEach(i => expect(r.patients[i]).toBe(pats[i]));
    expect(healPausedStatus(r.patients, '2026-10-30').fixed).toEqual([]);
    expect(healPausedStatus(pats, 'x').patients).toBe(pats);
  });
});
