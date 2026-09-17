// Vercel Serverless Function: 外部サービスの設定(APIキー等)を管理局の画面から一括管理する(2026-09-17)
//
// ★ 設計の要点
//   ・値はブラウザへ返さない。一覧では「先頭6文字…末尾4文字」のマスクだけ返す。
//   ・保存先は Supabase の app_secrets(RLS有効・ポリシー無し = service_role だけが読み書き可)。
//   ・app_state には置かない(公開キーで誰でも読めるため)。
//   ・認証は環境変数 ADMIN_API_SECRET との照合(timingSafeEqual)。
//   ・環境変数が設定されている項目は、そちらが優先されるため画面からは変更できない(その旨を返す)。
//
// POST /api/admin-secrets  body: { secret, action, ... }
//   action='list'   → { ok, services:[{id,name,desc,status,fields:[{...,configured,source,masked,updatedAt}]}] }
//   action='save'   → { dbKey, value } を保存
//   action='delete' → { dbKey } を削除
//   action='test'   → { id } のサービスへ実際に疎通確認
import crypto from 'crypto';
import { EXT_SERVICES, findService, findField } from './_services.js';
import { getSecret, getSecretStatus, saveSecret, deleteSecret } from './_secrets.js';

const secretOk = (given) => {
  const want = String(process.env.ADMIN_API_SECRET || '');
  const got = String(given || '');
  if (!want) return null;
  const a = crypto.createHash('sha256').update(want).digest();
  const b = crypto.createHash('sha256').update(got).digest();
  return crypto.timingSafeEqual(a, b);
};

async function listAll() {
  const out = [];
  for (const s of EXT_SERVICES) {
    const fields = [];
    for (const f of s.fields || []) {
      const st = await getSecretStatus(f.env, f.dbKey);
      fields.push({
        env: f.env, dbKey: f.dbKey, label: f.label, type: f.type, placeholder: f.placeholder || '', note: f.note || '',
        ...st,
        editable: !!f.dbKey && st.source !== 'env',
      });
    }
    out.push({
      id: s.id, name: s.name, vendor: s.vendor || '', desc: s.desc, status: s.status,
      required: !!s.required, envOnly: !!s.envOnly, test: s.test || null,
      configured: fields.length > 0 && fields.every((f) => f.configured),
      fields,
    });
  }
  return out;
}

async function runTest(id) {
  const svc = findService(id);
  if (!svc) return { error: 'サービスが見つかりません' };
  const kind = svc.test;
  try {
    if (kind === 'anthropic') {
      const key = await getSecret('ANTHROPIC_API_KEY', 'anthropic_api_key');
      if (!key) return { error: 'APIキーが未設定です' };
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 16, messages: [{ role: 'user', content: '「OK」とだけ返してください。' }] }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return { error: 'つながりませんでした: ' + (j?.error?.message || `HTTP ${r.status}`) };
      const text = (j?.content || []).map((c) => c.text || '').join('').trim();
      return { ok: true, detail: `AIが応答しました（${text.slice(0, 20) || 'OK'}）` };
    }
    if (kind === 'gmaps') {
      const key = await getSecret('GOOGLE_MAPS_API_KEY', 'google_maps_api_key');
      if (!key) return { error: 'APIキーが未設定です' };
      const u = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent('東京都江東区扇橋1-1-1')}&language=ja&key=${key}`;
      const r = await fetch(u);
      const j = await r.json().catch(() => ({}));
      if (j.status === 'OK') return { ok: true, detail: `住所を検索できました（${j.results?.[0]?.formatted_address || ''}）` };
      return { error: `つながりませんでした: ${j.status || r.status}${j.error_message ? ' / ' + j.error_message : ''}` };
    }
    if (kind === 'brevo') {
      const key = await getSecret('BREVO_API_KEY', 'brevo_api_key');
      if (!key) return { error: 'APIキーが未設定です' };
      const r = await fetch('https://api.brevo.com/v3/account', { headers: { 'api-key': key, accept: 'application/json' } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return { error: 'つながりませんでした: ' + (j?.message || `HTTP ${r.status}`) };
      return { ok: true, detail: `アカウントを確認しました（${j?.companyName || j?.email || 'OK'}）` };
    }
    if (kind === 'interfax') {
      const user = await getSecret('INTERFAX_USER', 'interfax_user');
      const pass = await getSecret('INTERFAX_PASS', 'interfax_pass');
      if (!user || !pass) return { error: 'ユーザー名またはパスワードが未設定です' };
      const auth = Buffer.from(`${user}:${pass}`).toString('base64');
      const r = await fetch('https://rest.interfax.net/accounts/self/ppcards/balance', { headers: { Authorization: 'Basic ' + auth } });
      const t = await r.text().catch(() => '');
      if (!r.ok) return { error: 'つながりませんでした: ' + (r.status === 401 ? 'ユーザー名またはパスワードが違います' : `HTTP ${r.status}`) };
      return { ok: true, detail: `接続できました（残高 ${String(t).trim().slice(0, 20)}）` };
    }
    return { error: 'このサービスは接続テストに対応していません' };
  } catch (e) {
    return { error: 'テスト中にエラー: ' + String((e && e.message) || e) };
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const { secret, action } = body;

  const authed = secretOk(secret);
  if (authed === null) {
    return res.status(200).json({ error: 'この画面から設定を変更するには、先に Vercel の環境変数に ADMIN_API_SECRET（本部だけが知る合言葉）を追加してください。', needsSetup: true });
  }
  if (!authed) return res.status(401).json({ error: '合言葉が違います' });

  try {
    if (action === 'list') return res.status(200).json({ ok: true, services: await listAll() });

    if (action === 'save') {
      const dbKey = String(body.dbKey || '');
      const hit = findField(dbKey);
      if (!hit) return res.status(200).json({ error: '設定できない項目です' });
      if (process.env[hit.field.env]) {
        return res.status(200).json({ error: `Vercel の環境変数 ${hit.field.env} が設定されているため、この画面からは変更できません（環境変数が優先されます）。画面で管理したい場合は Vercel 側を削除してください。` });
      }
      const value = String(body.value || '').trim();
      if (!value) return res.status(200).json({ error: '値を入力してください' });
      if (hit.field.env === 'ANTHROPIC_API_KEY' && !value.startsWith('sk-ant-')) {
        return res.status(200).json({ error: 'Claude のAPIキーは sk-ant- で始まります。値をご確認ください。' });
      }
      const r = await saveSecret(dbKey, value, body.by);
      if (r.error) return res.status(200).json(r);
      return res.status(200).json({ ok: true, saved: true, services: await listAll() });
    }

    if (action === 'delete') {
      const dbKey = String(body.dbKey || '');
      if (!findField(dbKey)) return res.status(200).json({ error: '設定できない項目です' });
      const r = await deleteSecret(dbKey);
      if (r.error) return res.status(200).json(r);
      return res.status(200).json({ ok: true, deleted: true, services: await listAll() });
    }

    if (action === 'test') return res.status(200).json(await runTest(String(body.id || '')));

    return res.status(400).json({ error: 'action が不正です' });
  } catch (e) {
    return res.status(500).json({ error: 'エラー: ' + String((e && e.message) || e) });
  }
}
