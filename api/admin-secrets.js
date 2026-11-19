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
      // ★ 2026-11-18 1118d: パスワードの類(シークレットキー・合言葉・アプリパスワード)は画面に文字を一切出さない(先頭6+末尾4でも画面越しの漏れになる)。ID・バケット名などの text だけ一部を見せる
      if (f.type === 'password' && st.masked) st.masked = '****';
      fields.push({
        env: f.env, dbKey: f.dbKey, label: f.label, type: f.type, placeholder: f.placeholder || '', note: f.note || '', optional: !!f.optional,
        ...st,
        editable: !!f.dbKey && st.source !== 'env',
      });
    }
    out.push({
      id: s.id, name: s.name, vendor: s.vendor || '', desc: s.desc, status: s.status,
      required: !!s.required, envOnly: !!s.envOnly, test: s.test || null,
      configured: fields.length > 0 && fields.every((f) => f.configured || f.optional), // ★ 1118d: 任意の欄(リージョン=空なら大阪)は未設定でも「設定済み」
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
    if (kind === 'gmail') { const { verifyGmail } = await import('./_mail.js'); return await verifyGmail(); } // ★ 2026-11-02
    if (kind === 's3') { // ★ 2026-11-16 写真の控え(AWS S3)
      const { s3FromSecrets, maskAws } = await import('./_s3.js');
      const s3 = await s3FromSecrets();
      if (!s3) return { error: 'アクセスキーID・シークレットアクセスキー・バケット名のどれかが未設定です' };
      try {
        await s3.listObjects('manifest/', null, 1);                       // 読める(ListBucket)
        const stamp = new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
        await s3.putObject('health/last_test.txt', Buffer.from(`つむぎ 接続テスト ${stamp} JST\n`, 'utf8'), 'text/plain; charset=utf-8'); // 置ける(PutObject)
        const last = await s3.getJson('manifest/last_run.json', null);  // 最後の控え(あれば)
        const when = last && last.finishedAt ? new Date(new Date(last.finishedAt).getTime() + 9 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' JST' : 'まだ実行されていません';
        // ★ 2026-11-19 trial591(ユーザー「何件控えができたかが出ていない」): 最後の実行の件数も出す(写真: 写した/残り/控え済みの合計・店舗データ: 今回/合計・失敗)
        const cnt = last ? `　写真 ${Number(last.copied) || 0}件を写し、残り ${Number(last.remaining) || 0}件（控え済み 合計 ${Number(last.totalFiles) || 0}件${last.byKind ? `・置いてあるファイル ${Number(last.listed) || 0}件の内訳: 写真 ${Number(last.byKind.photo) || 0}・PDF ${Number(last.byKind.pdf) || 0}・その他 ${Number(last.byKind.other) || 0}` : ''}）／店舗データ ${Number(last.appState && last.appState.copied) || 0}店（合計 ${Number(last.totalStores) || 0}店）${(Number(last.errorCount) || 0) ? `／失敗 ${Number(last.errorCount)}件` : ''}` : '';
        return { ok: true, detail: `バケット ${s3.bucket}（${s3.region}）に書き込めました。最後の控え: ${when}${cnt}` };
      } catch (e) {
        const m = maskAws(String((e && e.message) || e));
        if (/InvalidAccessKeyId|SignatureDoesNotMatch/.test(m)) return { error: 'アクセスキーIDまたはシークレットアクセスキーが違います' };
        if (/NoSuchBucket/.test(m)) return { error: 'バケット名が違います(見つかりません)' };
        if (/PermanentRedirect|AuthorizationHeaderMalformed|IllegalLocationConstraint/.test(m)) return { error: 'リージョンが違います(大阪なら ap-northeast-3)' };
        if (/AccessDenied/.test(m)) return { error: '権限が足りません。IAM ポリシー(s3:PutObject / GetObject / ListBucket)をご確認ください' };
        return { error: 'つながりませんでした: ' + m.slice(0, 160) };
      }
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
