// Vercel Serverless Function: 店舗データ本体(app_state)の保存を「圧縮して送る」(2026-11-11 trial562)
//
// ★ なぜ必要か
//   保存1回ごとに店舗データ全体(約2.5MB の JSON)をブラウザから Supabase へ送っていた。ブラウザは送信を圧縮しないため、
//   上り(送信)が細い店舗の Wi-Fi では 20〜40秒かかる。ここでは端末が gzip で圧縮して送り(1/6〜1/10)、サーバーが
//   ほどいて Supabase に書く。書き方(CAS: version が一致する1行だけ更新)はブラウザ直接と同じ。読む側(取り込み)は変えない。
//
// 環境変数: SUPABASE_URL(または VITE_SUPABASE_URL) / SUPABASE_SERVICE_ROLE_KEY
//
// POST /api/state-cas
//   headers: content-type: application/octet-stream / x-tsu-token: 職員の証(staff-auth が発行・/api/files と同じ)
//   body: gzip( JSON { key, base, data } )   key=app_state の key(店舗ID など)・base=読んだときの version・data=書く中身
//   → 200 { ok:true, version }   書けた
//   → 200 { ok:true, conflict:true }   version が進んでいた(他の端末が先に書いた) → 端末は読み直して合成し直す
//   → 401/403 証が無い・その店舗の key ではない ／ 413 大きすぎる ／ 500 Supabase のエラー
//   書いてよい key: 証の店舗ID そのもの・diag_<店舗ID>…・本部(super_admin)は全部
import crypto from 'crypto';
import zlib from 'zlib';

export const config = { api: { bodyParser: false } };

const SUPA_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MAX_GZ = 4 * 1024 * 1024;        // 圧縮後 4MB まで(Vercel の上限 4.5MB)
const MAX_RAW = 40 * 1024 * 1024;      // ほどいた後 40MB まで(圧縮爆弾よけ)
const enc = encodeURIComponent;
const unb64u = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
const sigStaff = (payload) => crypto.createHmac('sha256', 'tsumugi-staff-token|' + SERVICE_KEY).update(payload).digest('hex');
function readStaff(token) {
  try {
    const [payload, sig] = String(token || '').split('.'); if (!payload || !sig) return null;
    const expect = sigStaff(payload);
    if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
    const t = JSON.parse(unb64u(payload)); if (!t || !t.exp || Date.now() > Number(t.exp) || !t.sid) return null;
    return t;
  } catch { return null; }
}
const keyAllowed = (st, key) => {
  if (!st || !key) return false;
  if (st.role === 'super_admin') return true;
  const sid = st.store_id ? String(st.store_id) : '';
  if (!sid) return false;
  return key === sid || key.startsWith(`diag_${sid}`);
};
function readRaw(req) {
  return new Promise((resolve, reject) => {
    if (req.body && Buffer.isBuffer(req.body)) return resolve(req.body);
    const chunks = []; let n = 0;
    req.on('data', (c) => { n += c.length; if (n > MAX_GZ) { reject(Object.assign(new Error('too large'), { status: 413 })); try { req.destroy(); } catch {} return; } chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  if (!SUPA_URL || !SERVICE_KEY) return res.status(500).json({ error: 'server not configured' });
  const st = readStaff(req.headers['x-tsu-token']);
  if (!st) return res.status(401).json({ error: 'unauthorized' });
  let raw;
  try { raw = await readRaw(req); } catch (e) { return res.status(e && e.status === 413 ? 413 : 400).json({ error: e && e.status === 413 ? 'too large' : 'bad body' }); }
  if (!raw || !raw.length) return res.status(400).json({ error: 'empty' });
  if (raw.length > MAX_GZ) return res.status(413).json({ error: 'too large' });
  let text;
  try {
    const isGz = raw[0] === 0x1f && raw[1] === 0x8b;
    const buf = isGz ? zlib.gunzipSync(raw, { maxOutputLength: MAX_RAW }) : raw;
    text = buf.toString('utf8');
  } catch { return res.status(400).json({ error: 'bad gzip' }); }
  let body; try { body = JSON.parse(text); } catch { return res.status(400).json({ error: 'bad json' }); }
  const key = body && typeof body.key === 'string' ? body.key : '';
  const base = Number(body && body.base);
  if (!key || !Number.isFinite(base) || base < 0 || !body.data || typeof body.data !== 'object') return res.status(400).json({ error: 'bad fields' });
  if (!keyAllowed(st, key)) return res.status(403).json({ error: 'forbidden' });
  // CAS: version が base の1行だけ更新(ブラウザ直接の update と同じ条件)
  const url = `${SUPA_URL}/rest/v1/app_state?key=eq.${enc(key)}&version=eq.${enc(String(base))}&select=version`;
  let r, j = null;
  try {
    r = await fetch(url, { method: 'PATCH', headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ data: body.data, version: base + 1 }) });
    const t = await r.text().catch(() => ''); try { j = t ? JSON.parse(t) : null; } catch { j = null; }
  } catch (e) { return res.status(502).json({ error: 'supabase unreachable' }); }
  if (!r.ok) return res.status(500).json({ error: (j && (j.message || j.error)) || `supabase ${r.status}` });
  if (Array.isArray(j) && j.length > 0) return res.status(200).json({ ok: true, version: base + 1, bytes: raw.length, raw: text.length });
  return res.status(200).json({ ok: true, conflict: true });
}
