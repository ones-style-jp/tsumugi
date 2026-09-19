// Vercel Serverless Function: 災害速報(気象庁の公開データ)を取りまとめて返す (2026-09-19・運営推進会議の要望)
// つむぎの画面は1分ごとにここを見て、該当があれば赤いポップアップを出す。
//
// 取得元(気象庁 防災情報・公開JSON。契約不要・無料。ただし"揺れる前"の緊急地震速報(EEW)は含まれない):
//   地震: https://www.jma.go.jp/bosai/quake/data/list.json      (発生1〜2分後・最大震度 maxi・都道府県別 int[].code)
//   津波: https://www.jma.go.jp/bosai/tsunami/data/list.json    (津波警報・注意報)
//   警報: https://www.jma.go.jp/bosai/warning/data/warning/<都道府県コード>.json (大雨・洪水・暴風・大雪・高潮・波浪の警報/特別警報)
//
// GET /api/alerts?pref=130000   (pref=都道府県の気象庁コード。未指定は東京都)
//   → { checkedAt, alerts:[{ id, kind:'quake'|'tsunami'|'warning', level:'critical'|'high', title, body, at }] }
//   60秒キャッシュ(サーバーレス実行環境内)。気象庁側が落ちていても他の種別は返す。

const UA = { 'User-Agent': 'tsumugi-care-app (disaster alert proxy)' };
let _cache = { key: '', at: 0, data: null };

// 警報コード → 名称(注意報は対象外・警報/特別警報のみ)
const WARN_NAMES = {
  '02': '暴風雪警報', '03': '大雨警報', '04': '洪水警報', '05': '暴風警報', '06': '大雪警報', '07': '波浪警報', '08': '高潮警報',
  '32': '暴風雪特別警報', '33': '大雨特別警報', '35': '暴風特別警報', '36': '大雪特別警報', '37': '波浪特別警報', '38': '高潮特別警報',
};
const INT_ORDER = ['1', '2', '3', '4', '5-', '5+', '6-', '6+', '7'];
const intRank = (s) => INT_ORDER.indexOf(String(s || ''));

async function fetchJson(url, ms = 8000) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), ms);
  try { const r = await fetch(url, { headers: UA, signal: ctrl.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
  finally { clearTimeout(t); }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const pref = String((req.query && req.query.pref) || '130000').replace(/[^0-9]/g, '').slice(0, 6) || '130000';
  const prefTwo = pref.slice(0, 2);
  if (_cache.key === pref && Date.now() - _cache.at < 60 * 1000 && _cache.data) return res.status(200).json(_cache.data);

  const now = Date.now();
  const alerts = [];
  const errors = [];

  // 地震: 直近90分・最大震度4以上で当該都道府県に震度あり、または震度5弱以上(全国)
  try {
    const list = await fetchJson('https://www.jma.go.jp/bosai/quake/data/list.json');
    const seen = new Set();
    (Array.isArray(list) ? list : []).forEach((q) => {
      const at = Date.parse(q.at || q.rdt || '') || 0;
      if (!at || now - at > 90 * 60 * 1000) return;
      const maxi = String(q.maxi || '');
      const local = (Array.isArray(q.int) ? q.int : []).find((x) => String(x.code || '').slice(0, 2) === prefTwo);
      const localInt = local ? String(local.maxi || '') : '';
      const big = intRank(maxi) >= intRank('5-');
      const near = localInt && intRank(localInt) >= intRank('4');
      if (!big && !near) return;
      const key = q.eid || `${q.at}|${q.anm}`; if (seen.has(key)) return; seen.add(key);
      alerts.push({
        id: `quake:${key}`, kind: 'quake', level: (intRank(localInt) >= intRank('5-') || intRank(maxi) >= intRank('6-')) ? 'critical' : 'high',
        title: `地震情報 ${q.anm || ''} 最大震度${maxi}${localInt ? `（この地域: 震度${localInt}）` : ''}`,
        body: `${(q.at || '').replace('T', ' ').slice(0, 16)} 発生${q.mag ? `・M${q.mag}` : ''}。揺れによる転倒・落下物にご注意ください。津波の有無は気象庁の発表をご確認ください。`,
        at: q.at || q.rdt || '',
      });
    });
  } catch (e) { errors.push('quake: ' + String(e && e.message || e).slice(0, 80)); }

  // 津波: 直近12時間・取り消しでないもの
  try {
    const list = await fetchJson('https://www.jma.go.jp/bosai/tsunami/data/list.json');
    (Array.isArray(list) ? list : []).forEach((t) => {
      const at = Date.parse(t.at || t.rdt || '') || 0;
      if (!at || now - at > 12 * 60 * 60 * 1000) return;
      if (t.cancelled) return;
      const ttl = String(t.ttl || '津波情報');
      alerts.push({ id: `tsunami:${t.eid || t.at}`, kind: 'tsunami', level: /警報/.test(ttl) ? 'critical' : 'high',
        title: ttl, body: `${(t.at || '').replace('T', ' ').slice(0, 16)} 発表。海岸・河口付近から離れ、高い場所へ避難してください。`, at: t.at || '' });
    });
  } catch (e) { errors.push('tsunami: ' + String(e && e.message || e).slice(0, 80)); }

  // 警報(都道府県): 警報/特別警報が「発表」中のもの
  try {
    const w = await fetchJson(`https://www.jma.go.jp/bosai/warning/data/warning/${pref}.json`);
    const names = new Map();
    (Array.isArray(w.areaTypes) ? w.areaTypes : []).forEach((at) => (Array.isArray(at.areas) ? at.areas : []).forEach((a) => {
      (Array.isArray(a.warnings) ? a.warnings : []).forEach((x) => {
        const code = String(x.code || ''); const st = String(x.status || '');
        if (!code || !WARN_NAMES[code]) return;
        if (/解除|なし/.test(st)) return;
        const nm = WARN_NAMES[code];
        if (!names.has(nm)) names.set(nm, new Set());
        if (a.name) names.get(nm).add(a.name);
      });
    }));
    names.forEach((areas, nm) => {
      alerts.push({ id: `warning:${pref}:${nm}:${String(w.reportDatetime || '').slice(0, 13)}`, kind: 'warning', level: /特別警報/.test(nm) ? 'critical' : 'high',
        title: nm, body: `${(w.reportDatetime || '').replace('T', ' ').slice(0, 16)} 発表${areas.size ? `（${[...areas].slice(0, 4).join('・')}${areas.size > 4 ? ' ほか' : ''}）` : ''}。${w.headlineText ? String(w.headlineText).slice(0, 120) : ''}`, at: w.reportDatetime || '' });
    });
  } catch (e) { errors.push('warning: ' + String(e && e.message || e).slice(0, 80)); }

  const data = { checkedAt: new Date(now).toISOString(), pref, alerts, ...(errors.length ? { errors } : {}) };
  _cache = { key: pref, at: now, data };
  return res.status(200).json(data);
}
