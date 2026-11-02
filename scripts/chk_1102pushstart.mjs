// 2026-11-02 trial500 開始の時刻ちょうどの通知(atStart): api/_push_plan.js の planStore を直接確かめる(ブラウザなし)
//   ①10:00 の予定 → 10:00〜10:09 の点検で「予定の時刻です」が1通(9:59 は出ない・10:10 は出ない) ②一度送った控えがあれば出ない
//   ③時刻つきタスク → 「タスクの時刻です」・済んだタスクは出ない ④atStart:false なら出ない ⑤30分前(before)は今までどおり別に出る ⑥終日(時刻なし)は出ない
//   実行: node scripts/chk_1102pushstart.mjs
import { planStore } from '../api/_push_plan.js';
const JST = 9 * 3600 * 1000;
const at = (h, m) => Date.parse(`2026-11-02T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`) - JST; // JST の時刻を UTC の ms に
const today = '2026-11-02';
const events = [
  { id: 'e1', date: today, start: '10:00', end: '11:00', title: '担当者会議', color: '#6366f1' },
  { id: 'e2', date: today, start: '', title: '終日の予定', color: '#6366f1' },
  { id: 't1', kind: 'task', date: today, start: '10:00', title: '請求の確認', color: '#047857' },
  { id: 't2', kind: 'task', date: today, start: '10:00', title: '済みのタスク', color: '#047857', done: { [today]: { by: 'A', at: 1 } } },
];
const base = { storeId: 's', events, colorLabels: [{ color: '#6366f1', label: '会議' }], cfg: { dayBefore: false, taskMorning: false }, closedDays: [], holidays: [] };
const kinds = (ms, sent, cfg) => planStore({ ...base, cfg: { ...base.cfg, ...(cfg || {}) } }, ms, sent || {}).filter(x => !x.skip).map(x => `${x.kind}:${x.key.split('|')[2]}`).sort();
const r = {};
const k1000 = kinds(at(10, 0)); console.log('10:00', k1000);
r.atStart = k1000.includes('start:e1') && k1000.includes('startTask:t1') && !k1000.some(k => k.includes(':t2')) && !k1000.some(k => k.includes(':e2'));
r.before = kinds(at(9, 45)).includes('before:e1') && !kinds(at(9, 45)).some(k => k.startsWith('start')); // 15分前は before だけ
r.notBefore = !kinds(at(9, 59)).some(k => k.startsWith('start'));
r.window = kinds(at(10, 9)).includes('start:e1') && !kinds(at(10, 10)).some(k => k.startsWith('start'));
r.once = !kinds(at(10, 3), { 's|s|e1|2026-11-02': 1, 's|s|t1|2026-11-02': 1 }).some(k => k.startsWith('start'));
r.off = !kinds(at(10, 0), {}, { atStart: false }).some(k => k.startsWith('start'));
const it = planStore(base, at(10, 0), {}).find(x => x.kind === 'start'); r.text = !!it && it.title === '予定の時刻です' && it.body === '10:00 会議' && it.tag === 'tsumugi-s-e1-2026-11-02';
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); process.exit(Object.values(r).every(Boolean) ? 0 : 1);
