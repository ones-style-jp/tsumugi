// 2026-11-27 trial645 通知に予定の中身: api/_push_plan.js の planStore・evText・payloadFor を直接確かめる(ブラウザなし・名前は架空)
//   ①中身つき(full)は「10:00 担当者会議：ご自宅で（山田 太郎様）」・伏せた文は「10:00 担当者会議」のまま ②題名に名字があれば名前を重ねない
//   ③端末ごと: 7日以内に開いた端末=中身つき・8日前/開いた記録なし=伏せる・14日にすれば8日前も中身つき ④detail:false なら全部伏せる
//   ⑤前日のまとめは1件ずつ改行 ⑥朝のタスクは題名 ⑦利用者名を読めなかったときも題名は出る ⑧利用者つきの予定があるときだけ名前を読む(needNames)
//   実行: node scripts/chk_1127pushdetail.mjs (repo 直下)
import { planStore, payloadFor, evText } from '../api/_push_plan.js';
const JST = 9 * 3600 * 1000; const D = 86400000;
const at = (d, h, m) => Date.parse(`${d}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`) - JST;
const today = '2026-11-27', tmr = '2026-11-28';
const events = [
  { id: 'e1', date: today, start: '10:00', title: 'ご自宅で', color: '#3b82f6', patientId: 5 },
  { id: 'e2', date: today, start: '13:00', title: '山田様 契約', color: '#ef4444', patientId: 5 },
  { id: 'e3', date: tmr, start: '10:30', title: '見学', color: '#10b981' },
  { id: 'e4', date: tmr, start: '', title: '担当者会議', color: '#3b82f6', patientId: 7 },
  { id: 't1', kind: 'task', date: today, start: '', title: '請求の確認', color: '#047857' },
];
const names = { 5: '山田 太郎', 7: '佐藤 花子' };
const base = { storeId: 's', events, colorLabels: [], cfg: { atStart: false, dayBefore: false, taskMorning: false }, closedDays: [], holidays: [], names };
const plan = (ms, cfg, extra) => planStore({ ...base, ...(extra || {}), cfg: { ...base.cfg, ...(cfg || {}) } }, ms, {}).filter(x => !x.skip);
const R = []; const ok = (n, c, d) => { R.push([n, !!c]); console.log((c ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? ' ' + JSON.stringify(d) : '')); };
const now = at(today, 9, 45);
const b1 = plan(now).find(x => x.key.includes('|e1|'));
ok('1 中身つきと伏せた文', b1 && b1.body === '10:00 担当者会議' && b1.full && b1.full.body === '10:00 担当者会議：ご自宅で（山田 太郎様）' && b1.full.title === '予定15分前', b1);
ok('2 題名に名字があれば名前を重ねない', evText(events[1], [], names) === '山田様 契約', evText(events[1], [], names));
const subAt = (ago) => ({ seen: new Date(now - ago).toISOString() });
ok('3a 7日以内に開いた端末は中身つき', payloadFor(b1, subAt(1 * D), now).body === b1.full.body);
ok('3b 8日前に開いた端末は伏せる', payloadFor(b1, subAt(8 * D), now).body === '10:00 担当者会議');
ok('3c 開いた記録の無い端末は伏せる', payloadFor(b1, {}, now).body === '10:00 担当者会議');
const b14 = plan(now, { detailDays: 14 }).find(x => x.key.includes('|e1|'));
ok('3d 14日にすれば8日前も中身つき', payloadFor(b14, subAt(8 * D), now).detail === true);
const off = plan(now, { detail: false }).find(x => x.key.includes('|e1|'));
ok('4 detail:false なら伏せる', off && !off.full && payloadFor(off, subAt(0), now).body === '10:00 担当者会議', off);
const db = plan(at(today, 17, 1), { dayBefore: true }).find(x => x.kind === 'dayBefore');
ok('5 前日のまとめは1件ずつ改行', db && db.full && db.full.body === '10:30 見学\n終日 担当者会議（佐藤 花子様）' && db.body === '10:30 見学・終日 担当者会議', db && db.full);
const tm = plan(at(today, 9, 1), { taskMorning: true }).find(x => x.kind === 'taskMorning');
ok('6 朝のタスクは題名', tm && tm.full && tm.full.body === '請求の確認' && tm.body === '押すとホームの本日の業務を開きます', tm && tm.full);
const nn = plan(now, {}, { names: undefined }).find(x => x.key.includes('|e1|'));
ok('7 名前を読めなくても題名は出る', nn && nn.full.body === '10:00 担当者会議：ご自宅で', nn && nn.full);
ok('8 利用者つきの予定があるときだけ needNames', b1.needNames === true && tm.needNames === false);
const bad = R.filter(x => !x[1]); console.log(bad.length ? `FAIL ${bad.length}` : 'ALL PASS'); process.exit(bad.length ? 1 : 0);
