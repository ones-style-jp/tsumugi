// Vercel Serverless Function: 災害速報(気象庁の公開データ)を取りまとめて返す (2026-09-19・運営推進会議の要望)
// つむぎの画面は1分ごとにここを見て、該当があれば赤いポップアップを出す。
//
// 取得元(気象庁 防災情報・公開JSON。契約不要・無料。ただし"揺れる前"の緊急地震速報(EEW)は含まれない):
//   地震: https://www.jma.go.jp/bosai/quake/data/list.json      (発生1〜2分後・最大震度 maxi・都道府県別 int[].code・市町村別 int[].city[])
//   津波: https://www.jma.go.jp/bosai/tsunami/data/list.json    (一覧) → 各報の詳細 JSON(予報区ごとの 大津波警報/津波警報/津波注意報/津波予報)
//   警報: https://www.jma.go.jp/bosai/warning/data/warning/<都道府県コード>.json (市町村ごとの警報/特別警報)
//   地域名: https://www.jma.go.jp/bosai/common/const/area.json (市町村コード class20s → 名称)
//
// GET /api/alerts?pref=130000&addr=<事業所住所>
//   pref = 都道府県の気象庁コード(未指定は東京都)、addr = 事業所の住所(市区町村の特定に使う・任意)
//   → { checkedAt, pref, area:{ names:[市区町村名] }, alerts:[{ id, kind:'quake'|'tsunami'|'warning', level:'critical'|'high', title, body, at }] }
//
// ★ 2026-09-30(不具合修正): 事業所の地域に合わせて絞り込む。
//   従来は ①津波: 全国のどこかで出た津波情報(被害の心配がない「津波予報(若干の海面変動)」を含む)を全店に「避難してください」と表示、
//   ②地震: 全国どこでも震度5弱以上なら全店に表示、③警報: 都道府県内のどこか(東京都なら伊豆諸島など)に出ていれば表示、だった。
//   → ①事業所の都道府県の沿岸の予報区に「津波注意報」以上が出ているときだけ、②事業所の市区町村で震度4以上
//     (市区町村が特定できない時は都道府県内で震度4以上)、または同じ都道府県内で震度5弱以上、③事業所の市区町村に出ている警報だけ。

const UA = { 'User-Agent': 'tsumugi-care-app (disaster alert proxy)' };
let _cache = new Map(); // key → { at, data }
let _areaCache = { at: 0, data: null };
let _tsuDetail = new Map(); // 津波の詳細JSON(報ごとに不変)

// 警報コード → 名称(注意報は対象外・警報/特別警報のみ)
const WARN_NAMES = {
  '02': '暴風雪警報', '03': '大雨警報', '04': '洪水警報', '05': '暴風警報', '06': '大雪警報', '07': '波浪警報', '08': '高潮警報',
  '32': '暴風雪特別警報', '33': '大雨特別警報', '35': '暴風特別警報', '36': '大雪特別警報', '37': '波浪特別警報', '38': '高潮特別警報',
};
const INT_ORDER = ['1', '2', '3', '4', '5-', '5+', '6-', '6+', '7'];
const intRank = (s) => INT_ORDER.indexOf(String(s || ''));
const intLabel = (s) => String(s || '').replace('-', '弱').replace('+', '強');

// 都道府県(気象庁コード先頭2桁) → その都道府県の沿岸にあたる津波予報区の名前(部分一致)。内陸県は空。
const PREF_NAMES = {
  '01': '北海道', '02': '青森県', '03': '岩手県', '04': '宮城県', '05': '秋田県', '06': '山形県', '07': '福島県', '08': '茨城県', '09': '栃木県', '10': '群馬県',
  '11': '埼玉県', '12': '千葉県', '13': '東京都', '14': '神奈川県', '15': '新潟県', '16': '富山県', '17': '石川県', '18': '福井県', '19': '山梨県', '20': '長野県',
  '21': '岐阜県', '22': '静岡県', '23': '愛知県', '24': '三重県', '25': '滋賀県', '26': '京都府', '27': '大阪府', '28': '兵庫県', '29': '奈良県', '30': '和歌山県',
  '31': '鳥取県', '32': '島根県', '33': '岡山県', '34': '広島県', '35': '山口県', '36': '徳島県', '37': '香川県', '38': '愛媛県', '39': '高知県', '40': '福岡県',
  '41': '佐賀県', '42': '長崎県', '43': '熊本県', '44': '大分県', '45': '宮崎県', '46': '鹿児島県', '47': '沖縄県',
};
const TSUNAMI_AREAS = {
  '01': [/北海道/, /オホーツク海沿岸/], '02': [/青森県/, /陸奥湾/], '03': [/岩手県/], '04': [/宮城県/], '05': [/秋田県/], '06': [/山形県/], '07': [/福島県/], '08': [/茨城県/],
  '12': [/千葉県/, /東京湾内湾/], '13': [/東京湾内湾/, /伊豆諸島/, /小笠原諸島/], '14': [/東京湾内湾/, /相模湾・三浦半島/, /神奈川県/],
  '15': [/新潟県/, /佐渡/], '16': [/富山県/], '17': [/石川県/], '18': [/福井県/], '22': [/静岡県/], '23': [/愛知県/, /伊勢・三河湾/], '24': [/三重県/, /伊勢・三河湾/],
  '26': [/京都府/], '27': [/大阪府/], '28': [/兵庫県/, /淡路島/], '30': [/和歌山県/], '31': [/鳥取県/], '32': [/島根県/, /隠岐/], '33': [/岡山県/], '34': [/広島県/], '35': [/山口県/],
  '36': [/徳島県/], '37': [/香川県/], '38': [/愛媛県/], '39': [/高知県/], '40': [/福岡県/, /有明・八代海/], '41': [/佐賀県/, /有明・八代海/], '42': [/長崎県/, /壱岐・対馬/, /有明・八代海/],
  '43': [/熊本県/, /有明・八代海/], '44': [/大分県/], '45': [/宮崎県/], '46': [/鹿児島県/, /種子島・屋久島/, /奄美群島・トカラ列島/], '47': [/沖縄本島/, /大東島/, /宮古島・八重山/],
};

async function fetchJson(url, ms = 8000) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), ms);
  try { const r = await fetch(url, { headers: UA, signal: ctrl.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
  finally { clearTimeout(t); }
}

// 事業所住所 → その市区町村の気象庁コード(class20s・7桁)。特定できなければ []。
async function municipalityOf(prefTwo, addr) {
  const a = String(addr || '').replace(/[\s　]/g, '');
  if (!a) return { codes: [], names: [] };
  if (!_areaCache.data || Date.now() - _areaCache.at > 24 * 60 * 60 * 1000) {
    try { _areaCache = { at: Date.now(), data: await fetchJson('https://www.jma.go.jp/bosai/common/const/area.json', 10000) }; } catch { if (!_areaCache.data) return { codes: [], names: [] }; }
  }
  const c20 = (_areaCache.data && _areaCache.data.class20s) || {};
  const prefName = PREF_NAMES[prefTwo] || '';
  const rest = prefName && a.startsWith(prefName) ? a.slice(prefName.length) : a.replace(/^(北海道|東京都|京都府|大阪府|.{2,3}県)/, '');
  const cands = Object.entries(c20).filter(([code]) => code.slice(0, 2) === prefTwo);
  // ①住所が市区町村名で始まるもの(最長一致) ②政令市などで「横浜市北部/南部」のように分かれている場合は市の名前で始まるもの全部
  let best = [];
  cands.forEach(([code, v]) => { const nm = String((v && v.name) || ''); if (nm && rest.startsWith(nm)) best.push([code, nm]); });
  if (!best.length) {
    // 郡名・島名が前に付く住所(例: 八重山郡与那国町・八丈島八丈町)は、先頭付近に含まれる市区町村名で探す
    cands.forEach(([code, v]) => { const nm = String((v && v.name) || ''); const i = nm ? rest.indexOf(nm) : -1; if (nm.length >= 2 && i > 0 && i <= 8) best.push([code, nm]); });
  }
  if (best.length) { const L = Math.max(...best.map(([, nm]) => nm.length)); best = best.filter(([, nm]) => nm.length === L); }
  else {
    const city = (rest.match(/^(.+?[市郡])/) || [])[1];
    if (city) best = cands.filter(([, v]) => String((v && v.name) || '').startsWith(city)).map(([code, v]) => [code, v.name]);
  }
  return { codes: best.map(([c]) => c), names: [...new Set(best.map(([, n]) => n))] };
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
  const addr = String((req.query && req.query.addr) || '').slice(0, 120);
  const muni = await municipalityOf(prefTwo, addr);
  const cacheKey = `${pref}|${muni.codes.join(',')}`;
  const hit = _cache.get(cacheKey);
  if (hit && Date.now() - hit.at < 60 * 1000) return res.status(200).json(hit.data);

  const now = Date.now();
  const alerts = [];
  const errors = [];
  const myCodes = new Set(muni.codes);
  // 地震の市町村コードは「市区町村コード+00」。政令市の「横浜市北部」のような区域コード(末尾が00以外)は地震情報に無いので、その場合は都道府県単位で判定する
  const quakeCodes = new Set(muni.codes.filter((c) => /00$/.test(c)));
  const placeLabel = muni.names.length ? muni.names.slice(0, 2).join('・') : (PREF_NAMES[prefTwo] || 'この地域');

  // 地震: 直近90分。事業所の市区町村で震度4以上(特定できない時は都道府県内で震度4以上)、または同じ都道府県内で震度5弱以上
  try {
    const list = await fetchJson('https://www.jma.go.jp/bosai/quake/data/list.json');
    const seen = new Set();
    (Array.isArray(list) ? list : []).forEach((q) => {
      const at = Date.parse(q.at || q.rdt || '') || 0;
      if (!at || now - at > 90 * 60 * 1000) return;
      const prefInt = (Array.isArray(q.int) ? q.int : []).find((x) => String(x.code || '').slice(0, 2) === prefTwo);
      if (!prefInt) return;
      const prefMax = String(prefInt.maxi || '');
      let myInt = '';
      if (quakeCodes.size) {
        (Array.isArray(prefInt.city) ? prefInt.city : []).forEach((c) => { if (quakeCodes.has(String(c.code || '')) && intRank(c.maxi) > intRank(myInt)) myInt = String(c.maxi || ''); });
      } else {
        myInt = prefMax;
      }
      const near = myInt && intRank(myInt) >= intRank('4');
      // 市区町村が特定できないときだけ「都道府県内で震度5弱以上」も出す(特定できたら事業所の揺れだけで判断。例: 23区の事業所に八丈島の揺れは出さない)
      const bigInPref = !quakeCodes.size && intRank(prefMax) >= intRank('5-');
      if (!near && !bigInPref) return;
      const key = q.eid || `${q.at}|${q.anm}`; if (seen.has(key)) return; seen.add(key);
      const shown = myInt || prefMax;
      alerts.push({
        id: `quake:${key}`, kind: 'quake', level: (intRank(shown) >= intRank('5-')) ? 'critical' : 'high',
        title: `地震情報 ${q.anm || ''}（${myInt ? `${placeLabel}: 震度${intLabel(myInt)}` : `${PREF_NAMES[prefTwo] || '県内'}の最大: 震度${intLabel(prefMax)}`}）`,
        body: `${(q.at || '').replace('T', ' ').slice(0, 16)} 発生${q.mag ? `・M${q.mag}` : ''}。揺れによる転倒・落下物にご注意ください。津波の有無は気象庁の発表をご確認ください。`,
        at: q.at || q.rdt || '',
      });
    });
  } catch (e) { errors.push('quake: ' + String(e && e.message || e).slice(0, 80)); }

  // 津波: 直近12時間の最新報ごとに詳細を見て、この都道府県の沿岸の予報区に「津波注意報」以上が出ているときだけ
  try {
    let pats = TSUNAMI_AREAS[prefTwo] || [];
    // 東京都は島しょ部と23区で予報区が違う(23区=東京湾内湾、島しょ=伊豆諸島/小笠原諸島)。多摩地域(内陸)は対象外。
    if (prefTwo === '13' && muni.names.length) {
      if (muni.names.some((n) => /^(大島町|利島村|新島村|神津島村|三宅村|御蔵島村|八丈町|青ヶ島村|小笠原村)$/.test(n))) pats = [/伊豆諸島/, /小笠原諸島/];
      else if (muni.names.some((n) => /区$/.test(n))) pats = [/東京湾内湾/];
      else pats = [];
    }
    if (pats.length) {
      const list = await fetchJson('https://www.jma.go.jp/bosai/tsunami/data/list.json');
      const latest = new Map();
      (Array.isArray(list) ? list : []).forEach((t) => {
        const at = Date.parse(t.rdt || t.at || '') || 0;
        if (!at || now - at > 12 * 60 * 60 * 1000) return;
        const k = t.eid || t.at; const cur = latest.get(k);
        if (!cur || (Date.parse(cur.rdt || cur.at || '') || 0) < at) latest.set(k, t);
      });
      for (const t of latest.values()) {
        if (t.cancelled || !t.json) continue;
        let det = _tsuDetail.get(t.json);
        if (!det) { det = await fetchJson(`https://www.jma.go.jp/bosai/tsunami/data/${encodeURIComponent(t.json)}`); _tsuDetail.set(t.json, det); if (_tsuDetail.size > 50) _tsuDetail = new Map([..._tsuDetail].slice(-20)); }
        const items = (((det || {}).Body || {}).Tsunami || {}).Forecast?.Item || [];
        const hits = (Array.isArray(items) ? items : []).map((it) => ({ area: String((it.Area && it.Area.Name) || ''), kind: String((it.Category && it.Category.Kind && it.Category.Kind.Name) || '') }))
          .filter((x) => x.area && pats.some((re) => re.test(x.area)) && /大津波警報|津波警報|津波注意報/.test(x.kind) && !/解除/.test(x.kind));
        if (!hits.length) continue;
        const kindOf = (k) => /大津波警報/.test(k) ? '大津波警報' : /津波警報/.test(k) ? '津波警報' : '津波注意報';
        const top = hits.some((h) => kindOf(h.kind) === '大津波警報') ? '大津波警報' : hits.some((h) => kindOf(h.kind) === '津波警報') ? '津波警報' : '津波注意報';
        // 予報区ごとの種類を分けて書く(例: 津波警報（伊豆諸島）・津波注意報（東京湾内湾）)
        const byKind = ['大津波警報', '津波警報', '津波注意報'].map((k) => [k, [...new Set(hits.filter((h) => kindOf(h.kind) === k).map((h) => h.area))]]).filter(([, a]) => a.length);
        alerts.push({ id: `tsunami:${t.eid || t.at}:${top}`, kind: 'tsunami', level: top === '津波注意報' ? 'high' : 'critical',
          title: byKind.map(([k, a]) => `${k}（${a.slice(0, 3).join('・')}${a.length > 3 ? ' ほか' : ''}）`).join('・'),
          body: `${(t.rdt || t.at || '').replace('T', ' ').slice(0, 16)} 発表。${top === '津波注意報' ? '海の中や海岸付近は危険です。海岸・河口付近には近づかないでください。' : '海岸・河口付近から離れ、高い場所へ避難してください。'}`,
          at: t.rdt || t.at || '' });
      }
    }
  } catch (e) { errors.push('tsunami: ' + String(e && e.message || e).slice(0, 80)); }

  // 警報: 事業所の市区町村に「発表」中の警報/特別警報(市区町村が特定できない時は都道府県内のどこか)
  try {
    const w = await fetchJson(`https://www.jma.go.jp/bosai/warning/data/warning/${pref}.json`);
    const c20 = (_areaCache.data && _areaCache.data.class20s) || {};
    const types = Array.isArray(w.areaTypes) ? w.areaTypes : [];
    const muniAreas = (types[1] && Array.isArray(types[1].areas)) ? types[1].areas : [];
    const target = myCodes.size ? muniAreas.filter((a) => myCodes.has(String(a.code || ''))) : muniAreas;
    const names = new Map();
    target.forEach((a) => {
      (Array.isArray(a.warnings) ? a.warnings : []).forEach((x) => {
        const code = String(x.code || ''); const st = String(x.status || '');
        if (!code || !WARN_NAMES[code]) return;
        if (/解除|なし/.test(st)) return;
        const nm = WARN_NAMES[code];
        if (!names.has(nm)) names.set(nm, new Set());
        const an = (c20[String(a.code || '')] && c20[String(a.code || '')].name) || '';
        if (an) names.get(nm).add(an);
      });
    });
    names.forEach((areas, nm) => {
      alerts.push({ id: `warning:${pref}:${nm}:${String(w.reportDatetime || '').slice(0, 13)}`, kind: 'warning', level: /特別警報/.test(nm) ? 'critical' : 'high',
        title: `${nm}（${areas.size ? [...areas].slice(0, 3).join('・') + (areas.size > 3 ? ' ほか' : '') : placeLabel}）`,
        body: `${(w.reportDatetime || '').replace('T', ' ').slice(0, 16)} 発表。${w.headlineText ? String(w.headlineText).slice(0, 120) : ''}` });
    });
  } catch (e) { errors.push('warning: ' + String(e && e.message || e).slice(0, 80)); }

  const data = { checkedAt: new Date(now).toISOString(), pref, area: { names: muni.names }, alerts, ...(errors.length ? { errors } : {}) };
  _cache.set(cacheKey, { at: now, data });
  if (_cache.size > 100) _cache = new Map([..._cache].slice(-50));
  return res.status(200).json(data);
}
