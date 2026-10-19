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
//   sb_status            {}                                                 → { configured, ok, reason }  ログイン不要(証の発行状態の確認)
//   login                { username, password_hash }                          → { staff, token }
//   list                 { token, store_id? }                                 → { staff:[...] }   本部=全店 / 店舗管理者=自店
//   create               { token, store_id, username, password_hash, role, last_name, first_name, email, phone } → { staff }
//   change_password      { token, staff_id, password_hash }                   → { ok }           本人 または 本部
//   delete_store_staff   { token, store_id }                                  → { ok, deleted }  本部のみ(店舗削除時)
//   ★ 2026-10-19 段階4(従業員ごとのログイン・docs/sql/staff_accounts_v2.sql 適用後に使える):
//   invite_create        { token, store_id, member_id, name, role, email? }   → { invite:{code, expires_at} }  店舗管理者 or 本部
//   invite_lookup        { code }                                             → { invite:{store_id, store_name, name, role} }  ログイン不要(400ms 遅延)
//   invite_accept        { code, username, password_hash, pin_hash?, device? }→ { staff, token, sb_token... }  本人アカウント作成＋ログイン
//   pin_set              { token, pin_hash }                                  → { ok }           本人(person)だけ
//   pin_verify           { token, member_id, pin_hash, device? }              → { ok, staff }    店舗共通ログイン中に操作者を PIN で切替
//   pin_login            { token, pin_hash, device? }                         → { ok, staff }    PIN だけで本人を特定(店舗内で PIN は重複しないので名前のタップが要らない)
//   pin_unlock           { token, store_id }                                  → { ok }           PIN の停止(15回失敗)を管理者が解除
//   pin_guard_status     { token, store_id }                                  → { hard, minutes } PIN の停止状態
//   members_status       { token, store_id }                                  → { accounts:[{member_id, staff_id, name, is_active, has_pin, last_login, username}], invites:[...] }
//   set_active           { token, staff_id, active }                          → { ok }           退職(false)/復帰(true)。店舗管理者 or 本部
//   logins_list          { token, store_id, limit? }                          → { logins:[...] } 店舗管理者 or 本部
//   login には device(端末名) を添えられる → staff_logins に記録
//   shared_device        { token(本人・管理者), device? }                    → { token, session } 「この端末をみんなで使う」: 店舗共通と同じ働きの証(shared)を発行
//   renew                { token }                                            → { token }        証の延長(30日)。退職・削除なら 401
//   店舗の設定 systemSettings.security.storeLoginDisabled=true なら、店舗共通(kind=store)の login は拒否(従業員ごとのログインへ切替済み)
//   ★ 2026-10-19 本部の2段階認証: super_admin の login は、ID・パスワードが合ったら登録メールへ6桁の確認コードを送り { need_code: true, hint }。
//     login に code を添えて再送すると証を発行。コードは5分有効・3回間違いで無効(2026-10-19 ユーザー指示で厳しく)。本部にメールが無ければ従来どおり
//   ★ 2026-10-19 監視: ログイン失敗が 15分に10回(同じID)続いたら本部(super_admin のメール)へ通知。状態は app_secrets 'guard_login'
//
// token = 署名付きの短い文字列(HMAC-SHA256・30日)。DBに列を増やさずに済み、偽造できない。
//   パスワードのハッシュ方式(SHA-256+固定ソルト)は従来どおりブラウザ側で計算して送る(平文は送らない)。
import crypto from 'crypto';
import { getSecret } from './_secrets.js';

const SUPA_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
// ★ 2026-10-17 データ保護(段階1): Supabase 形式の「証」(JWT)に署名する秘密(Supabase の Project Settings → API → JWT Secret)。
//   未設定なら証は発行せず、アプリは従来どおり公開キーで動く(段階3で RLS をかけるまでは動きは同じ)
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET || '';
const SB_TOKEN_TTL_SEC = 24 * 60 * 60;
// 職員の情報から Supabase の証(HS256 JWT)を作る。claims: role=authenticated(RLS で auth.jwt() が読める)・store_id・staff_role・staff_id
function mintSbToken(staff) {
  if (!JWT_SECRET) return null;
  const now = Math.floor(Date.now() / 1000);
  const header = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64u(JSON.stringify({ aud: 'authenticated', role: 'authenticated', iss: 'tsumugi', sub: `staff:${staff.id}`, iat: now, exp: now + SB_TOKEN_TTL_SEC,
    store_id: staff.store_id ? String(staff.store_id) : null, staff_role: String(staff.role || ''), staff_id: String(staff.id) }));
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(header + '.' + payload).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${header}.${payload}.${sig}`;
}
// 発行した証を Supabase が受け付けるか確かめる(秘密の貼り間違いで全端末が読めなくなるのを防ぐ)。受け付けないときは証を渡さない(従来どおり公開キーで動く)
let _mintCheck = { at: 0, ok: null };
async function mintSbTokenChecked(staff) {
  const tok = mintSbToken(staff); if (!tok) return { tok: null, ok: false, reason: 'no_secret' };
  if (_mintCheck.ok === true && Date.now() - _mintCheck.at < 10 * 60 * 1000) return { tok, ok: true };
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/stores?select=id&limit=1`, { headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + tok } });
    if (r.status === 401) { _mintCheck = { at: Date.now(), ok: false }; return { tok: null, ok: false, reason: 'bad_secret' }; }
    _mintCheck = { at: Date.now(), ok: true }; return { tok, ok: true };
  } catch { return { tok: null, ok: false, reason: 'check_failed' }; }
}
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const FAIL_DELAY = 400;
const SAFE_COLS = 'id,store_id,username,role,last_name,first_name,display_name,email,phone,is_active,last_login,created_at,deleted_at';

const hdrs = () => ({ apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json' });
const b64u = (s) => Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
const sign = (payload) => crypto.createHmac('sha256', 'tsumugi-staff-token|' + SERVICE_KEY).update(payload).digest('hex');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// ★ 段階4: PIN の総当たり対策(店舗ごと・段階的)。失敗5回→15分停止、さらに5回→60分、さらに5回(計15回)→管理者が解除するまで停止＋店舗/管理者へメール。
//   状態は app_secrets の1行 'guard_pin'(サーバー専用)に JSON で保存(サーバーの実行単位をまたいでも効く)
const PIN_GUARD_KEY = 'guard_pin';
async function pinGuardLoad() { try { const rows = await sb(`app_secrets?select=value&key=eq.${encodeURIComponent(PIN_GUARD_KEY)}&limit=1`); const v = rows && rows[0] && rows[0].value; const j = v ? JSON.parse(v) : {}; return (j && typeof j === 'object') ? j : {}; } catch { return {}; } }
async function pinGuardSave(g) {
  const value = JSON.stringify(g), updated_at = new Date().toISOString();
  try { const r = await sb(`app_secrets?key=eq.${encodeURIComponent(PIN_GUARD_KEY)}&select=key`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ value, updated_at, updated_by: 'staff-auth' }) }); if (Array.isArray(r) && r.length) return; } catch {}
  try { await sb('app_secrets', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ key: PIN_GUARD_KEY, value, updated_at, updated_by: 'staff-auth' }) }); } catch {}
}
// 返り値: 0=使える / 分=あと何分停止 / -1=管理者の解除待ち
async function pinGuardCheck(sid) { const g = (await pinGuardLoad())[sid]; if (!g) return 0; if (g.hard) return -1; if (g.lockUntil && Date.now() < g.lockUntil) return Math.ceil((g.lockUntil - Date.now()) / 60000); return 0; }
async function pinGuardFail(sid) {
  const all = await pinGuardLoad(); const now = Date.now(); const g = all[sid] || { fails: [], locks: 0 };
  g.fails = (g.fails || []).filter(t => now - t < 15 * 60 * 1000); g.fails.push(now);
  let locked = null;
  if (g.fails.length >= 5) { g.locks = (g.locks || 0) + 1; g.fails = []; if (g.locks >= 3) { g.hard = true; g.hardAt = now; locked = 'hard'; } else { g.lockUntil = now + (g.locks === 1 ? 15 : 60) * 60 * 1000; locked = g.locks; } }
  all[sid] = g; await pinGuardSave(all);
  if (locked === 'hard') { try { await notifyPinHardLock(sid); } catch {} }
  return locked;
}
async function pinGuardOk(sid) { const all = await pinGuardLoad(); if (all[sid] && !all[sid].hard) { delete all[sid]; await pinGuardSave(all); } }
async function pinGuardUnlock(sid) { const all = await pinGuardLoad(); delete all[sid]; await pinGuardSave(all); }
// メール送信(Brevo)。送れなくても処理は止めない
async function sendMail(to, subject, html) {
  const apiKey = await getSecret('BREVO_API_KEY', 'brevo_api_key'); if (!apiKey) return false;
  const senderEmail = (await getSecret('BREVO_SENDER_EMAIL', 'brevo_sender_email')) || 'noreply@ones-style.co.jp';
  const list = [...new Set((to || []).filter(e => e && /@/.test(e)))].map(email => ({ email })); if (!list.length) return false;
  const r = await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json', 'api-key': apiKey }, body: JSON.stringify({ sender: { email: senderEmail, name: 'つむぎ' }, to: list, subject: String(subject).slice(0, 100), htmlContent: html }) });
  return r.ok;
}
async function hqEmails() { try { const rows = await sb(`staff?select=email&role=eq.super_admin&is_active=eq.true&deleted_at=is.null`); return (rows || []).map(r => r.email).filter(e => e && /@/.test(e)); } catch { return []; } }
// 汎用の控え(app_secrets の1行・JSON)
async function kvLoad(key) { try { const rows = await sb(`app_secrets?select=value&key=eq.${encodeURIComponent(key)}&limit=1`); const v = rows && rows[0] && rows[0].value; const j = v ? JSON.parse(v) : {}; return (j && typeof j === 'object') ? j : {}; } catch { return {}; } }
async function kvSave(key, g) {
  const value = JSON.stringify(g), updated_at = new Date().toISOString();
  try { const r = await sb(`app_secrets?key=eq.${encodeURIComponent(key)}&select=key`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ value, updated_at, updated_by: 'staff-auth' }) }); if (Array.isArray(r) && r.length) return; } catch {}
  try { await sb('app_secrets', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ key, value, updated_at, updated_by: 'staff-auth' }) }); } catch {}
}
// ★ 監視: ログイン失敗の記録(ID ごと・15分に10回で本部へ通知・通知は1時間に1回まで)
async function loginFailNote(username) {
  const g = await kvLoad('guard_login'); const now = Date.now(); const u = g[username] || { fails: [] };
  u.fails = (u.fails || []).filter(t => now - t < 15 * 60 * 1000); u.fails.push(now);
  let notify = false; if (u.fails.length >= 10 && (!u.notifiedAt || now - u.notifiedAt > 60 * 60 * 1000)) { u.notifiedAt = now; notify = true; }
  g[username] = u; Object.keys(g).forEach(k => { if (g[k] && (!g[k].fails || !g[k].fails.length) && (!g[k].notifiedAt || now - g[k].notifiedAt > 24 * 3600 * 1000)) delete g[k]; });
  await kvSave('guard_login', g);
  if (notify) { try { await sendMail(await hqEmails(), `【つむぎ】ログインの失敗が続いています（ID: ${String(username).slice(0, 40)}）`, `<p>ログインID「${String(username).slice(0, 40)}」で、パスワードの間違いが 15 分に 10 回以上続いています。</p><p>総当たり攻撃の可能性があります。心当たりが無い場合は、そのIDのパスワード変更をご検討ください。</p><p>— つむぎ(自動送信)</p>`); } catch {} }
}
// ★ 本部の2段階認証: 6桁コードをメールへ(5分・3回まで)
async function hqCodeIssue(staff) {
  if (!staff.email || !/@/.test(staff.email)) return { skipped: true };
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const g = await kvLoad('guard_hq2fa'); g[staff.id] = { hash: crypto.createHash('sha256').update(code + '|' + SERVICE_KEY).digest('hex'), exp: Date.now() + 5 * 60 * 1000, tries: 0 }; await kvSave('guard_hq2fa', g);
  const ok = await sendMail([staff.email], '【つむぎ】管理局ログインの確認コード', `<p>つむぎ管理局のログインの確認コードです。</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p><p>5分間有効です（間違いは3回まで）。心当たりが無い場合は、このメールを無視し、パスワードの変更をご検討ください。</p><p>— つむぎ(自動送信)</p>`);
  return { ok, hint: staff.email.replace(/^(.{2}).*(@.*)$/, '$1***$2') };
}
async function hqCodeVerify(staff, code) {
  const g = await kvLoad('guard_hq2fa'); const e = g[staff.id]; if (!e) return false;
  if (Date.now() > e.exp || (e.tries || 0) >= 3) { delete g[staff.id]; await kvSave('guard_hq2fa', g); return false; }
  const ok = crypto.createHash('sha256').update(String(code).replace(/[^0-9]/g, '') + '|' + SERVICE_KEY).digest('hex') === e.hash;
  if (ok) delete g[staff.id]; else e.tries = (e.tries || 0) + 1;
  await kvSave('guard_hq2fa', g); return ok;
}
// 停止(管理者解除待ち)になったら店舗のメールと管理者(本人アカウント)のメールへ知らせる。送れなくても処理は止めない
async function notifyPinHardLock(sid) {
  const apiKey = await getSecret('BREVO_API_KEY', 'brevo_api_key'); if (!apiKey) return;
  const senderEmail = (await getSecret('BREVO_SENDER_EMAIL', 'brevo_sender_email')) || 'noreply@ones-style.co.jp';
  const st = await sb(`stores?select=name,email&id=eq.${encodeURIComponent(sid)}&limit=1`); const store = (st && st[0]) || {};
  const mgrs = await sb(`staff?select=email,display_name&store_id=eq.${encodeURIComponent(sid)}&role=eq.manager&is_active=eq.true&deleted_at=is.null`);
  const to = [...new Set([store.email, ...(mgrs || []).map(m => m.email)].filter(e => e && /@/.test(e)))].map(email => ({ email }));
  if (!to.length) return;
  const name = store.name || '店舗';
  const html = `<p>${name} の「どなたですか」(PIN)で、PIN の間違いが 15 回続いたため、PIN の入力を止めました。</p><p>心当たりが無い場合は、端末が第三者の手に渡っていないかをご確認ください。</p><p>解除は、管理者が つむぎ の「各種設定 → システム → ログインとロックの設定」の「PIN の停止を解除」から行えます。</p><p>— つむぎ(自動送信)</p>`;
  await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json', 'api-key': apiKey }, body: JSON.stringify({ sender: { email: senderEmail, name: 'つむぎ' }, to, subject: `【つむぎ】${name}: PIN の間違いが続いたため停止しました`, htmlContent: html }) });
}
// ★ 段階4: 店舗のログイン設定(各種設定→システム・systemSettings.security)。読めなければ既定
async function storeSecurity(storeId) {
  try { const rows = await sb(`app_state?select=sec:data->systemSettings->security&key=eq.${encodeURIComponent(storeId)}&limit=1`); const sec = rows && rows[0] && rows[0].sec; return (sec && typeof sec === 'object') ? sec : {}; } catch { return {}; }
}
// ★ 2026-10-19 段階4: ログイン記録(staff_logins が無い間は黙って何もしない)
async function logLogin(staff, kind, device) {
  try { await sb('staff_logins', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ store_id: staff.store_id || null, staff_id: staff.id, member_id: staff.member_id || null, name: staff.display_name || `${staff.last_name || ''} ${staff.first_name || ''}`.trim(), kind, device: String(device || '').slice(0, 60) || null }) }); } catch {}
}
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
const strip = (row) => { if (!row) return row; const { password_hash, pin_hash, ...rest } = row; return { ...rest, has_pin: !!pin_hash }; };

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
    // ★ 2026-10-17 データ保護(段階1): 証の発行状態の確認(ログイン不要・本部が Vercel に秘密を入れた後の確認用)。
    //   返すのは「秘密が設定されているか」「その秘密で作った証を Supabase が受け付けるか」だけ。証そのものや秘密は返さない
    if (action === 'sb_status') {
      const mc = await mintSbTokenChecked({ id: 'probe', role: '', store_id: null });
      return res.status(200).json({ configured: !!JWT_SECRET, ok: !!mc.ok, reason: mc.ok ? undefined : mc.reason });
    }
    if (action === 'login') {
      const username = String(body.username || '').trim();
      const hash = String(body.password_hash || '').trim();
      if (!username || !/^[0-9a-f]{64}$/.test(hash)) return res.status(400).json({ error: 'IDまたはパスワードが違います' });
      const rows = await sb(`staff?select=*,stores(id,name,short_name)&username=eq.${encodeURIComponent(username)}&password_hash=eq.${encodeURIComponent(hash)}&is_active=eq.true&deleted_at=is.null&limit=1`);
      const staff = Array.isArray(rows) ? rows[0] : null;
      if (!staff) { await loginFailNote(username); await sleep(FAIL_DELAY); return res.status(401).json({ error: 'IDまたはパスワードが違います' }); }
      // ★ 2026-10-19 本部の2段階認証(super_admin): メールの確認コード
      if (staff.role === 'super_admin') {
        const code = String(body.code || '').replace(/[^0-9]/g, '');
        if (!code) {
          const r2 = await hqCodeIssue(staff);
          if (!r2.skipped) return res.status(200).json({ need_code: true, hint: r2.hint, sent: !!r2.ok });
          // 本部にメールが無い → 従来どおり通す(警告)
        } else if (!(await hqCodeVerify(staff, code))) { await sleep(FAIL_DELAY); return res.status(401).json({ error: '確認コードが違うか、期限が切れています。もう一度ログインしてコードを受け取ってください', code_invalid: true }); }
      }
      // ★ 段階4: 店舗の設定で「店舗IDでのログインを止める」が入っていれば、店舗共通ログインは拒否(本人のログインへ)
      if ((staff.kind || 'store') === 'store' && staff.role !== 'super_admin' && staff.store_id && (await storeSecurity(staff.store_id)).storeLoginDisabled) {
        return res.status(403).json({ error: 'この店舗は「従業員ごとのログイン」に切り替わりました。ご自身のログインIDとパスワードでログインしてください。', store_login_disabled: true });
      }
      try { await sb(`staff?id=eq.${encodeURIComponent(staff.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ last_login: new Date().toISOString() }) }); } catch {}
      const mc = await mintSbTokenChecked(staff);
      await logLogin(staff, staff.kind === 'person' ? 'person' : 'store', body.device); // ★ 段階4: ログイン記録(表が無ければ何もしない)
      return res.status(200).json({ staff: strip(staff), token: makeToken(staff), sb_token: mc.tok, sb_exp: mc.tok ? Date.now() + SB_TOKEN_TTL_SEC * 1000 : null, sb_reason: mc.ok ? undefined : mc.reason });
    }
    // ★ 2026-10-19 段階4: 招待コードの確認と本人アカウントの作成(ログイン不要)
    if (action === 'invite_lookup' || action === 'invite_accept') {
      await sleep(400); // 総当たり対策(8桁)
      const code = String(body.code || '').replace(/[^0-9]/g, '');
      if (code.length !== 8) return res.status(400).json({ error: '招待コードが違います' });
      const fmt = code.slice(0, 4) + '-' + code.slice(4);
      let invs; try { invs = await sb(`staff_invites?select=*&code=eq.${encodeURIComponent(fmt)}&limit=1`); } catch (e) { return res.status(503).json({ error: '従業員ごとのログインはまだ有効になっていません(本部が docs/sql/staff_accounts_v2.sql を実行してください)', not_ready: true }); }
      const inv = Array.isArray(invs) ? invs[0] : null;
      if (!inv) return res.status(404).json({ error: '招待コードが見つかりません' });
      if (inv.used_by) return res.status(409).json({ error: 'この招待コードは使用済みです' });
      if (inv.expires_at && new Date(inv.expires_at) < new Date()) return res.status(410).json({ error: '招待コードの有効期限が切れています(店舗の管理者に発行し直してもらってください)' });
      let storeName = ''; try { const st = await sb(`stores?select=name,short_name&id=eq.${encodeURIComponent(inv.store_id)}&limit=1`); storeName = (st && st[0] && (st[0].name || st[0].short_name)) || ''; } catch {}
      if (action === 'invite_lookup') return res.status(200).json({ invite: { store_id: inv.store_id, store_name: storeName, name: inv.name || '', role: inv.role || 'member', member_id: inv.member_id || null } });
      const username = String(body.username || '').trim(); const hash = String(body.password_hash || '').trim(); const pin = String(body.pin_hash || '').trim();
      if (!/^[A-Za-z0-9_.@\-]{4,64}$/.test(username)) return res.status(400).json({ error: 'ログインIDは4文字以上の半角英数字(. _ @ -)で入力してください' });
      if (!/^[0-9a-f]{64}$/.test(hash)) return res.status(400).json({ error: 'パスワードが不正です' });
      if (pin && !/^[0-9a-f]{64}$/.test(pin)) return res.status(400).json({ error: 'PIN が不正です' });
      const dup = await sb(`staff?select=id&username=eq.${encodeURIComponent(username)}&deleted_at=is.null&limit=1`);
      if (Array.isArray(dup) && dup.length) return res.status(409).json({ error: 'このログインIDは既に使われています' });
      if (pin) { const pd = await sb(`staff?select=id&store_id=eq.${encodeURIComponent(inv.store_id)}&pin_hash=eq.${encodeURIComponent(pin)}&is_active=eq.true&deleted_at=is.null&limit=1`); if (Array.isArray(pd) && pd.length) return res.status(409).json({ error: 'この PIN は同じ店舗で既に使われています。別の番号にしてください' }); }
      const nm = String(inv.name || '').trim(); const sp = nm.split(/[\s\u3000]+/);
      const rec = { store_id: inv.store_id, username, password_hash: hash, role: (inv.role === 'manager' ? 'manager' : 'member'), last_name: sp[0] || nm, first_name: sp.slice(1).join(' ') || '', display_name: nm, email: inv.email || null, is_active: true, kind: 'person', member_id: inv.member_id || null, pin_hash: pin || null };
      const created = await sb('staff?select=*,stores(id,name,short_name)', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(rec) });
      const staff = Array.isArray(created) ? created[0] : created;
      try { await sb(`staff_invites?id=eq.${encodeURIComponent(inv.id)}&used_by=is.null`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ used_by: staff.id, used_at: new Date().toISOString() }) }); } catch {}
      const mc = await mintSbTokenChecked(staff);
      await logLogin(staff, 'person', body.device);
      return res.status(200).json({ staff: strip(staff), token: makeToken(staff), sb_token: mc.tok, sb_exp: mc.tok ? Date.now() + SB_TOKEN_TTL_SEC * 1000 : null });
    }

    // 以降は token 必須
    const t = readToken(body.token);
    if (!t) return res.status(401).json({ error: 'ログインの有効期限が切れています。もう一度ログインしてください。', expired: true });
    const isHq = t.role === 'super_admin';

    // ★ 2026-10-17 データ保護(段階1): ログインの証(token)から Supabase の証を発行し直す(起動時・24時間ごと)。秘密が未設定なら null
    if (action === 'sb_token') {
      // ★ 2026-10-19 段階4: 退職(is_active=false)・削除済みならログインの証も失効させる(アプリはログアウトして入り直し)
      try { const cur = await sb(`staff?select=id,is_active,deleted_at&id=eq.${encodeURIComponent(t.sid)}&limit=1`); const row = Array.isArray(cur) ? cur[0] : null; if (row && (row.is_active === false || row.deleted_at)) return res.status(401).json({ error: 'このアカウントは使えなくなりました。管理者にご確認ください。', expired: true }); } catch {}
      const mc = await mintSbTokenChecked({ id: t.sid, role: t.role, store_id: t.store_id });
      return res.status(200).json({ sb_token: mc.tok, sb_exp: mc.tok ? Date.now() + SB_TOKEN_TTL_SEC * 1000 : null, configured: !!JWT_SECRET, reason: mc.ok ? undefined : mc.reason });
    }

    // ★ 2026-10-19 段階4 ----------------------------------------------------------
    const canManageStore = (sid) => isHq || (t.role === 'manager' && t.store_id && String(t.store_id) === String(sid));
    if (action === 'renew') {
      // 証の延長(使っている限り切れない)。退職・削除なら失効
      const cur = await sb(`staff?select=id,role,store_id,is_active,deleted_at,kind,member_id&id=eq.${encodeURIComponent(t.sid)}&limit=1`); const row = Array.isArray(cur) ? cur[0] : null;
      if (!row || row.is_active === false || row.deleted_at) return res.status(401).json({ error: 'このアカウントは使えなくなりました。管理者にご確認ください。', expired: true });
      const payload = b64u(JSON.stringify({ sid: row.id, role: t.role, store_id: t.store_id || row.store_id || null, shared: !!t.shared, exp: Date.now() + TOKEN_TTL_MS }));
      return res.status(200).json({ token: payload + '.' + sign(payload) });
    }
    if (action === 'shared_device') {
      // 「この端末をみんなで使う」: 本人(管理者)のログインから、店舗共通と同じ働きの証を発行する(端末に残す)。誰が設定したかは記録に残る
      const cur = await sb(`staff?select=*,stores(id,name,short_name)&id=eq.${encodeURIComponent(t.sid)}&limit=1`); const me = Array.isArray(cur) ? cur[0] : null;
      if (!me || me.is_active === false || me.deleted_at) return res.status(401).json({ error: 'ログインし直してください', expired: true });
      if (!(me.role === 'manager' || me.role === 'super_admin') || !t.store_id) return res.status(403).json({ error: '管理者の本人ログインからだけ設定できます' });
      const payload = b64u(JSON.stringify({ sid: me.id, role: 'manager', store_id: t.store_id, shared: true, exp: Date.now() + TOKEN_TTL_MS }));
      await logLogin({ ...me, store_id: t.store_id }, 'shared', body.device);
      const st = me.stores || null;
      return res.status(200).json({ token: payload + '.' + sign(payload), session: { staffId: me.id, username: me.username, role: 'manager', storeId: t.store_id, storeName: (st && st.name) || '', storeShortName: (st && st.short_name) || '', displayName: `共有端末（設定: ${me.display_name || me.username}）`, kind: 'store', shared: true, sharedBy: me.display_name || me.username, memberId: null, hasPin: false } });
    }
    if (action === 'invite_create') {
      const sid = String(body.store_id || t.store_id || ''); if (!sid || !canManageStore(sid)) return res.status(403).json({ error: '権限がありません' });
      const name = String(body.name || '').trim(); if (!name) return res.status(400).json({ error: '名前が必要です' });
      const role = body.role === 'manager' ? 'manager' : 'member';
      let code; for (let i = 0; i < 5; i++) { const n = String(crypto.randomInt(0, 100000000)).padStart(8, '0'); code = n.slice(0, 4) + '-' + n.slice(4); try { const ex = await sb(`staff_invites?select=id&code=eq.${encodeURIComponent(code)}&limit=1`); if (!ex.length) break; } catch (e) { return res.status(503).json({ error: '従業員ごとのログインはまだ有効になっていません(本部が docs/sql/staff_accounts_v2.sql を実行してください)', not_ready: true }); } }
      const expires_at = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
      const rec = { store_id: sid, member_id: body.member_id ? String(body.member_id) : null, name, role, email: body.email ? String(body.email).trim() : null, code, created_by: String(t.sid), expires_at };
      // 同じ職員の未使用の招待は消して1つにする
      if (rec.member_id) { try { await sb(`staff_invites?store_id=eq.${encodeURIComponent(sid)}&member_id=eq.${encodeURIComponent(rec.member_id)}&used_by=is.null`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); } catch {} }
      const ins = await sb('staff_invites?select=*', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(rec) });
      const inv = Array.isArray(ins) ? ins[0] : ins;
      return res.status(200).json({ invite: { code: inv.code, expires_at: inv.expires_at, name: inv.name, role: inv.role, member_id: inv.member_id } });
    }
    if (action === 'pin_set') {
      const pin = String(body.pin_hash || '').trim(); if (!/^[0-9a-f]{64}$/.test(pin)) return res.status(400).json({ error: 'PIN が不正です' });
      const me = await sb(`staff?select=id,store_id,kind&id=eq.${encodeURIComponent(t.sid)}&limit=1`); const row = Array.isArray(me) ? me[0] : null;
      if (!row || row.kind !== 'person') return res.status(403).json({ error: '本人アカウントだけ PIN を設定できます' });
      const pd = await sb(`staff?select=id&store_id=eq.${encodeURIComponent(row.store_id)}&pin_hash=eq.${encodeURIComponent(pin)}&is_active=eq.true&deleted_at=is.null&limit=1`);
      if (Array.isArray(pd) && pd.some(x => String(x.id) !== String(row.id))) return res.status(409).json({ error: 'この PIN は同じ店舗で既に使われています。別の番号にしてください' });
      await sb(`staff?id=eq.${encodeURIComponent(row.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ pin_hash: pin }) });
      return res.status(200).json({ ok: true });
    }
    if (action === 'pin_verify') {
      await sleep(300);
      const sid = String(t.store_id || body.store_id || ''); const mid = String(body.member_id || ''); const pin = String(body.pin_hash || '').trim();
      if (!sid || !mid || !/^[0-9a-f]{64}$/.test(pin)) return res.status(400).json({ error: 'PIN が違います' });
      { const lk = await pinGuardCheck(sid); if (lk === -1) return res.status(423).json({ error: 'PIN の間違いが続いたため、管理者が解除するまで PIN は使えません(各種設定 → システム)', hard: true }); if (lk) return res.status(429).json({ error: `PIN の間違いが続いたため、${lk} 分ほど待ってからやり直してください` }); }
      const rows = await sb(`staff?select=${SAFE_COLS},member_id,kind&store_id=eq.${encodeURIComponent(sid)}&member_id=eq.${encodeURIComponent(mid)}&kind=eq.person&pin_hash=eq.${encodeURIComponent(pin)}&is_active=eq.true&deleted_at=is.null&limit=1`);
      const st = Array.isArray(rows) ? rows[0] : null;
      if (!st) { const lk = await pinGuardFail(sid); return res.status(lk === 'hard' ? 423 : 401).json({ error: lk === 'hard' ? 'PIN の間違いが続いたため停止しました。管理者が解除するまで PIN は使えません' : 'PIN が違います', hard: lk === 'hard' }); }
      await pinGuardOk(sid);
      await logLogin(st, 'pin', body.device);
      return res.status(200).json({ ok: true, staff: strip(st) });
    }
    if (action === 'pin_login') {
      await sleep(300);
      const sid = String(t.store_id || body.store_id || ''); const pin = String(body.pin_hash || '').trim();
      if (!sid || !/^[0-9a-f]{64}$/.test(pin)) return res.status(400).json({ error: 'PIN が違います' });
      { const lk = await pinGuardCheck(sid); if (lk === -1) return res.status(423).json({ error: 'PIN の間違いが続いたため、管理者が解除するまで PIN は使えません(各種設定 → システム)', hard: true }); if (lk) return res.status(429).json({ error: `PIN の間違いが続いたため、${lk} 分ほど待ってからやり直してください` }); }
      const rows = await sb(`staff?select=${SAFE_COLS},member_id,kind&store_id=eq.${encodeURIComponent(sid)}&kind=eq.person&pin_hash=eq.${encodeURIComponent(pin)}&is_active=eq.true&deleted_at=is.null&limit=2`);
      if (!Array.isArray(rows) || rows.length !== 1 || !rows[0].member_id) { const lk = await pinGuardFail(sid); return res.status(lk === 'hard' ? 423 : 401).json({ error: lk === 'hard' ? 'PIN の間違いが続いたため停止しました。管理者が解除するまで PIN は使えません' : 'PIN が違います', hard: lk === 'hard' }); }
      await pinGuardOk(sid);
      await logLogin(rows[0], 'pin', body.device);
      return res.status(200).json({ ok: true, staff: strip(rows[0]) });
    }
    if (action === 'pin_unlock') {
      const sid = String(body.store_id || t.store_id || ''); if (!sid || !canManageStore(sid)) return res.status(403).json({ error: '権限がありません' });
      await pinGuardUnlock(sid); return res.status(200).json({ ok: true });
    }
    if (action === 'pin_guard_status') {
      const sid = String(body.store_id || t.store_id || ''); if (!sid) return res.status(400).json({ error: 'store_id' });
      const lk = await pinGuardCheck(sid); return res.status(200).json({ hard: lk === -1, minutes: lk > 0 ? lk : 0 });
    }
    if (action === 'members_status') {
      const sid = String(body.store_id || t.store_id || ''); if (!sid || !(canManageStore(sid) || (t.store_id && String(t.store_id) === String(sid)))) return res.status(403).json({ error: '権限がありません' });
      let accounts = [], invites = [];
      try {
        const rows = await sb(`staff?select=id,member_id,display_name,last_name,first_name,username,role,is_active,last_login,pin_hash,kind&store_id=eq.${encodeURIComponent(sid)}&kind=eq.person&deleted_at=is.null&order=created_at`);
        accounts = (rows || []).map(r => ({ staff_id: r.id, member_id: r.member_id, name: r.display_name || `${r.last_name || ''} ${r.first_name || ''}`.trim(), username: r.username, role: r.role, is_active: r.is_active !== false, has_pin: !!r.pin_hash, last_login: r.last_login }));
        const iv = await sb(`staff_invites?select=member_id,name,role,code,expires_at,used_by&store_id=eq.${encodeURIComponent(sid)}&used_by=is.null&order=created_at.desc`);
        invites = (iv || []).filter(i => !i.expires_at || new Date(i.expires_at) > new Date()).map(i => ({ member_id: i.member_id, name: i.name, role: i.role, code: i.code, expires_at: i.expires_at }));
      } catch (e) { return res.status(200).json({ accounts: [], invites: [], not_ready: true }); }
      return res.status(200).json({ accounts, invites });
    }
    if (action === 'set_active') {
      const target = await sb(`staff?select=id,store_id,kind&id=eq.${encodeURIComponent(String(body.staff_id || ''))}&limit=1`); const row = Array.isArray(target) ? target[0] : null;
      if (!row || !canManageStore(row.store_id) || row.kind !== 'person') return res.status(403).json({ error: '権限がありません' });
      await sb(`staff?id=eq.${encodeURIComponent(row.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ is_active: !!body.active }) });
      return res.status(200).json({ ok: true });
    }
    if (action === 'logins_list') {
      const sid = String(body.store_id || t.store_id || ''); if (!sid || !canManageStore(sid)) return res.status(403).json({ error: '権限がありません' });
      const lim = Math.min(Math.max(Number(body.limit) || 100, 1), 500);
      try { const rows = await sb(`staff_logins?select=at,name,kind,device,member_id&store_id=eq.${encodeURIComponent(sid)}&order=at.desc&limit=${lim}`); return res.status(200).json({ logins: rows || [] }); }
      catch { return res.status(200).json({ logins: [], not_ready: true }); }
    }
    // ---------------------------------------------------------------------------
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
