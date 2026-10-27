// つむぎ: Web プッシュ通知(2026-10-27・第1段階=カレンダーの予定を、その店舗で通知を許可した端末へ)
//
// POST /api/push { action, ... }
//   key                                   → { publicKey }          送信の鍵(公開)。初回に作って app_secrets 'push_vapid' に保存(以後変えない)
//   subscribe   { token, store_id?, sub, device, origin } → { ok, count }  この端末を店舗の通知先に登録(app_secrets 'push_subs')
//   unsubscribe { token, store_id?, endpoint }           → { ok }
//   test        { token, store_id?, endpoint }           → { ok }   この端末へテスト通知
//   status      { token, store_id? }                     → { count } 店舗の通知先の端末数
//   preview     { token(本部), store_id }                → { items } いま送るもの(送らない・確認用)
// GET  /api/push (Vercel Cron・5分おき)     → 送る時刻になった予定の通知を送る(api/_push_plan.js)
//
// 本部の作業は要らない: 鍵・通知先・送信済みの控えは、すべて既存の app_secrets(サーバーだけが読める表)に保存する。
// 通知の文には利用者名・予定の題名を出さない(ロック画面に出るため)。押すとつむぎ(ログインを通る)のカレンダーが開く。
import crypto from 'crypto';
import webpush from 'web-push';
import { planStore } from './_push_plan.js';

const SUPA_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hdrs = () => ({ apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json' });
const unb64u = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
const sign = (payload) => crypto.createHmac('sha256', 'tsumugi-staff-token|' + SERVICE_KEY).update(payload).digest('hex'); // staff-auth.js と同じ
function readToken(token) {
  try {
    const [payload, sig] = String(token || '').split('.'); if (!payload || !sig) return null;
    const expect = sign(payload);
    if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
    const t = JSON.parse(unb64u(payload)); if (!t || !t.sid || !t.exp || Date.now() > Number(t.exp)) return null;
    return t;
  } catch { return null; }
}
async function sb(path, init) {
  const r = await fetch(`${SUPA_URL}/rest/v1/${path}`, { ...(init || {}), headers: { ...hdrs(), ...((init && init.headers) || {}) } });
  const text = await r.text().catch(() => ''); let json = null; try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (!r.ok) { const e = new Error((json && (json.message || json.error)) || `HTTP ${r.status}`); e.status = r.status; throw e; }
  return json;
}
async function kvLoad(key) { try { const rows = await sb(`app_secrets?select=value&key=eq.${encodeURIComponent(key)}&limit=1`); const v = rows && rows[0] && rows[0].value; const j = v ? JSON.parse(v) : {}; return (j && typeof j === 'object') ? j : {}; } catch { return {}; } }
async function kvSave(key, g) {
  const value = JSON.stringify(g), updated_at = new Date().toISOString();
  try { const r = await sb(`app_secrets?key=eq.${encodeURIComponent(key)}&select=key`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ value, updated_at, updated_by: 'push' }) }); if (Array.isArray(r) && r.length) return; } catch {}
  try { await sb('app_secrets', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ key, value, updated_at, updated_by: 'push' }) }); } catch {}
}
// 送信の鍵: 初回だけ作る。鍵を変えると全端末の登録が使えなくなるので、ある限り作り直さない
async function vapid() {
  let v = await kvLoad('push_vapid');
  if (v.publicKey && v.privateKey) return v;
  const k = webpush.generateVAPIDKeys();
  await kvSave('push_vapid', { publicKey: k.publicKey, privateKey: k.privateKey, at: new Date().toISOString() });
  v = await kvLoad('push_vapid'); // 同時に作られた場合は保存された方を使う
  return (v.publicKey && v.privateKey) ? v : { publicKey: k.publicKey, privateKey: k.privateKey };
}
const subId = (endpoint) => crypto.createHash('sha256').update(String(endpoint)).digest('hex').slice(0, 32);
const PROD = 'https://tsumugi.ones-style.co.jp';
const okOrigin = (o) => { const s = String(o || ''); return s === PROD || /^https:\/\/tsumugi[a-z0-9-]*\.vercel\.app$/.test(s) || /^http:\/\/localhost(:\d+)?$/.test(s); };
async function sendTo(sub, payload, v) {
  webpush.setVapidDetails(PROD, v.publicKey, v.privateKey);
  try { await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(payload), { TTL: 3600, urgency: 'high' }); return { ok: true }; }
  catch (e) { const st = e && e.statusCode; return { ok: false, status: st || 0, gone: st === 404 || st === 410 }; }
}
async function storeData(storeId) {
  const rows = await sb(`app_state?key=eq.${encodeURIComponent(storeId)}&select=ev:data->scheduleEvents,pn:data->systemSettings->pushNotify,cl:data->systemSettings->scheduleColorLabels&limit=1`);
  const r = (Array.isArray(rows) && rows[0]) || {};
  return { events: Array.isArray(r.ev) ? r.ev : [], cfg: r.pn || null, colorLabels: Array.isArray(r.cl) ? r.cl : [] };
}

async function runCron(nowMs, dryStore) {
  const subs = await kvLoad('push_subs'); const sent = await kvLoad('push_sent');
  Object.keys(sent).forEach(k => { if (nowMs - Number(sent[k] || 0) > 3 * 86400000) delete sent[k]; });
  const byStore = {}; Object.entries(subs).forEach(([id, s]) => { if (s && s.storeId && s.endpoint) (byStore[s.storeId] = byStore[s.storeId] || []).push([id, s]); });
  const stores = dryStore ? [dryStore] : Object.keys(byStore);
  const v = dryStore ? null : await vapid();
  let n = 0; const gone = new Set(); const preview = [];
  for (const storeId of stores) {
    let d; try { d = await storeData(storeId); } catch { continue; }
    const items = planStore({ storeId, ...d }, nowMs, sent);
    if (dryStore) { preview.push(...items); continue; }
    for (const it of items) {
      sent[it.key] = nowMs; if (it.skip) continue;
      for (const [id, s] of (byStore[storeId] || [])) {
        const r = await sendTo(s, { title: it.title, body: it.body, tag: it.tag, url: (okOrigin(s.origin) ? s.origin : PROD) + it.path }, v);
        if (r.ok) n++; else if (r.gone) gone.add(id);
      }
    }
  }
  if (dryStore) return { items: preview };
  await kvSave('push_sent', sent);
  if (gone.size) { const fresh = await kvLoad('push_subs'); gone.forEach(id => { delete fresh[id]; }); await kvSave('push_subs', fresh); } // 読み直してから消す(同時の登録を消さない)
  return { stores: stores.length, sent: n };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!SUPA_URL || !SERVICE_KEY) return res.status(500).json({ error: 'サーバーの設定が不足しています' });
  let body = {};
  if (req.method === 'POST') { try { body = typeof req.body === 'object' && req.body ? req.body : JSON.parse(req.body || '{}'); } catch { body = {}; } }
  const action = String(body.action || (req.query && req.query.action) || '');
  try {
    // ★ Vercel Cron(GET・5分おき)。CRON_SECRET を設定しているときはそれを確かめる
    if (req.method === 'GET' && (!action || action === 'cron')) {
      const secret = process.env.CRON_SECRET;
      const ua = String(req.headers['user-agent'] || '');
      if (secret ? req.headers.authorization !== `Bearer ${secret}` : !/vercel-cron/i.test(ua)) return res.status(401).json({ error: 'Unauthorized' });
      return res.status(200).json(await runCron(Date.now()));
    }
    if (action === 'key') { const v = await vapid(); return res.status(200).json({ publicKey: v.publicKey }); }
    const t = readToken(body.token); if (!t) return res.status(401).json({ error: 'ログインし直してください' });
    const isHq = t.role === 'super_admin';
    const storeId = String((isHq ? body.store_id : t.store_id) || '');
    if (!storeId) return res.status(400).json({ error: '店舗に入ってから設定してください' });
    if (action === 'preview') { if (!isHq) return res.status(403).json({ error: '本部だけが使えます' }); return res.status(200).json(await runCron(Number(body.now) || Date.now(), storeId)); }
    const subs = await kvLoad('push_subs');
    if (action === 'status') return res.status(200).json({ count: Object.values(subs).filter(s => s && s.storeId === storeId).length });
    if (action === 'subscribe') {
      const s = body.sub || {}; const ep = String(s.endpoint || ''); const k = s.keys || {};
      if (!/^https:\/\//.test(ep) || ep.length > 1000 || !k.p256dh || !k.auth) return res.status(400).json({ error: '通知の登録の形が正しくありません' });
      const origin = okOrigin(body.origin) ? String(body.origin) : PROD;
      const id = subId(ep); const prev = subs[id] || {};
      subs[id] = { endpoint: ep, keys: { p256dh: String(k.p256dh).slice(0, 200), auth: String(k.auth).slice(0, 100) }, storeId, staffId: String(t.sid), device: String(body.device || '').slice(0, 40), origin, at: prev.at || new Date().toISOString(), seen: new Date().toISOString(), lastOk: prev.lastOk || null };
      // 1店舗の端末は 60 台まで(古いものから外す)
      const mine = Object.entries(subs).filter(([, x]) => x && x.storeId === storeId).sort((a, b) => String(a[1].seen || '').localeCompare(String(b[1].seen || '')));
      while (mine.length > 60) { const [rid] = mine.shift(); delete subs[rid]; }
      await kvSave('push_subs', subs);
      return res.status(200).json({ ok: true, count: Object.values(subs).filter(x => x && x.storeId === storeId).length });
    }
    if (action === 'unsubscribe') { const id = subId(body.endpoint); if (subs[id] && subs[id].storeId === storeId) { delete subs[id]; await kvSave('push_subs', subs); } return res.status(200).json({ ok: true }); }
    if (action === 'test') {
      const s = subs[subId(body.endpoint)]; if (!s || s.storeId !== storeId) return res.status(404).json({ error: 'この端末はまだ通知先に登録されていません' });
      const r = await sendTo(s, { title: 'つむぎ 通知のテスト', body: 'この端末に予定のお知らせが届きます。', tag: 'tsumugi-test', url: (okOrigin(s.origin) ? s.origin : PROD) + '/' }, await vapid());
      if (r.gone) { delete subs[subId(body.endpoint)]; await kvSave('push_subs', subs); }
      return r.ok ? res.status(200).json({ ok: true }) : res.status(502).json({ error: `通知を送れませんでした(${r.status || '通信'})。もう一度「この端末に通知を届ける」を押してください` });
    }
    return res.status(400).json({ error: '不明な操作です' });
  } catch (e) {
    return res.status(500).json({ error: (e && e.message) || '通知の処理に失敗しました' });
  }
}
export { runCron }; // 検査用(scripts/chk_1027push_api.mjs)
