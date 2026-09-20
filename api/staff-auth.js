// Vercel Serverless Function: 職員(本部/店舗)アカウントの認証と管理をサーバー側で行う (2026-09-21)
//
// ★ なぜ必要か
//   これまで staff テーブル(ログインID・パスワードのハッシュ)はブラウザが公開キーで直接読み書きしていた。
//   つまりアプリのURLと公開キーを知る人は、全店の職員のハッシュ一覧を取り出せる状態だった。
//   このエンドポイントに移すことで、staff テーブルは RLS を有効化しポリシー無し(=ブラウザからは一切見えない)にできる。
//   サーバーだけが service_role キーで読み書きする(app_secrets と同じ守り方)。
//
// 環境変数: SUPABASE_URL(または VITE_SUPABASE_URL) / SUPABASE_SERVICE_ROLE_KEY
//
// POST /api/staff-auth  { action, ... }
//   login                { username, password_hash }                          → { staff, token }
//   list                 { token, store_id? }                                 → { staff:[...] }   本部=全店 / 店舗管理者=自店
//   create               { token, store_id, username, password_hash, role, last_name, first_name, email, phone } → { staff }
//   change_password      { token, staff_id, password_hash }                   → { ok }           本人 または 本部
//   delete_store_staff   { token, store_id }                                  → { ok, deleted }  本部のみ(店舗削除時)
//
// token = 署名付きの短い文字列(HMAC-SHA256・30日)。DBに列を増やさずに済み、偽造できない。
//   パスワードのハッシュ方式(SHA-256+固定ソルト)は従来どおりブラウザ側で計算して送る(平文は送らない)。
import crypto from 'crypto';

const SUPA_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SAFE_COLS = 'id,store_id,username,role,last_name,first_name,display_name,email,phone,is_active,last_login,created_at,deleted_at';

const hdrs = () => ({ apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json' });
const b64u = (s) => Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
const sign = (payload) => crypto.createHmac('sha256', 'tsumugi-staff-token|' + SERVICE_KEY).update(payload).digest('hex');

function makeToken(staff) {
  const payload = b64u(JSON.stringify({ sid: staff.id, role: staff.role, store_id: staff.store_id || null, exp: Date.now() + TOKEN_TTL_MS }));
  return payload + '.' + sign(payload);
}
function readToken(token) {
  try {
    const [payload, sig] = String(token || '').split('.');
    if (!payload || !sig) return null;
    const expect = sign(payload);
    if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
    const t = JSON.parse(unb64u(payload));
    if (!t || !t.sid || !t.exp || Date.now() > Number(t.exp)) return null;
    return t;
  } catch { return null; }
}
const strip = (row) => { if (!row) return row; const { password_hash, ...rest } = row; return rest; };

async function sb(path, init) {
  const r = await fetch(`${SUPA_URL}/rest/v1/${path}`, { ...(init || {}), headers: { ...hdrs(), ...((init && init.headers) || {}) } });
  const text = await r.text().catch(() => '');
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (!r.ok) { const e = new Error((json && (json.message || json.error)) || `HTTP ${r.status}`); e.status = r.status; throw e; }
  return json;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!SUPA_URL || !SERVICE_KEY) return res.status(500).json({ error: 'サーバー設定エラー: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const action = String(body.action || '');

  try {
    if (action === 'login') {
      const username = String(body.username || '').trim();
      const hash = String(body.password_hash || '').trim();
      if (!username || !/^[0-9a-f]{64}$/.test(hash)) return res.status(400).json({ error: 'IDまたはパスワードが違います' });
      const rows = await sb(`staff?select=*,stores(id,name,short_name)&username=eq.${encodeURIComponent(username)}&password_hash=eq.${encodeURIComponent(hash)}&is_active=eq.true&deleted_at=is.null&limit=1`);
      const staff = Array.isArray(rows) ? rows[0] : null;
      if (!staff) return res.status(401).json({ error: 'IDまたはパスワードが違います' });
      try { await sb(`staff?id=eq.${encodeURIComponent(staff.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ last_login: new Date().toISOString() }) }); } catch {}
      return res.status(200).json({ staff: strip(staff), token: makeToken(staff) });
    }

    // 以降は token 必須
    const t = readToken(body.token);
    if (!t) return res.status(401).json({ error: 'ログインの有効期限が切れています。もう一度ログインしてください。', expired: true });
    const isHq = t.role === 'super_admin';

    if (action === 'list') {
      const storeId = String(body.store_id || '');
      let q = `staff?select=${SAFE_COLS}&deleted_at=is.null&order=created_at`;
      if (isHq) { if (storeId) q += `&store_id=eq.${encodeURIComponent(storeId)}`; }
      else if (t.role === 'manager' && t.store_id) q += `&store_id=eq.${encodeURIComponent(t.store_id)}`;
      else return res.status(403).json({ error: '権限がありません' });
      const rows = await sb(q);
      return res.status(200).json({ staff: Array.isArray(rows) ? rows : [] });
    }

    if (action === 'create') {
      const store_id = String(body.store_id || '').trim();
      const username = String(body.username || '').trim();
      const password_hash = String(body.password_hash || '').trim();
      const role = String(body.role || 'manager');
      if (!isHq && !(t.role === 'manager' && t.store_id && t.store_id === store_id)) return res.status(403).json({ error: '権限がありません' });
      if (!isHq && role === 'super_admin') return res.status(403).json({ error: '本部アカウントは本部だけが作成できます' });
      if (!username || username.length < 4) return res.status(400).json({ error: 'ログインIDは4文字以上必要です' });
      if (!/^[0-9a-f]{64}$/.test(password_hash)) return res.status(400).json({ error: 'パスワードが不正です' });
      const dup = await sb(`staff?select=id&username=eq.${encodeURIComponent(username)}&limit=1`);
      if (Array.isArray(dup) && dup.length) return res.status(409).json({ error: 'このログインIDは既に使用されています' });
      const ins = await sb(`staff?select=${SAFE_COLS}`, { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
        store_id: store_id || null, username, password_hash, role,
        last_name: String(body.last_name || ''), first_name: String(body.first_name || ''), email: String(body.email || ''), phone: String(body.phone || ''),
      }) });
      return res.status(200).json({ staff: strip(Array.isArray(ins) ? ins[0] : ins) });
    }

    if (action === 'change_password') {
      const staffId = String(body.staff_id || '');
      const password_hash = String(body.password_hash || '').trim();
      if (!staffId || !/^[0-9a-f]{64}$/.test(password_hash)) return res.status(400).json({ error: '入力が不正です' });
      if (!isHq && t.sid !== staffId) return res.status(403).json({ error: '自分のパスワードだけ変更できます' });
      await sb(`staff?id=eq.${encodeURIComponent(staffId)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ password_hash }) });
      return res.status(200).json({ ok: true });
    }

    if (action === 'delete_store_staff') {
      const store_id = String(body.store_id || '').trim();
      if (!isHq) return res.status(403).json({ error: '権限がありません' });
      if (!store_id) return res.status(400).json({ error: 'store_id は必須です' });
      const del = await sb(`staff?store_id=eq.${encodeURIComponent(store_id)}&select=id`, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
      return res.status(200).json({ ok: true, deleted: Array.isArray(del) ? del.length : 0 });
    }

    return res.status(400).json({ error: '不明な action です' });
  } catch (e) {
    return res.status(500).json({ error: '処理に失敗しました', detail: String((e && e.message) || e).slice(0, 200) });
  }
}
