// つむぎ: カレンダーの予定の通知をいつ・何を送るかを決める(2026-10-27・第1段階)
//   ファイル名が _ で始まるため Vercel のエンドポイントにはならない。api/push.js の cron から使う。
//   ・前日のお知らせ: 店舗の設定の時刻(既定 17:00)を過ぎたら、あすの予定をまとめて1通
//   ・開始前のお知らせ: 開始の N 分前(既定 30 分)から開始までの間に1通(1分おきの点検で届く・2026-10-28 までは5分おき)
//   ・夜(20時〜7時)は送らない。通知の文には利用者名・題名を出さない(ロック画面に出るため)。ラベル(担当者会議・契約など)と時刻だけ
//   ・2026-10-30 タスク(kind:'task'): 朝のお知らせ(既定 9:00・今日のタスクと期限切れの数を1回)・時刻の入ったタスクは開始前に「タスクの時刻」。済んだ回は送らない。前日のお知らせ(あすの予定)には数えない
//     繰り返しの判定は画面(App.jsx tsuOccursOn)と同じ: 毎月（最終営業日）・タスクの毎日は営業日だけ(定休日 closedDays・1日の休業日 holidays)
export const JST_OFF = 9 * 60 * 60 * 1000;
export const PUSH_DEFAULTS = { on: true, dayBefore: true, dayBeforeAt: '17:00', before: true, beforeMin: 30, offColors: [], taskMorning: true, taskMorningAt: '09:00' };
// 画面(カレンダー)の既定のラベル。店舗が変えていれば systemSettings.scheduleColorLabels を使う
const DEFAULT_LABELS = [
  { color: '#3b82f6', label: '担当者会議' }, { color: '#ef4444', label: '契約' }, { color: '#10b981', label: '見学' },
  { color: '#f59e0b', label: '避難訓練' }, { color: '#8b5cf6', label: '行事' }, { color: '#0ea5e9', label: 'その他' },
];
const pad2 = (n) => String(n).padStart(2, '0');
// d は JST にずらした Date(getUTC* で日本時間の年月日が読める)
export const isoOfJst = (d) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
const DOW = ['日', '月', '火', '水', '木', '金', '土'];

// 営業日(定休日・1日の休業日でない)。ctx = { closedDays, holidays }
const fullHolidays = (hs) => { const s = new Set(); (Array.isArray(hs) ? hs : []).forEach(h => { const d = String((h && (h.date || h)) || ''); const ap = h && typeof h === 'object' ? h.ampm : ''; if (d && (!ap || ap === '1日')) s.add(d); }); return s; };
const isBiz = (dstr, ctx) => { if (!ctx) return true; const closed = Array.isArray(ctx.closedDays) ? ctx.closedDays : [0]; const [y, m, d] = dstr.split('-').map(Number); if (closed.includes(new Date(Date.UTC(y, m - 1, d)).getUTCDay())) return false; if (!ctx._hol) ctx._hol = fullHolidays(ctx.holidays); return !ctx._hol.has(dstr); };
const lastBizOfMonth = (y, m, ctx) => { for (let d = new Date(Date.UTC(y, m, 0)).getUTCDate(); d >= 1; d--) { const s = `${y}-${pad2(m)}-${pad2(d)}`; if (isBiz(s, ctx)) return s; } return null; };
export const isTask = (e) => !!e && e.kind === 'task';
export const taskDoneOn = (e, dstr) => { const x = e && e.done && e.done[dstr]; return !!x && !x.off; };
// 画面(App.jsx tsuOccursOn)と同じ繰り返しの判定
export function occursOn(e, dstr, ctx) {
  if (!e || !e.date) return false;
  if (e.date === dstr) return true;
  if (!e.repeat || e.repeat === 'none') return false;
  if (dstr < e.date) return false;
  if (e.repeatUntil && dstr > e.repeatUntil) return false;
  const every = Math.max(1, Number(e.repeatEvery) || 1);
  const [y1, m1, d1] = e.date.split('-').map(Number);
  const [y2, m2, d2] = dstr.split('-').map(Number);
  const base = Date.UTC(y1, m1 - 1, d1), cur = Date.UTC(y2, m2 - 1, d2);
  const diff = Math.round((cur - base) / 86400000);
  if (e.repeat === 'daily') return diff > 0 && diff % every === 0 && (!isTask(e) || isBiz(dstr, ctx));
  if (e.repeat === 'weekly') return diff > 0 && diff % (7 * every) === 0;
  if (e.repeat === 'monthly') { if (d1 !== d2) return false; const mo = (y2 - y1) * 12 + (m2 - m1); return mo > 0 && mo % every === 0; }
  if (e.repeat === 'monthly_lastbiz') { const mo = (y2 - y1) * 12 + (m2 - m1); if (!(mo > 0 && mo % every === 0)) return false; return lastBizOfMonth(y2, m2, ctx) === dstr; }
  if (e.repeat === 'yearly') { if (m1 !== m2 || d1 !== d2) return false; const yr = y2 - y1; return yr > 0 && yr % every === 0; }
  if (e.repeat === 'monthly_nth') {
    const bd = new Date(base).getUTCDay(), cd = new Date(cur).getUTCDay(); if (bd !== cd) return false;
    const nth = Math.floor((d2 - 1) / 7) + 1; const lastDom = new Date(Date.UTC(y2, m2, 0)).getUTCDate(); const isLast = d2 + 7 > lastDom;
    const weeks = e.monthlyNthWeeks || []; return weeks.includes(nth) || (isLast && weeks.includes('last'));
  }
  return false;
}
export function labelOf(e, colorLabels) {
  const c = String((e && e.color) || '').toLowerCase();
  const own = (Array.isArray(colorLabels) ? colorLabels : []).find(x => x && String(x.color || '').toLowerCase() === c);
  const def = DEFAULT_LABELS.find(x => x.color === c);
  return String((own && own.label) || (def && def.label) || '予定').slice(0, 20);
}
const minOf = (s) => { const m = String(s || '').match(/^(\d{1,2}):(\d{2})/); return m ? (+m[1]) * 60 + (+m[2]) : null; };
const isoAdd = (dstr, n) => { const [y, m, d] = dstr.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`; };
// 済んでいないタスクの数(画面のホームと同じ: 繰り返しは31日前まで・繰り返しなしはずっと)。today=今日の回、over=期限切れ
export function openTaskCounts(events, today, ctx) {
  let nToday = 0, nOver = 0; const from = isoAdd(today, -31);
  (Array.isArray(events) ? events : []).filter(isTask).forEach(t => {
    if (!t.date || t.date > today) return;
    if (!t.repeat || t.repeat === 'none') { if (!taskDoneOn(t, t.date)) { if (t.date === today) nToday++; else nOver++; } return; }
    let d = t.date > from ? t.date : from; let g = 0;
    while (d <= today && g++ < 400) { if (occursOn(t, d, ctx) && !taskDoneOn(t, d)) { if (d === today) nToday++; else nOver++; } d = isoAdd(d, 1); }
  });
  return { nToday, nOver };
}

// 1店舗ぶんの「いま送るもの」を返す。sent = 送った鍵の控え(重ねて送らない)
export function planStore({ storeId, events, colorLabels, cfg, closedDays, holidays }, nowMs, sent) {
  const c = { ...PUSH_DEFAULTS, ...((cfg && typeof cfg === 'object') ? cfg : {}) };
  if (c.on === false) return [];
  const j = new Date(nowMs + JST_OFF); const hm = j.getUTCHours() * 60 + j.getUTCMinutes();
  if (hm < 7 * 60 || hm >= 20 * 60) return []; // 夜は送らない
  const today = isoOfJst(j); const tmr = new Date(nowMs + JST_OFF + 86400000); const tomorrow = isoOfJst(tmr);
  const off = new Set((Array.isArray(c.offColors) ? c.offColors : []).map(x => String(x).toLowerCase()));
  // ★ 2026-10-30: 申し送りメモ(kind:'memo')は予定ではないので通知しない。タスク(kind:'task')はラベルで止めない・下の別の決まりで送る
  const ctx = { closedDays: Array.isArray(closedDays) ? closedDays : [0], holidays: Array.isArray(holidays) ? holidays : [] };
  const all = (Array.isArray(events) ? events : []).filter(e => e && e.id != null && e.date && e.kind !== 'memo');
  const list = all.filter(e => !isTask(e) && !off.has(String(e.color || '').toLowerCase()));
  const tasks = all.filter(isTask);
  const byStart = (a, b) => String(a.start || '99').localeCompare(String(b.start || '99'));
  const out = []; const S = sent || {};
  if (c.before !== false) {
    const bm = Math.max(5, Math.min(180, Number(c.beforeMin) || 30));
    [...list, ...tasks.filter(t => !taskDoneOn(t, today))].filter(e => occursOn(e, today, ctx)).sort(byStart).forEach(e => {
      const st = minOf(e.start); if (st == null) return;
      if (hm >= st - bm && hm < st) {
        const key = `${storeId}|b|${e.id}|${today}`; if (S[key]) return;
        const rem = st - hm;
        if (isTask(e)) { out.push({ key, kind: 'beforeTask', title: `あと${rem}分でタスクの時刻です`, body: `${String(e.start).slice(0, 5)} タスク`, tag: `tsumugi-b-${e.id}-${today}`, path: '/?tsugo=dashboard' }); return; }
        out.push({ key, kind: 'before', title: `あと${rem}分で予定があります`, body: `${String(e.start).slice(0, 5)} ${labelOf(e, colorLabels)}`, tag: `tsumugi-b-${e.id}-${today}`, path: '/?tsugo=schedule' });
      }
    });
  }
  if (c.dayBefore !== false) {
    const at = minOf(c.dayBeforeAt) ?? 17 * 60;
    const key = `${storeId}|d|${tomorrow}`;
    if (hm >= at && !S[key]) {
      const L = list.filter(e => occursOn(e, tomorrow, ctx)).sort(byStart);
      if (L.length) {
        const head = L.slice(0, 4).map(e => `${e.start ? String(e.start).slice(0, 5) : '終日'} ${labelOf(e, colorLabels)}`).join('・');
        out.push({ key, kind: 'dayBefore', title: `あすの予定 ${L.length}件（${tmr.getUTCMonth() + 1}/${tmr.getUTCDate()} ${DOW[tmr.getUTCDay()]}）`, body: head + (L.length > 4 ? ` ほか${L.length - 4}件` : ''), tag: `tsumugi-d-${tomorrow}`, path: '/?tsugo=schedule' });
      } else out.push({ key, kind: 'none', skip: true }); // 予定が無い日も控え(何度も数えない)
    }
  }
  // タスクの朝のお知らせ: 設定の時刻(既定 9:00)を過ぎたら、今日のタスクと期限切れの数を1回(題名は出さない)
  if (c.taskMorning !== false && tasks.length) {
    const at = minOf(c.taskMorningAt) ?? 9 * 60; const key = `${storeId}|tm|${today}`;
    if (hm >= at && !S[key]) {
      const { nToday, nOver } = openTaskCounts(tasks, today, ctx);
      if (nToday + nOver) out.push({ key, kind: 'taskMorning', title: `今日のタスク ${nToday}件${nOver ? `・期限切れ ${nOver}件` : ''}`, body: '押すとホームの本日の業務を開きます', tag: `tsumugi-tm-${today}`, path: '/?tsugo=dashboard' });
      else out.push({ key, kind: 'none', skip: true });
    }
  }
  return out;
}
