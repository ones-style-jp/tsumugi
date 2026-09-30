// Vercel Serverless Function: ご家族・ケアマネの招待コード(family_invites)をサーバー側で扱う (2026-09-30 試験版)
//
// ★ なぜ必要か(招待コードの総当たり対策)
//   招待コードは数字8桁(1234-5678)。これまでブラウザが公開キーで family_invites を直接検索していたため、
//   ①端末ごとの失敗ロック(localStorage)は別の端末・別のブラウザで回避でき、②コードを次々に試すことを止められなかった。
//   さらに、登録時に招待が見つからないと「URLの中身(トークン)から招待を作り直す」処理があり、
//   トークンを偽造すれば任意の利用者の招待を作れてしまった。
//   このエンドポイントでは、コードの照合と登録をサーバーで行い、回線(IP)ごと・全体の失敗回数で止める。
//   招待の作成・一覧・削除も職員のログイン(署名トークン)か、ご家族のアカウントで確認してから行う。
//   → 全店にこの版が行き渡ったら docs/sql/family_invites_rls.sql で family_invites をブラウザから見えなくする。
//
// 環境変数: SUPABASE_URL(または VITE_SUPABASE_URL) / SUPABASE_SERVICE_ROLE_KEY
//
// POST /api/family-invite  { action, ... }
//   lookup        { code }                                         → { invite }              (回数制限あり)
//   signup        { code, username, password_hash, email, relation, display_name, kind, role, facility_name, patient_name }
//                                                                  → { account, invite }     (回数制限あり)
//   create        { token | fam_id, invite:{ patient_id, store_id, code, email, relation, facility_name, patient_name, facility_phone, expires_at } }
//   list_patient  { token, patient_id, store_id }                  → { invites }
//   list_cm_store { token, store_id }                              → { invites }
//   delete        { token | fam_id, by:'id'|'code'|'used_by'|'patient'|'store', id?, code?, used_by?, patient_id?, store_id? } → { ok, deleted }
//
// 失敗回数の記録: app_secrets(RLSで閉じたサーバー専用テーブル)の1行 'guard_family_invite' に JSON で保存する
//   (回線のIPはそのまま保存せず、鍵付きハッシュの先頭16文字だけ)。テーブルが使えない時はサーバーのメモリで代用。
import crypto from 'crypto';

const SUPA_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ---- 回数制限の設定 ----
const GUARD_KEY = 'guard_family_invite';
const MIN = 60 * 1000;
const SHORT_WIN = 15 * MIN, SHORT_MAX_FAIL = 5, SHORT_LOCK = 15 * MIN;        // 同じ回線: 15分に5回失敗 → 15分停止
const DAY_WIN = 24 * 60 * MIN, DAY_MAX_FAIL = 20, DAY_LOCK = 24 * 60 * MIN;   // 同じ回線: 24時間に20回失敗 → 24時間停止
const ATTEMPT_MAX = 30;                                                        // 同じ回線: 15分に30回まで(成功を含む)
const GLOBAL_WIN = 60 * MIN, GLOBAL_MAX_FAIL = 150;                            // 全体: 1時間に150回失敗 → 全員いったん停止
const FAIL_DELAY_MS = 400;

const hdrs = () => ({ apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json' });
const unb64u = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
const staffSign = (payload) => crypto.createHmac('sha256', 'tsumugi-staff-token|' + SERVICE_KEY).update(payload).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const enc = encodeURIComponent;

// 職員トークン(api/staff-auth.js と同じ署名方式)
function readStaffToken(token) {
  try {
    const [payload, sig] = String(token || '').split('.');
    if (!payload || !sig) return null;
    const expect = staffSign(payload);
    if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
    const t = JSON.parse(unb64u(payload));
    if (!t || !t.sid || !t.exp || Date.now() > Number(t.exp)) return null;
    return t;
  } catch { return null; }
}

async function sb(path, init) {
  const r = await fetch(`${SUPA_URL}/rest/v1/${path}`, { ...(init || {}), headers: { ...hdrs(), ...((init && init.headers) || {}) } });
  const text = await r.text().catch(() => '');
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (!r.ok) { const e = new Error((json && (json.message || json.error)) || `HTTP ${r.status}`); e.status = r.status; e.code = json && json.code; throw e; }
  return json;
}

// ---------------------------------------------------------------------------
// 回数制限(回線ごと・全体)
//   state = { ip: { <hash>: { p:[試行中の印], f:[失敗の印], u:停止解除時刻 } }, g:[全体の失敗の印] }
//   印 = 時刻(ms)*1000 + 乱数(0-999)。時刻は Math.floor(印/1000)。
//   試行は「開始時に試行中として予約 → 結果が出たら失敗/成功に確定」する。予約は app_secrets の
//   updated_at を条件にした書き込み(楽観ロック)で行うため、同時に大量に送られても予約済みの件数で止まる。
// ---------------------------------------------------------------------------
let memGuard = { state: { ip: {}, g: [] }, at: null };
const stampTime = (s) => Math.floor(Number(s) / 1000);

function prune(state, now) {
  const st = state && typeof state === 'object' ? state : {};
  const ip = st.ip && typeof st.ip === 'object' ? st.ip : {};
  const out = { ip: {}, g: (Array.isArray(st.g) ? st.g : []).filter((s) => stampTime(s) > now - GLOBAL_WIN).slice(-1000) };
  const keys = Object.keys(ip);
  for (const k of keys) {
    const e = ip[k] || {};
    const p = (Array.isArray(e.p) ? e.p : []).filter((s) => stampTime(s) > now - SHORT_WIN);
    const f = (Array.isArray(e.f) ? e.f : []).filter((s) => stampTime(s) > now - DAY_WIN).slice(-60);
    const u = Number(e.u || 0) > now ? Number(e.u) : 0;
    const a = (Array.isArray(e.a) ? e.a : []).filter((s) => stampTime(s) > now - SHORT_WIN).slice(-60);
    if (p.length || f.length || u || a.length) out.ip[k] = { p, f, u, a };
  }
  // 回線が非常に多い時は古いものから捨てる(行が大きくなりすぎないように)
  const ks = Object.keys(out.ip);
  if (ks.length > 3000) {
    const last = (e) => Math.max(0, ...[...e.p, ...e.f, ...e.a].map(stampTime));
    ks.sort((x, y) => last(out.ip[x]) - last(out.ip[y])).slice(0, ks.length - 3000).forEach((k) => { delete out.ip[k]; });
  }
  return out;
}

async function readGuard() {
  try {
    const rows = await sb(`app_secrets?select=value,updated_at&key=eq.${enc(GUARD_KEY)}&limit=1`);
    const row = Array.isArray(rows) ? rows[0] : null;
    let state = { ip: {}, g: [] };
    if (row && row.value) { try { state = JSON.parse(row.value); } catch { state = { ip: {}, g: [] }; } }
    return { persisted: true, exists: !!row, updatedAt: row ? row.updated_at : null, state };
  } catch {
    return { persisted: false, exists: false, updatedAt: null, state: memGuard.state };
  }
}

async function writeGuard(g, state) {
  if (!g.persisted) { memGuard = { state, at: Date.now() }; return true; }
  const value = JSON.stringify(state);
  const updated_at = new Date().toISOString();
  try {
    if (!g.exists) {
      await sb('app_secrets', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ key: GUARD_KEY, value, updated_at, updated_by: 'family-invite' }) });
      return true;
    }
    const rows = await sb(`app_secrets?key=eq.${enc(GUARD_KEY)}&updated_at=eq.${enc(g.updatedAt)}&select=key`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ value, updated_at }),
    });
    return Array.isArray(rows) && rows.length === 1;
  } catch (e) {
    if (e && (e.status === 409 || e.code === '23505')) return false; // 同時に最初の行を作った → 読み直し
    memGuard = { state, at: Date.now() };
    return true;
  }
}

function clientIpKey(req) {
  const xf = String((req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])) || '').split(',')[0].trim();
  const ip = xf || (req.socket && req.socket.remoteAddress) || 'unknown';
  return crypto.createHmac('sha256', 'tsumugi-invite-guard|' + SERVICE_KEY).update(ip).digest('hex').slice(0, 16);
}

// 試行の開始: 止まっていれば { blocked }、通れば { stamp }
async function beginAttempt(ipKey) {
  for (let i = 0; i < 5; i++) {
    const g = await readGuard();
    const now = Date.now();
    const state = prune(g.state, now);
    const e = state.ip[ipKey] || { p: [], f: [], u: 0, a: [] };
    if (e.u > now) return { blocked: 'ip', min: Math.ceil((e.u - now) / MIN) };
    if (state.g.length >= GLOBAL_MAX_FAIL) return { blocked: 'global', min: 15 };
    const shortFails = e.f.filter((s) => stampTime(s) > now - SHORT_WIN).length;
    if (shortFails + e.p.length >= SHORT_MAX_FAIL) return { blocked: 'ip', min: 15 };
    if (e.a.length + e.p.length >= ATTEMPT_MAX) return { blocked: 'ip', min: 15 };
    const stamp = now * 1000 + Math.floor(Math.random() * 1000);
    e.p.push(stamp);
    state.ip[ipKey] = e;
    if (await writeGuard(g, state)) return { stamp };
    await sleep(40 + Math.floor(Math.random() * 80));
  }
  return { blocked: 'busy', min: 1 };
}

// 試行の確定: ok=false なら失敗として数え、しきい値を超えたら停止時刻を入れる
async function finishAttempt(ipKey, stamp, ok) {
  for (let i = 0; i < 5; i++) {
    const g = await readGuard();
    const now = Date.now();
    const state = prune(g.state, now);
    const e = state.ip[ipKey] || { p: [], f: [], u: 0, a: [] };
    e.p = e.p.filter((s) => s !== stamp);
    e.a.push(stamp);
    if (!ok) {
      e.f.push(stamp);
      state.g.push(stamp);
      const shortFails = e.f.filter((s) => stampTime(s) > now - SHORT_WIN).length;
      if (e.f.length >= DAY_MAX_FAIL) e.u = Math.max(e.u || 0, now + DAY_LOCK);
      else if (shortFails >= SHORT_MAX_FAIL) e.u = Math.max(e.u || 0, now + SHORT_LOCK);
    }
    state.ip[ipKey] = e;
    if (await writeGuard(g, state)) return;
    await sleep(40 + Math.floor(Math.random() * 80));
  }
  // 書けなかった場合: 試行中の印が残り、15分間は失敗と同じ扱いになる(安全側)
}

const blockedMessage = (b) => b.blocked === 'global'
  ? 'ただいま招待コードの確認を一時停止しています。しばらく(15分ほど)してからもう一度お試しください。'
  : b.blocked === 'busy'
    ? '混み合っています。少し待ってからもう一度お試しください。'
    : `入力の失敗が続いたため、あと約${b.min}分お待ちください。`;

// ご家族側に返す招待の項目(id・利用者ID・店舗IDは登録画面の流れで必要)
const pickInvite = (r) => r && ({
  id: r.id, code: r.code, patient_id: r.patient_id, store_id: r.store_id || null, email: r.email || '', relation: r.relation || '',
  facility_name: r.facility_name || '', facility_phone: r.facility_phone || '', patient_name: r.patient_name || '',
  expires_at: r.expires_at || null, used_by: r.used_by || null, used_at: r.used_at || null, created_at: r.created_at || null,
});
const stripAccount = (a) => { if (!a) return a; const { password_hash, ...rest } = a; return rest; };
const normCode = (c) => String(c || '').trim().toUpperCase();
const validCode = (c) => /^[0-9]{4}-[0-9]{4}$/.test(c) || /^[A-Z0-9]{2,5}(-[A-Z0-9]{2,6}){1,3}$/.test(c);

// ---------------------------------------------------------------------------
// 認証(職員トークン または ご家族アカウント)
// ---------------------------------------------------------------------------
async function resolveAuth(body) {
  const t = readStaffToken(body.token);
  if (t) return { staff: t, isHq: t.role === 'super_admin' };
  const famId = String(body.fam_id || '').trim();
  if (famId && /^[0-9a-f-]{36}$/i.test(famId)) {
    const rows = await sb(`family_accounts?select=id,patient_id,store_id,kind,role&id=eq.${enc(famId)}&deleted_at=is.null&limit=1`);
    const acc = Array.isArray(rows) ? rows[0] : null;
    if (acc) return { fam: acc };
  }
  return null;
}
// 招待1件(または店舗・利用者)を扱ってよいか
function canTouch(auth, storeId, patientId) {
  if (!auth) return false;
  if (auth.isHq) return true;
  const sid = storeId == null ? '' : String(storeId);
  if (auth.staff) return !sid || (auth.staff.store_id && String(auth.staff.store_id) === sid); // 店舗IDの無い古い招待は職員なら可
  if (auth.fam) return String(auth.fam.patient_id) === String(patientId || '') && (!sid || !auth.fam.store_id || String(auth.fam.store_id) === sid);
  return false;
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
    // ---- 公開(回数制限あり): コードの照合・登録 ----
    if (action === 'lookup' || action === 'signup') {
      const code = normCode(body.code);
      if (!validCode(code)) return res.status(400).json({ error: '招待コードの形式が正しくありません', reason: 'format' });
      let username = '', password_hash = '';
      if (action === 'signup') {
        username = String(body.username || '').trim();
        password_hash = String(body.password_hash || '').trim();
        if (username.length < 4 || !/^[a-zA-Z0-9_-]+$/.test(username)) return res.status(400).json({ error: 'IDは4文字以上の半角英数字・ハイフン・アンダースコアで入力してください', reason: 'username' });
        if (!/^[0-9a-f]{64}$/.test(password_hash)) return res.status(400).json({ error: 'パスワードが不正です', reason: 'password' });
      }
      const ipKey = clientIpKey(req);
      const b = await beginAttempt(ipKey);
      if (b.blocked) return res.status(429).json({ error: blockedMessage(b), reason: 'locked', lock_min: b.min });
      const rows = await sb(`family_invites?select=*&code=eq.${enc(code)}&limit=1`);
      const inv = Array.isArray(rows) ? rows[0] : null;
      if (!inv) {
        await finishAttempt(ipKey, b.stamp, false); await sleep(FAIL_DELAY_MS);
        return res.status(404).json({ error: '招待コードが見つかりません', reason: 'not_found' });
      }
      if (inv.used_by) {
        await finishAttempt(ipKey, b.stamp, false);
        return res.status(409).json({ error: 'この招待コードは既に使用されています', reason: 'used', facility_phone: inv.facility_phone || '' });
      }
      if (inv.expires_at && new Date(inv.expires_at) < new Date()) {
        await finishAttempt(ipKey, b.stamp, false);
        return res.status(410).json({ error: '招待コードの有効期限が切れています', reason: 'expired', facility_phone: inv.facility_phone || '' });
      }
      await finishAttempt(ipKey, b.stamp, true);
      if (action === 'lookup') return res.status(200).json({ invite: pickInvite(inv) });

      // signup: ID重複(削除済みは除く) → アカウント作成 → 招待を使用済みに(未使用のときだけ・同時登録の取り合い対策)
      const dup = await sb(`family_accounts?select=id&username=eq.${enc(username)}&deleted_at=is.null&limit=1`);
      if (Array.isArray(dup) && dup.length) return res.status(409).json({ error: 'このログインIDは既に使用されています', reason: 'username_taken' });
      const kind = body.kind === 'caremanager' ? 'caremanager' : 'family';
      const role = body.role === 'parent' ? 'parent' : 'member';
      let acc;
      try {
        const ins = await sb('family_accounts?select=*', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
          patient_id: inv.patient_id, store_id: inv.store_id || null,
          username, password_hash, kind, role,
          relation: String(body.relation || inv.relation || ''),
          display_name: String(body.display_name || ''),
          email: String(body.email || ''),
          facility_name: String(body.facility_name || inv.facility_name || ''),
          patient_name: String(body.patient_name || inv.patient_name || ''),
        }) });
        acc = Array.isArray(ins) ? ins[0] : ins;
      } catch (e) {
        if (e && (e.status === 409 || e.code === '23505')) return res.status(409).json({ error: 'このログインIDは既に使用されています', reason: 'username_taken' });
        throw e;
      }
      const used = await sb(`family_invites?id=eq.${enc(inv.id)}&used_by=is.null&select=id`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ used_by: acc.id, used_at: new Date().toISOString() }),
      });
      if (!Array.isArray(used) || used.length !== 1) {
        // 別の端末が先に同じコードで登録した → 作ったアカウントは取り消す
        try { await sb(`family_accounts?id=eq.${enc(acc.id)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); } catch { /* noop */ }
        return res.status(409).json({ error: 'この招待コードは既に使用されています', reason: 'used' });
      }
      return res.status(200).json({ account: stripAccount(acc), invite: pickInvite({ ...inv, used_by: acc.id }) });
    }

    // ---- 以降は職員トークン または ご家族アカウントが必要 ----
    const auth = await resolveAuth(body);
    if (!auth) return res.status(401).json({ error: 'ログインの有効期限が切れています。もう一度ログインしてください。', expired: true });

    if (action === 'create') {
      const i = body.invite || {};
      const code = normCode(i.code);
      const patient_id = String(i.patient_id || '').trim();
      const store_id = i.store_id ? String(i.store_id) : (auth.staff && auth.staff.store_id) || (auth.fam && auth.fam.store_id) || null;
      if (!validCode(code) || !patient_id) return res.status(400).json({ error: '招待の内容が不正です' });
      if (!canTouch(auth, store_id, patient_id)) return res.status(403).json({ error: 'この利用者の招待を発行する権限がありません' });
      // 有効期限はサーバー側でも上限をかける(最長14日)
      const maxExp = Date.now() + 14 * 24 * 60 * MIN;
      let expires_at = i.expires_at ? new Date(i.expires_at) : new Date(Date.now() + 3 * 24 * 60 * MIN);
      if (isNaN(expires_at.getTime()) || expires_at.getTime() > maxExp) expires_at = new Date(maxExp);
      try {
        const ins = await sb('family_invites?select=*', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
          patient_id, store_id, code,
          email: i.email || null, relation: i.relation || null,
          facility_name: i.facility_name || null, patient_name: i.patient_name || null, facility_phone: i.facility_phone || null,
          expires_at: expires_at.toISOString(),
        }) });
        return res.status(200).json({ invite: Array.isArray(ins) ? ins[0] : ins });
      } catch (e) {
        if (e && (e.status === 409 || e.code === '23505')) return res.status(409).json({ error: '同じ招待コードが既にあります', reason: 'duplicate' });
        throw e;
      }
    }

    if (action === 'list_patient') {
      if (!auth.staff) return res.status(403).json({ error: '権限がありません' });
      const patient_id = String(body.patient_id || '');
      const store_id = String(body.store_id || '');
      if (!patient_id || !store_id) return res.status(400).json({ error: 'patient_id と store_id は必須です' });
      if (!canTouch(auth, store_id, patient_id)) return res.status(403).json({ error: '権限がありません' });
      const rows = await sb(`family_invites?select=*&patient_id=eq.${enc(patient_id)}&store_id=eq.${enc(store_id)}`);
      return res.status(200).json({ invites: Array.isArray(rows) ? rows : [] });
    }

    if (action === 'list_cm_store') {
      if (!auth.staff) return res.status(403).json({ error: '権限がありません' });
      const store_id = String(body.store_id || '');
      if (!store_id) return res.status(400).json({ error: 'store_id は必須です' });
      if (!canTouch(auth, store_id, null)) return res.status(403).json({ error: '権限がありません' });
      const rows = await sb(`family_invites?select=id,code,email,relation,created_at,expires_at,used_by,patient_name&store_id=eq.${enc(store_id)}&relation=eq.${enc('ケアマネージャー')}`);
      return res.status(200).json({ invites: Array.isArray(rows) ? rows : [] });
    }

    if (action === 'delete') {
      const by = String(body.by || '');
      let q = '';
      if (by === 'id' && body.id) q = `id=eq.${enc(body.id)}`;
      else if (by === 'code' && body.code) q = `code=eq.${enc(normCode(body.code))}`;
      else if (by === 'used_by' && body.used_by) q = `used_by=eq.${enc(body.used_by)}`;
      else if (by === 'patient' && body.patient_id && body.store_id) q = `patient_id=eq.${enc(body.patient_id)}&store_id=eq.${enc(body.store_id)}`;
      else if (by === 'store' && body.store_id) { if (!auth.isHq) return res.status(403).json({ error: '権限がありません' }); q = `store_id=eq.${enc(body.store_id)}`; }
      else return res.status(400).json({ error: '削除の条件が不正です' });
      // 対象を読み、扱ってよい行だけを id で消す
      const rows = await sb(`family_invites?select=id,patient_id,store_id&${q}`);
      const ids = (Array.isArray(rows) ? rows : []).filter((r) => canTouch(auth, r.store_id, r.patient_id)).map((r) => r.id);
      if (!ids.length) return res.status(200).json({ ok: true, deleted: 0, skipped: (rows || []).length });
      await sb(`family_invites?id=in.(${ids.map(enc).join(',')})`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
      return res.status(200).json({ ok: true, deleted: ids.length, skipped: (rows || []).length - ids.length });
    }

    return res.status(400).json({ error: '不明な action です' });
  } catch (e) {
    return res.status(500).json({ error: '処理に失敗しました', detail: String((e && e.message) || e).slice(0, 200) });
  }
}
