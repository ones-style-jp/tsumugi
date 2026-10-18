// Vercel Serverless Function: ご家族・ケアマネのポータルをサーバー経由にする (2026-10-18 データ保護 段階3.5)
//
// ★ なぜ必要か
//   これまでポータルは公開キーで店舗データ本体(app_state の店舗行・ticket_records)を直接読んでいた。
//   つまりご家族の端末に「店舗全員のデータ」が届いていた(画面には出ないが取り出せる)。さらに段階3b で
//   店舗データ本体に行単位の制限(RLS)をかけると、証を持たないポータルは何も読めなくなる。
//   このエンドポイントは、ログインで発行する「ポータルの証」(署名付き・30日)で本人を確かめ、
//   「その利用者の分だけ」を返す/書く。計算(マージ)は src/lib/portalLogic.js をブラウザ版と共有。
//
// 環境変数: SUPABASE_URL(または VITE_SUPABASE_URL) / SUPABASE_SERVICE_ROLE_KEY
//
// POST /api/portal  { action, ... }
//   login             { username, password_hash }                         → { account, linkedAccounts, token }
//   token_for_account { username, password_hash }                         → 同上(登録直後に証を取るため・login と同じ)
//   state             { token, store_id }                                  → { data(その利用者分だけ), updated_at }
//   records           { token, store_id, since? }                          → { rows:[{id,patient_id,data,updated_at,deleted_at}] }
//   resolve_store     { token }                                            → { store_id, candidates }  (アカウントに店舗IDが無い旧データ用)
//   merge_patient     { token, store_id, patient_id, patch, extra }        → { ok }
//   append_doc_update { token, store_id, patient_id, entry }               → { ok }
//   merge_facesheet   { token, store_id, patient_id, face_sheet, meta }    → { ok }
//   merge_docs        { token, store_id, patient_id, patch, meta }         → { ok }
//   mark_read         { token, store_id, patient_id, side }                → { ok }
//   username_exists   { username, exclude_id }                             → { exists }
//   update_account    { token, account_id, patch, match_username }         → { ok }
//   delete_account    { token, account_id }                                → { ok }
//   self_provision_cm { token, password_hash }                             → { added }
//   list_stores       { }                                                  → { stores:[{id,name,short_name}] }
//
// ポータルの証: payload(base64url JSON) + '.' + HMAC-SHA256(SERVICE_KEY 由来の鍵)。中身 { acc, k(kind), links:[{s,p,a}], exp }
//   links = 本人が見てよい (店舗ID s, 利用者ID p, アカウントID a) の組。別の店舗・利用者は読めない/書けない。
import crypto from 'crypto';
import { portalMergePatientFromFamily, portalAppendDocUpdate, portalMergeFaceSheetFromCM, portalMergePatientDocsFromCM, portalMarkDocUpdatesRead, portalSliceState } from '../src/lib/portalLogic.js';

const SUPA_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const FAIL_DELAY_MS = 400;

const hdrs = () => ({ apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json' });
const enc = encodeURIComponent;
const b64u = (s) => Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
const sign = (payload) => crypto.createHmac('sha256', 'tsumugi-portal-token|' + SERVICE_KEY).update(payload).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sb(path, init) {
  const r = await fetch(`${SUPA_URL}/rest/v1/${path}`, { ...(init || {}), headers: { ...hdrs(), ...((init && init.headers) || {}) } });
  const text = await r.text().catch(() => '');
  let j = null; try { j = text ? JSON.parse(text) : null; } catch { j = null; }
  if (!r.ok) { const e = new Error((j && (j.message || j.error)) || `supabase ${r.status}`); e.status = r.status; e.body = j; throw e; }
  return j;
}

// ---- 証 ----
function makeToken(acc, linked) {
  const links = (linked || []).map(a => ({ s: a.store_id ? String(a.store_id) : null, p: String(a.patient_id), a: String(a.id) }));
  const payload = b64u(JSON.stringify({ acc: String(acc.id), k: String(acc.kind || 'family'), links, exp: Date.now() + TOKEN_TTL_MS }));
  return payload + '.' + sign(payload);
}
function readToken(token) {
  try {
    const [payload, sig] = String(token || '').split('.');
    if (!payload || !sig) return null;
    const expect = sign(payload);
    if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
    const t = JSON.parse(unb64u(payload));
    if (!t || !t.acc || !Array.isArray(t.links) || !t.exp || Date.now() > Number(t.exp)) return null;
    return t;
  } catch { return null; }
}
// 証が店舗 s(と利用者 p)を見てよいか。p 省略なら店舗だけ
const canStore = (t, s) => t.links.some(l => l.s && String(l.s) === String(s));
const canPatient = (t, s, p) => t.links.some(l => l.s && String(l.s) === String(s) && String(l.p) === String(p));
const pidsFor = (t, s) => [...new Set(t.links.filter(l => l.s && String(l.s) === String(s)).map(l => String(l.p)))];

// ---- family_accounts ----
const strip = (a) => { if (!a) return a; const { password_hash, ...rest } = a; return rest; };
async function findLinked(acc, password_hash) {
  let linked = [acc];
  if (acc.email) {
    const others = await sb(`family_accounts?select=*&email=eq.${enc(acc.email)}&password_hash=eq.${enc(password_hash)}&deleted_at=is.null`);
    if (Array.isArray(others) && others.length) {
      const seen = new Set(); const uniq = [];
      [acc, ...others.filter(o => String(o.id) !== String(acc.id))].forEach(o => { const k = String(o.patient_id); if (!seen.has(k)) { seen.add(k); uniq.push(o); } });
      linked = uniq;
    }
  }
  return linked;
}
async function loginFamily(username, password_hash) {
  const rows = await sb(`family_accounts?select=*&username=eq.${enc(username)}&password_hash=eq.${enc(password_hash)}&deleted_at=is.null&limit=1`);
  const acc = Array.isArray(rows) ? rows[0] : null;
  if (!acc) return null;
  try { await sb(`family_accounts?id=eq.${enc(acc.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ last_login: new Date().toISOString() }) }); } catch {}
  const linked = await findLinked(acc, password_hash);
  return { account: strip(acc), linkedAccounts: linked.map(strip), token: makeToken(acc, linked) };
}

// ---- app_state の CAS(楽観ロック): ブラウザ版 supabaseCasUpdate と同じ考え(version 条件付き更新・最大5回) ----
async function casUpdate(key, mutate) {
  for (let attempt = 0; attempt <= 5; attempt++) {
    const rows = await sb(`app_state?select=data,version&key=eq.${enc(key)}`);
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return { ok: false, reason: 'no-row' };
    const base = Number(row.version) || 0;
    const next = mutate(row.data || null);
    if (next == null) return { ok: true, noop: true, version: base };
    try { next.__clock = Math.max(Number(row.data && row.data.__clock) || 0, Date.now()); } catch {}
    const upd = await sb(`app_state?key=eq.${enc(key)}&version=eq.${base}&select=version`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ data: next, version: base + 1 }) });
    if (Array.isArray(upd) && upd.length) return { ok: true, version: base + 1 };
    await sleep(120 * (attempt + 1) + Math.floor(Math.random() * 100)); // 競合 → 読み直して再試行
  }
  return { ok: false, reason: 'conflict' };
}
async function loadState(storeId) {
  const rows = await sb(`app_state?select=data,updated_at&key=eq.${enc(storeId)}`);
  return Array.isArray(rows) ? rows[0] || null : null;
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
    // ---- 証が要らないもの ----
    if (action === 'login' || action === 'token_for_account') {
      const username = String(body.username || '').trim(); const hash = String(body.password_hash || '').trim();
      if (!username || !/^[0-9a-f]{64}$/.test(hash)) { await sleep(FAIL_DELAY_MS); return res.status(400).json({ error: 'IDまたはパスワードが違います' }); }
      const r = await loginFamily(username, hash);
      if (!r) { await sleep(FAIL_DELAY_MS); return res.status(401).json({ error: 'IDまたはパスワードが違います' }); }
      return res.status(200).json(r);
    }
    if (action === 'username_exists') {
      const u = String(body.username || '').trim(); if (!u) return res.status(200).json({ exists: false });
      const rows = await sb(`family_accounts?select=id&username=eq.${enc(u)}&deleted_at=is.null&limit=2`);
      const ex = (rows || []).filter(r => String(r.id) !== String(body.exclude_id || ''));
      await sleep(150);
      return res.status(200).json({ exists: ex.length > 0 });
    }
    if (action === 'list_stores') {
      const rows = await sb(`stores?select=id,name,short_name&status=eq.active&order=name`);
      return res.status(200).json({ stores: rows || [] });
    }

    // ---- 以降は証が必要 ----
    const t = readToken(body.token);
    if (!t) return res.status(401).json({ error: 'ログインの有効期限が切れています。もう一度ログインしてください。', expired: true });

    if (action === 'resolve_store') {
      // アカウントに店舗IDが無い(旧データ)場合: 利用者IDが一致する店舗を全店から探し、1件なら採用。複数なら氏名で絞る(ブラウザ版と同じ規則)
      const link = t.links.find(l => l.s) ; if (link) return res.status(200).json({ store_id: link.s, candidates: [] });
      const pid = String((t.links[0] || {}).p || ''); const expectName = String(body.expect_name || '').trim();
      if (!pid) return res.status(200).json({ store_id: null, candidates: [] });
      const stores = await sb(`stores?select=id&status=eq.active`);
      const cands = [];
      for (const s of (stores || [])) {
        const row = await loadState(s.id);
        const pat = ((row && row.data && row.data.patients) || []).find(p => String(p.id) === pid);
        if (pat) cands.push({ storeId: s.id, name: String(pat.name || '').trim() });
      }
      let sid = null;
      if (cands.length === 1) sid = cands[0].storeId;
      else if (cands.length > 1 && expectName) { const m = cands.filter(c => c.name === expectName); if (m.length === 1) sid = m[0].storeId; }
      let token = null;
      if (sid) { // 以後は証で見られるよう、アカウントに店舗IDを控え、店舗入りの証を返す
        try { await sb(`family_accounts?id=eq.${enc(t.acc)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ store_id: sid }) }); } catch {}
        const links = t.links.map(l => (l.s ? l : { ...l, s: sid }));
        const payload = b64u(JSON.stringify({ acc: t.acc, k: t.k, links, exp: t.exp })); token = payload + '.' + sign(payload);
      }
      return res.status(200).json({ store_id: sid, candidates: cands.map(c => ({ storeId: c.storeId })), token });
    }

    const storeId = String(body.store_id || '');
    if (action === 'state') {
      if (!canStore(t, storeId)) return res.status(403).json({ error: 'この店舗のデータは見られません' });
      const row = await loadState(storeId);
      if (!row) return res.status(200).json({ data: null, updated_at: null });
      return res.status(200).json({ data: portalSliceState(row.data, pidsFor(t, storeId)), updated_at: row.updated_at });
    }
    if (action === 'records') {
      if (!canStore(t, storeId)) return res.status(403).json({ error: 'この店舗のデータは見られません' });
      const pids = pidsFor(t, storeId); if (!pids.length) return res.status(200).json({ rows: [] });
      const since = String(body.since || '1970-01-01T00:00:00+00:00');
      const out = []; let page = 0;
      while (page < 20) { // 1000行ずつ(Supabase の1回の上限)
        const rows = await sb(`ticket_records?select=id,patient_id,rec_date,data,updated_at,deleted_at&store_id=eq.${enc(storeId)}&patient_id=in.(${pids.map(enc).join(',')})&updated_at=gt.${enc(since)}&order=updated_at.asc&limit=1000&offset=${page * 1000}`);
        if (!Array.isArray(rows) || !rows.length) break;
        out.push(...rows); if (rows.length < 1000) break; page++;
      }
      return res.status(200).json({ rows: out });
    }

    const patientId = String(body.patient_id || '');
    const needPatient = () => { if (!canPatient(t, storeId, patientId)) { res.status(403).json({ error: 'この利用者のデータは扱えません' }); return false; } return true; };
    if (action === 'merge_patient') {
      if (!needPatient()) return;
      const r = await casUpdate(storeId, (cloud) => portalMergePatientFromFamily(cloud, patientId, body.patch || {}, body.extra || null));
      return res.status(200).json({ ok: !!r.ok });
    }
    if (action === 'append_doc_update') {
      if (!needPatient()) return;
      const entry = body.entry || {}; const _now = new Date().toISOString();
      const e = { id: entry.id || `du_${_now}_${Math.round(Math.random() * 1e6)}`, at: entry.at || _now, by: entry.by || 'family', byName: entry.byName || '', items: [...new Set(entry.items || [])], readOffice: entry.readOffice === true, readCm: true,
        ...(entry.kind ? { kind: entry.kind } : {}), ...(entry.monRecId != null ? { monRecId: entry.monRecId } : {}), ...(entry.period ? { period: entry.period } : {}) };
      const r = await casUpdate(storeId, (cloud) => portalAppendDocUpdate(cloud, patientId, e));
      return res.status(200).json({ ok: !!r.ok });
    }
    if (action === 'merge_facesheet') {
      if (!needPatient()) return;
      const _now = new Date().toISOString(); const _duId = `du_${_now}_${Math.round(Math.random() * 1e6)}`;
      const r = await casUpdate(storeId, (cloud) => portalMergeFaceSheetFromCM(cloud, patientId, body.face_sheet || {}, body.meta || {}, _now, _duId));
      return res.status(200).json({ ok: !!r.ok });
    }
    if (action === 'merge_docs') {
      if (!needPatient()) return;
      const now = new Date().toISOString(); const _duId = `du_${now}_${Math.round(Math.random() * 1e6)}`;
      const byName = (body.meta && body.meta.byName) || 'ケアマネ';
      const r = await casUpdate(storeId, (cloud) => portalMergePatientDocsFromCM(cloud, patientId, body.patch || {}, byName, now, _duId));
      return res.status(200).json({ ok: !!r.ok });
    }
    if (action === 'mark_read') {
      if (!needPatient()) return;
      const flag = body.side === 'office' ? 'readOffice' : 'readCm';
      const r = await casUpdate(storeId, (cloud) => portalMarkDocUpdatesRead(cloud, patientId, flag));
      return res.status(200).json({ ok: !!r.ok });
    }

    // ---- アカウント(本人が見てよい利用者のアカウントだけ) ----
    const accAllowed = async (accountId) => {
      const rows = await sb(`family_accounts?select=id,patient_id,store_id,username&id=eq.${enc(accountId)}&limit=1`);
      const a = Array.isArray(rows) ? rows[0] : null; if (!a) return null;
      return t.links.some(l => String(l.p) === String(a.patient_id) && (!a.store_id || !l.s || String(l.s) === String(a.store_id))) ? a : null;
    };
    if (action === 'update_account') {
      // 変えてよい列だけ(列に無いもの=consents 等は黙って落とす。古い DB でもエラーにしない)
      const ALLOW = ['username', 'password_hash', 'password', 'relation', 'display_name', 'email', 'facility_name', 'patient_name', 'role'];
      const fields = {}; Object.keys(body.patch || {}).forEach(k => { if (ALLOW.includes(k)) fields[k] = body.patch[k]; });
      if (!Object.keys(fields).length) return res.status(200).json({ ok: true, skipped: true });
      let target = null;
      if (body.match_username) { const rows = await sb(`family_accounts?select=id,patient_id,store_id,username&username=eq.${enc(body.match_username)}&deleted_at=is.null&limit=1`); target = Array.isArray(rows) ? rows[0] : null; if (target) target = await accAllowed(target.id); }
      else target = await accAllowed(String(body.account_id || ''));
      if (!target) return res.status(403).json({ error: 'このアカウントは変更できません' });
      if (fields.username) {
        const dups = await sb(`family_accounts?select=id&username=eq.${enc(fields.username)}&deleted_at=is.null`);
        if ((dups || []).some(d => String(d.id) !== String(target.id))) return res.status(409).json({ error: 'このログインIDは既に使用されています' });
      }
      if (fields.password_hash && !/^[0-9a-f]{64}$/.test(String(fields.password_hash))) delete fields.password_hash;
      delete fields.password;
      await sb(`family_accounts?id=eq.${enc(target.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(fields) });
      return res.status(200).json({ ok: true });
    }
    if (action === 'delete_account') {
      const target = await accAllowed(String(body.account_id || ''));
      if (!target) return res.status(403).json({ error: 'このアカウントは削除できません' });
      try { await sb(`family_invites?used_by=eq.${enc(target.id)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); } catch {}
      await sb(`family_accounts?id=eq.${enc(target.id)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
      return res.status(200).json({ ok: true });
    }
    if (action === 'self_provision_cm') {
      // ケアマネが担当する利用者全員分のアカウントを揃える(ブラウザ版 supabaseSelfProvisionCm と同じ規則)
      const hash = String(body.password_hash || ''); if (!/^[0-9a-f]{64}$/.test(hash)) return res.status(400).json({ added: 0 });
      const accRows = await sb(`family_accounts?select=*&id=eq.${enc(t.acc)}&limit=1`); const acc = Array.isArray(accRows) ? accRows[0] : null;
      if (!acc || !acc.store_id || !acc.email || acc.password_hash !== hash) return res.status(200).json({ added: 0 });
      const row = await loadState(acc.store_id); if (!row || !row.data) return res.status(200).json({ added: 0 });
      const pats = Array.isArray(row.data.patients) ? row.data.patients : [];
      const cms = Array.isArray(row.data.systemSettings && row.data.systemSettings.careManagers) ? row.data.systemSettings.careManagers : [];
      const nrm = (s) => String(s || '').normalize('NFKC').replace(/[\s　]/g, '');
      const em = String(acc.email).toLowerCase();
      let person = cms.find(c => c && c.email && String(c.email).toLowerCase() === em) || null;
      if (!person) { const m = cms.filter(c => { const x = nrm(c && c.name), y = nrm(acc.display_name); return x && y && (x === y || (x.length >= 2 && y.length >= 2 && (x.includes(y) || y.includes(x)))); }); if (m.length === 1) person = m[0]; }
      if (!person) return res.status(200).json({ added: 0 });
      const desired = pats.filter(p => p && (p.status || '利用中') !== '退所済み' && nrm(p.cmOffice) === nrm(person.office) && nrm(p.cmName) === nrm(person.name));
      if (!desired.length) return res.status(200).json({ added: 0 });
      const rows = await sb(`family_accounts?select=*&store_id=eq.${enc(acc.store_id)}&email=eq.${enc(acc.email)}`);
      const mine = (rows || []).filter(r => r.password_hash === hash);
      let added = 0;
      for (const p of desired) {
        const pid = String(p.id);
        if (mine.some(r => String(r.patient_id) === pid && !r.deleted_at)) continue;
        const dead = mine.find(r => String(r.patient_id) === pid && r.deleted_at);
        if (dead) { try { await sb(`family_accounts?id=eq.${enc(dead.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ deleted_at: null }) }); added++; } catch {} continue; }
        let uname = `${acc.username}-p${pid}`.slice(0, 64);
        if ((rows || []).some(r => r.username === uname)) uname = `${acc.username}-p${pid}-${Math.random().toString(36).slice(2, 6)}`.slice(0, 64);
        const rec = { patient_id: pid, store_id: acc.store_id, username: uname, password_hash: hash, kind: 'caremanager', relation: 'ケアマネージャー', display_name: acc.display_name || person.name || '', email: acc.email, facility_name: acc.facility_name || '', patient_name: p.name || '', role: 'member' };
        try { await sb('family_accounts', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(rec) }); added++; }
        catch { try { await sb('family_accounts', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ ...rec, kind: 'family' }) }); added++; } catch {} }
      }
      // 揃えたあとの証を返す(切替先に新しい利用者が出るように)
      const linked = await findLinked(acc, hash);
      return res.status(200).json({ added, token: makeToken(acc, linked), linkedAccounts: linked.map(strip) });
    }

    return res.status(400).json({ error: `unknown action: ${action}` });
  } catch (e) {
    return res.status(e && e.status === 409 ? 409 : 500).json({ error: (e && e.message) || 'server error' });
  }
}
