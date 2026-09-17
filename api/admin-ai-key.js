// Vercel Serverless Function: 本部のClaude APIキーを管理局の画面から登録・変更する(2026-09-17)
//
// ★ 設計の要点
//   ・APIキーは絶対にブラウザへ返さない。状況確認では「先頭数文字…末尾4文字」のマスクだけ返す。
//   ・保存先は Supabase の app_secrets テーブル(RLS有効・ポリシー無し = service_role だけが読み書き可)。
//     app_state には保存しない。app_state は公開キーで誰でも読めるため、置いた時点でキーが公開される。
//   ・認証は環境変数 ADMIN_API_SECRET との照合。staff テーブルは公開キーで読めてしまう状態のため、
//     そこに依存した認証は使わない(別途 RLS の是正が必要)。
//
// 環境変数:
//   ADMIN_API_SECRET          - 管理局でキーを操作するときの合言葉(本部だけが知る文字列)
//   VITE_SUPABASE_URL (SUPABASE_URL) / SUPABASE_SERVICE_ROLE_KEY
//   ANTHROPIC_API_KEY         - 任意。設定されていればこちらが最優先で使われ、画面からは変更できない。
//
// POST /api/admin-ai-key   body: { secret, action }
//   action='status' → { ok, configured, source:'env'|'db'|null, masked, updatedAt, updatedBy }
//   action='save'   → body に key を含める。保存して status と同じ内容を返す
//   action='delete' → app_secrets の行を削除
//   action='test'   → 保存済みキーで実際にAIを1回呼び、疎通を確認する
import crypto from 'crypto';

const SUPA_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SECRET_ROW = 'anthropic_api_key';

const sbHeaders = () => ({
  apikey: SERVICE_KEY,
  Authorization: 'Bearer ' + SERVICE_KEY,
  'Content-Type': 'application/json',
});

const mask = (k) => {
  const s = String(k || '');
  if (s.length < 12) return s ? '****' : '';
  return `${s.slice(0, 7)}…${s.slice(-4)}`;
};

// タイミング攻撃を避けた合言葉の比較
const secretOk = (given) => {
  const want = String(process.env.ADMIN_API_SECRET || '');
  const got = String(given || '');
  if (!want) return null; // 未設定 = この機能は使えない
  const a = crypto.createHash('sha256').update(want).digest();
  const b = crypto.createHash('sha256').update(got).digest();
  return crypto.timingSafeEqual(a, b);
};

async function readDbKey() {
  if (!SUPA_URL || !SERVICE_KEY) return null;
  const r = await fetch(`${SUPA_URL}/rest/v1/app_secrets?key=eq.${SECRET_ROW}&select=value,updated_at,updated_by`, { headers: sbHeaders() });
  if (!r.ok) return null;
  const j = await r.json().catch(() => []);
  return Array.isArray(j) && j[0] ? j[0] : null;
}

async function status() {
  const envKey = String(process.env.ANTHROPIC_API_KEY || '').trim();
  if (envKey) return { configured: true, source: 'env', masked: mask(envKey), updatedAt: null, updatedBy: null };
  let row = null;
  try { row = await readDbKey(); } catch { row = null; }
  const v = row ? String(row.value || '').trim() : '';
  return {
    configured: !!v,
    source: v ? 'db' : null,
    masked: v ? mask(v) : '',
    updatedAt: row ? row.updated_at : null,
    updatedBy: row ? row.updated_by : null,
  };
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
    return res.status(200).json({ error: 'この機能はまだ使えません。Vercel の環境変数に ADMIN_API_SECRET(本部だけが知る合言葉)を設定してください。', needsSetup: true });
  }
  if (!authed) return res.status(401).json({ error: '合言葉が違います' });

  try {
    if (action === 'status') return res.status(200).json({ ok: true, ...(await status()) });

    if (action === 'save') {
      if (String(process.env.ANTHROPIC_API_KEY || '').trim()) {
        return res.status(200).json({ error: 'Vercel の環境変数 ANTHROPIC_API_KEY が設定されているため、画面からの変更はできません(環境変数が優先されます)。画面から管理したい場合は、Vercel 側の ANTHROPIC_API_KEY を削除してください。' });
      }
      const key = String(body.key || '').trim();
      if (!key.startsWith('sk-ant-')) return res.status(200).json({ error: 'Claude のAPIキーは sk-ant- で始まります。値をご確認ください。' });
      if (!SUPA_URL || !SERVICE_KEY) return res.status(500).json({ error: 'サーバー設定エラー: Supabase の環境変数が未設定です' });
      const r = await fetch(`${SUPA_URL}/rest/v1/app_secrets?on_conflict=key`, {
        method: 'POST',
        headers: { ...sbHeaders(), Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({ key: SECRET_ROW, value: key, updated_at: new Date().toISOString(), updated_by: String(body.by || '管理局') }),
      });
      if (!r.ok) {
        const t = await r.text().catch(() => '');
        if (/app_secrets/.test(t) && /(does not exist|Could not find)/i.test(t)) {
          return res.status(200).json({ error: '保存先のテーブル(app_secrets)がまだありません。Supabase の SQL Editor で docs/sql/app_secrets.sql を1回実行してください。', needsTable: true });
        }
        return res.status(200).json({ error: '保存に失敗しました: ' + t.slice(0, 200) });
      }
      return res.status(200).json({ ok: true, saved: true, ...(await status()) });
    }

    if (action === 'delete') {
      if (!SUPA_URL || !SERVICE_KEY) return res.status(500).json({ error: 'サーバー設定エラー' });
      const r = await fetch(`${SUPA_URL}/rest/v1/app_secrets?key=eq.${SECRET_ROW}`, { method: 'DELETE', headers: sbHeaders() });
      if (!r.ok) return res.status(200).json({ error: '削除に失敗しました' });
      return res.status(200).json({ ok: true, deleted: true, ...(await status()) });
    }

    if (action === 'test') {
      const envKey = String(process.env.ANTHROPIC_API_KEY || '').trim();
      let key = envKey;
      if (!key) { const row = await readDbKey(); key = row ? String(row.value || '').trim() : ''; }
      if (!key) return res.status(200).json({ error: 'APIキーが未設定です' });
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 16, messages: [{ role: 'user', content: '「OK」とだけ返してください。' }] }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) return res.status(200).json({ error: 'AIに接続できませんでした: ' + (data?.error?.message || `HTTP ${resp.status}`) });
      const text = (data?.content || []).map((c) => c.text || '').join('').trim();
      return res.status(200).json({ ok: true, tested: true, reply: text.slice(0, 40), model: data?.model || '' });
    }

    return res.status(400).json({ error: 'action が不正です' });
  } catch (e) {
    return res.status(500).json({ error: 'エラー: ' + String((e && e.message) || e) });
  }
}
