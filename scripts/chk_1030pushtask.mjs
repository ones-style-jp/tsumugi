// 2026-10-30 ③タスクの通知(trial476): api/_push_plan.js の planStore を直接確かめる(ブラウザなし)
//   ①朝のお知らせ(既定 9:00): 「今日のタスク n件・期限切れ m件」を1回(題名・利用者名は出さない)・9:00 より前は出さない・送った控えがあれば出さない
//   ②数え方は画面のホームと同じ: 済んだ回は数えない・毎日は営業日だけ(定休日=日曜)・繰り返しは31日前まで・繰り返しなしはずっと・申し送りは数えない
//   ③毎月（最終営業日）: 休業日で最終営業日が前にずれると、その日に数える
//   ④時刻の入ったタスクは開始前に「タスクの時刻」(済んでいれば出さない) ⑤前日のお知らせ(あすの予定)にタスクを数えない ⑥朝のお知らせを止められる
//   実行: node scripts/chk_1030pushtask.mjs
import { planStore, openTaskCounts } from '../api/_push_plan.js';
const r = {};
const at = (h, m) => Date.UTC(2026, 9, 30, h - 9, m); // 2026-10-30(金) 日本時間
const T = (id, o) => ({ id, kind: 'task', title: '架空のタスク', color: '#059669', ...o });
const events = [
  T('t1', { date: '2026-10-30' }),
  T('t2', { date: '2026-10-20' }),
  T('t3', { date: '2026-10-24', repeat: 'daily', repeatEvery: 1, done: { '2026-10-29': { by: 'x', at: 1 } } }),
  T('t4', { date: '2026-10-30', done: { '2026-10-30': { by: 'x', at: 1 } } }),
  T('t5', { date: '2026-10-31' }),
  T('t6', { date: '2026-10-30', start: '09:20' }),
  T('t7', { date: '2026-09-30', repeat: 'monthly_lastbiz', repeatEvery: 1 }),
  T('t8', { date: '2026-10-30', start: '09:20', done: { '2026-10-30': { by: 'x', at: 1 } } }),
  { id: 'm1', kind: 'memo', date: '2026-10-30', title: 'x', color: '#f97316' },
  { id: 'e1', date: '2026-10-31', start: '10:00', title: '架空の予定', color: '#3b82f6' },
];
const base = { storeId: 's', events, colorLabels: [], cfg: null, closedDays: [0], holidays: [] };
// ①②④
let its = planStore(base, at(9, 5), {});
const tm = its.find(x => x.kind === 'taskMorning'); const bt = its.filter(x => x.kind === 'beforeTask');
console.log('9:05', JSON.stringify(its.map(x => [x.kind, x.title, x.body])));
r.morning = !!tm && tm.title === '今日のタスク 3件・期限切れ 6件' && !/架空/.test(tm.title + tm.body) && tm.path === '/?tsugo=dashboard';
r.before = bt.length === 1 && bt[0].title === 'あと15分でタスクの時刻です' && /09:20 タスク/.test(bt[0].body) && bt[0].key.includes('|t6|');
r.early = !planStore(base, at(8, 59), {}).some(x => x.kind === 'taskMorning');
r.sentOnce = !planStore(base, at(9, 30), { 's|tm|2026-10-30': 1 }).some(x => x.kind === 'taskMorning');
const c = openTaskCounts(events, '2026-10-30', { closedDays: [0], holidays: [] }); console.log('数', JSON.stringify(c)); r.counts = c.nToday === 3 && c.nOver === 6; // 期限切れ = t2・t3 の4回(10/24・26・27・28)・t7 の9月の回(9/30)
// ③ 10/31 を休業日にすると、10月の最終営業日は 10/30 → t7 が今日に入る
const c2 = openTaskCounts(events, '2026-10-30', { closedDays: [0], holidays: [{ date: '2026-10-31' }] }); const c3 = openTaskCounts(events, '2026-10-30', { closedDays: [0], holidays: [{ date: '2026-10-31', ampm: 'AM' }] });
console.log('休業日あり', JSON.stringify(c2), '半日休業', JSON.stringify(c3)); r.lastbiz = c2.nToday === 4 && c3.nToday === 3 && c2.nOver === 6;
// ⑤ 前日のお知らせ
const db = planStore(base, at(17, 30), {}).find(x => x.kind === 'dayBefore'); console.log('17:30', db && db.title); r.dayBefore = !!db && /あすの予定 1件/.test(db.title);
// ⑥ 止める
r.off = !planStore({ ...base, cfg: { taskMorning: false } }, at(9, 5), {}).some(x => x.kind === 'taskMorning');
// タスクが無い店は朝のお知らせの控えも作らない
r.noTasks = !planStore({ ...base, events: events.filter(e => e.kind !== 'task') }, at(9, 5), {}).some(x => String(x.key).includes('|tm|'));
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
