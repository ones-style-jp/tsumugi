// Vercel Serverless Function: 写真・書類(personal-files)の署名付き URL をサーバーで発行する (2026-10-19 データ保護 段階3c)
//
// ★ なぜ必要か
//   personal-files は「公開バケット」で、URL(ランダムな名前)を知っていれば誰でも取れた。段階3c でバケットを非公開にすると、
//   職員の端末は Supabase の証(authenticated)で直接署名 URL を作れるが、ご家族・ケアマネのポータルは証を持たないので
//   サーバーが本人確認をして署名 URL を渡す。アップロードも同様(署名付きアップロード URL)。
//   「そのファイルがその店舗のものか」は、店舗データ本体(app_state)の中に storagePath が出てくるかで確かめる
//   (パスに店舗IDが無い旧形式 pf/<利用者ID>/… のため。利用者IDは店舗ごとの連番で全店一意ではない)。
//
// 環境変数: SUPABASE_URL(または VITE_SUPABASE_URL) / SUPABASE_SERVICE_ROLE_KEY
//
// POST /api/files  { action, store_id, path, token? (職員の証) | ptoken? (ポータルの証) }
//   sign         → { url, expires_in }     読むための署名 URL(15分)。店舗のデータに path が無ければ 403
//   sign_upload  → { path, token }         アップロード用の署名(ブラウザは uploadToSignedUrl で送る)。path は pf/ fs/ news/ 配下だけ
import crypto from 'crypto';

const SUPA_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'personal-files';
const SIGN_TTL = 15 * 60;
const UPLOAD_PREFIX = /^(pf|fs|news|misc)\/[A-Za-z0-9_\-./]+$/;

const hdrs = () => ({ apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json' });
const enc = encodeURIComponent;
const unb64u = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
const sigStaff = (payload) => crypto.createHmac('sha256', 'tsumugi-staff-token|' + SERVICE_KEY).update(payload).digest('hex');
const sigPortal = (payload) => crypto.createHmac('sha256', 'tsumugi-portal-token|' + SERVICE_KEY).update(payload).digest('hex');
function readSigned(token, signer) {
  try {
    const [payload, sig] = String(token || '').split('.');
    if (!payload || !sig) return null;
    const expect = signer(payload);
    if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
    const t = JSON.parse(unb64u(payload));
    if (!t || !t.exp || Date.now() > Number(t.exp)) return null;
    return t;
  } catch { return null; }
}
async function sbJson(url, init) {
  const r = await fetch(url, { ...(init || {}), headers: { ...hdrs(), ...((init && init.headers) || {}) } });
  const text = await r.text().catch(() => '');
  let j = null; try { j = text ? JSON.parse(text) : null; } catch { j = null; }
  if (!r.ok) { const e = new Error((j && (j.message || j.error)) || `supabase ${r.status}`); e.status = r.status; throw e; }
  return j;
}
// 店舗データ本体(文字列)を60秒だけ控える(同じ画面で何枚も署名するため)
const _stateCache = new Map();
async function loadStateText(storeId) {
  const rows = await sbJson(`${SUPA_URL}/rest/v1/app_state?select=data&key=eq.${enc(storeId)}`);
  const text = rows && rows[0] && rows[0].data ? JSON.stringify(rows[0].data) : '';
  _stateCache.set(storeId, { t: Date.now(), text }); return text;
}
async function storeHasPath(storeId, path) {
  const needle = JSON.stringify(path).slice(1, -1);
  const c = _stateCache.get(storeId); const fresh = c && Date.now() - c.t < 60 * 1000;
  let text = fresh ? c.text : await loadStateText(storeId);
  if (text.includes(needle)) return true;
  if (fresh) { text = await loadStateText(storeId); if (text.includes(needle)) return true; } // 控えに無い=直前に追加された可能性 → 読み直して1回だけ確かめる
  return false;
}
// 証の確認: 職員(店舗一致 or 本部)か、ポータル(見てよい店舗)。見てよい利用者IDの一覧も返す(ポータルのアップロード先の確認用)
function authorize(body, storeId) {
  const st = readSigned(body.token, sigStaff);
  if (st && st.sid) { if (st.role === 'super_admin' || (st.store_id && String(st.store_id) === String(storeId))) return { kind: 'staff', pids: null }; return null; }
  const pt = readSigned(body.ptoken, sigPortal);
  if (pt && Array.isArray(pt.links)) { const ls = pt.links.filter(l => l.s && String(l.s) === String(storeId)); if (ls.length) return { kind: 'portal', pids: ls.map(l => String(l.p)) }; }
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!SUPA_URL || !SERVICE_KEY) return res.status(500).json({ error: 'サーバー設定エラー: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です' });
  let body = req.body; if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } } body = body || {};
  const action = String(body.action || ''); const storeId = String(body.store_id || ''); const path = String(body.path || '').replace(/^\/+/, '');
  if (!storeId || !path || path.includes('..')) return res.status(400).json({ error: 'store_id / path が必要です' });
  const who = authorize(body, storeId);
  if (!who) return res.status(401).json({ error: 'ログインの有効期限が切れています。もう一度ログインしてください。', expired: true });
  try {
    if (action === 'sign') {
      if (!(await storeHasPath(storeId, path))) return res.status(403).json({ error: 'このファイルは見られません' });
      const j = await sbJson(`${SUPA_URL}/storage/v1/object/sign/${BUCKET}/${path.split('/').map(enc).join('/')}`, { method: 'POST', body: JSON.stringify({ expiresIn: SIGN_TTL }) });
      const rel = j && (j.signedURL || j.signedUrl); if (!rel) return res.status(500).json({ error: '署名 URL を作れませんでした' });
      return res.status(200).json({ url: `${SUPA_URL}/storage/v1${rel.startsWith('/') ? '' : '/'}${rel}`, expires_in: SIGN_TTL });
    }
    if (action === 'sign_upload') {
      if (!UPLOAD_PREFIX.test(path)) return res.status(400).json({ error: '保存先が不正です' });
      if (who.kind === 'portal') { const m = /^(?:pf|fs)\/([^/]+)\//.exec(path); if (!m || !who.pids.includes(String(m[1]))) return res.status(403).json({ error: 'この利用者のファイルは追加できません' }); }
      const j = await sbJson(`${SUPA_URL}/storage/v1/object/upload/sign/${BUCKET}/${path.split('/').map(enc).join('/')}`, { method: 'POST', body: JSON.stringify({}) });
      const token = j && (j.token || (j.url && /token=([^&]+)/.exec(j.url) && decodeURIComponent(/token=([^&]+)/.exec(j.url)[1])));
      if (!token) return res.status(500).json({ error: 'アップロード用の署名を作れませんでした' });
      return res.status(200).json({ path, token });
    }
    return res.status(400).json({ error: `unknown action: ${action}` });
  } catch (e) {
    return res.status(500).json({ error: (e && e.message) || 'server error' });
  }
}
