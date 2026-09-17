// Vercel Serverless Function: AI呼び出しの本部一括プロキシ(2026-09-08 / 2026-09-17 改修)
// 各事業所がAPIキーを個別設定しなくても、本部が1つ設定すれば全店でAIが使える。
//
// ★ キーの置き場所(優先順)
//   1) Vercel環境変数 ANTHROPIC_API_KEY (Sensitive)
//   2) Supabase の app_secrets テーブル(管理局の画面から登録・service_roleでのみ読める)
//   どちらもサーバー側だけが読む。ブラウザへは絶対に返さない(configured の真偽だけ返す)。
//   ※ app_state には保存しないこと。app_state は公開キーで誰でも読めるため、キーが実質公開される。
//
// 環境変数:
//   ANTHROPIC_API_KEY        - 本部のClaude APIキー(任意。あれば最優先)
//   VITE_SUPABASE_URL        - Supabase URL(app_secrets を使う場合)
//   SUPABASE_SERVICE_ROLE_KEY- service_role キー(同上)
//
// GET  /api/ai-draft → { configured: true/false, source: 'env'|'db'|null }
// POST /api/ai-draft → Anthropic Messages APIへ転送し、応答をそのまま返す
//   body: { model, max_tokens, messages, system?, storeId? }
//   storeId は将来の「料金プランごとのAI利用可否・上限」判定用(現状は全店許可)。

const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_SRV = process.env.SUPABASE_SERVICE_ROLE_KEY;

// サーバーレスの実行環境が使い回される間だけ保持する短期キャッシュ(60秒)。
// 管理局でキーを差し替えたとき、最大1分で全店に反映される。
let _cache = { key: null, source: null, at: 0 };

async function loadKey() {
  const envKey = String(process.env.ANTHROPIC_API_KEY || '').trim();
  if (envKey) return { key: envKey, source: 'env' };
  if (Date.now() - _cache.at < 60000) return { key: _cache.key, source: _cache.source };
  if (!SB_URL || !SB_SRV) { _cache = { key: null, source: null, at: Date.now() }; return { key: null, source: null }; }
  try {
    const r = await fetch(`${SB_URL}/rest/v1/app_secrets?key=eq.anthropic_api_key&select=value`, {
      headers: { apikey: SB_SRV, Authorization: 'Bearer ' + SB_SRV },
    });
    if (!r.ok) { _cache = { key: null, source: null, at: Date.now() }; return { key: null, source: null }; }
    const j = await r.json().catch(() => []);
    const v = Array.isArray(j) && j[0] ? String(j[0].value || '').trim() : '';
    _cache = { key: v || null, source: v ? 'db' : null, at: Date.now() };
    return { key: _cache.key, source: _cache.source };
  } catch {
    _cache = { key: null, source: null, at: Date.now() };
    return { key: null, source: null };
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { key, source } = await loadKey();
  if (req.method === 'GET') return res.status(200).json({ configured: !!key, source: key ? source : null });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!key) return res.status(200).json({ notConfigured: true });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const { model, max_tokens, messages, system } = body;
  if (!model || !Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: 'model と messages は必須です' });
  }
  // 安全上限: 1回のリクエストの出力トークンを制限(コスト暴走防止)
  const _maxTok = Math.min(Number(max_tokens) || 1000, 4000);
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: _maxTok, messages, ...(system ? { system } : {}) }),
    });
    const data = await resp.json().catch(() => ({}));
    return res.status(resp.status).json(data);
  } catch (e) {
    return res.status(502).json({ error: 'AI呼び出しに失敗しました: ' + String((e && e.message) || e) });
  }
}
