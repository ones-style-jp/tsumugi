// Vercel Serverless Function: 送迎ルート自動作成プロキシ(2026-09-12 試験版・送迎表)
// Google Maps Directions API で「施設→各利用者宅→施設」の最短順と区間所要時間を計算する。
//
// 環境変数（Vercel > Settings > Environment Variables）:
//   GOOGLE_MAPS_API_KEY - 本部のGoogle Maps Platform APIキー(Directions API有効・Sensitive)。
//                          未設定なら {notConfigured:true} を返し、アプリは手動割り振りのまま動く。
//
// GET  /api/route-plan → { configured: true/false }
// POST /api/route-plan → { order:[入力stopsのindex順], legSeconds:[区間秒(出発→1人目, 1人目→2人目, …, 最後→施設)] }
//   body: { origin: "施設住所", stops: ["住所1", "住所2", ...] }  (stopsは最大10件)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (req.method === 'GET') return res.status(200).json({ configured: !!key });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!key) return res.status(200).json({ notConfigured: true });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const origin = String(body.origin || '').trim();
  const destination = String(body.destination || body.origin || '').trim();  // ★ 片道ルート用(既定=originへ戻る輪)
  // ★ 2026-09-12h: 上限を23停留へ(Directions APIの上限25waypoint内)。keepOrder=trueで順番を変えずに区間時間だけ取得
  const stops = Array.isArray(body.stops) ? body.stops.map(x => String(x || '').trim()).filter(Boolean).slice(0, 23) : [];
  const keepOrder = !!body.keepOrder;
  const departAt = Number(body.departAt) || 0; // ★ 2026-09-12j: 出発予定時刻(epoch秒)。指定時はその時間帯の交通状況で計算
  if (!origin || stops.length < 1) return res.status(400).json({ error: 'origin と stops は必須です' });

  try {
    const params = new URLSearchParams({
      origin, destination,
      waypoints: (keepOrder ? '' : 'optimize:true|') + stops.join('|'),
      key, language: 'ja', region: 'jp',
    });
    if (departAt > Math.floor(Date.now()/1000)) { params.set('departure_time', String(departAt)); params.set('traffic_model', 'best_guess'); }
    const r = await fetch('https://maps.googleapis.com/maps/api/directions/json?' + params.toString());
    const j = await r.json();
    if (j.status !== 'OK' || !j.routes || !j.routes[0]) {
      return res.status(200).json({ error: `ルート計算に失敗しました (${j.status || 'no route'})`, detail: j.error_message || '' });
    }
    const route = j.routes[0];
    const legs = route.legs || [];
    return res.status(200).json({
      order: keepOrder ? stops.map((_, i) => i) : (route.waypoint_order || stops.map((_, i) => i)),
      legSeconds: legs.map(l => (l.duration_in_traffic && l.duration_in_traffic.value) || (l.duration && l.duration.value) || 0),
      // ★ 方角クラスタリング用: 施設と各停留の座標(legsの端点から無追加コストで取得)
      originCoord: legs[0] && legs[0].start_location ? legs[0].start_location : null,
      stopCoords: legs.slice(0, Math.max(0, legs.length - 1)).map(l => l.end_location || null),
    });
  } catch (e) {
    return res.status(502).json({ error: 'ルート計算に失敗しました: ' + String((e && e.message) || e) });
  }
}
