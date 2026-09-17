// つむぎ: 外部サービスの資格情報(APIキー等)をサーバー側で解決する共通ヘルパー(2026-09-17)
//
// 優先順: ① Vercel の環境変数  ② Supabase の app_secrets テーブル(管理局の画面から登録)
//   ・環境変数があればそれが最優先(既存の運用をそのまま維持できる)
//   ・app_secrets は RLS 有効・ポリシー無しで、service_role を持つサーバーだけが読める
//   ・app_state には絶対に置かないこと(公開キーで誰でも読めるため、置いた時点で公開される)
//
// ファイル名が _ で始まるため、Vercel のルーティング対象(エンドポイント)にはならない。

const SUPA_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// サーバーレス実行環境が使い回される間だけ保持する短期キャッシュ。
// 管理局で差し替えたとき、最大 TTL 分で全店に反映される。
const TTL_MS = 60 * 1000;
let _cache = { at: 0, map: null };

export const sbHeaders = () => ({
  apikey: SERVICE_KEY,
  Authorization: 'Bearer ' + SERVICE_KEY,
  'Content-Type': 'application/json',
});

// app_secrets を丸ごと読んでキャッシュする(1リクエストで複数キーを引くことが多いため)
async function loadAll(force) {
  if (!force && _cache.map && Date.now() - _cache.at < TTL_MS) return _cache.map;
  if (!SUPA_URL || !SERVICE_KEY) { _cache = { at: Date.now(), map: {} }; return _cache.map; }
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/app_secrets?select=key,value,updated_at,updated_by`, { headers: sbHeaders() });
    if (!r.ok) { _cache = { at: Date.now(), map: {} }; return _cache.map; }
    const rows = await r.json().catch(() => []);
    const map = {};
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      if (row && row.key) map[row.key] = { value: String(row.value || ''), updatedAt: row.updated_at, updatedBy: row.updated_by };
    });
    _cache = { at: Date.now(), map };
    return map;
  } catch {
    _cache = { at: Date.now(), map: {} };
    return _cache.map;
  }
}

/** 資格情報を1つ取り出す。envName は環境変数名、dbKey は app_secrets の key。
 *  戻り値は文字列(未設定なら '')。 */
export async function getSecret(envName, dbKey) {
  const fromEnv = String((envName && process.env[envName]) || '').trim();
  if (fromEnv) return fromEnv;
  if (!dbKey) return '';
  const map = await loadAll(false);
  return String((map[dbKey] && map[dbKey].value) || '').trim();
}

/** 設定状況(値そのものは返さない)。管理局の一覧表示用。 */
export async function getSecretStatus(envName, dbKey) {
  const fromEnv = String((envName && process.env[envName]) || '').trim();
  if (fromEnv) return { configured: true, source: 'env', masked: maskSecret(fromEnv), updatedAt: null, updatedBy: null };
  const map = await loadAll(true);
  const row = dbKey ? map[dbKey] : null;
  const v = row ? String(row.value || '').trim() : '';
  return {
    configured: !!v,
    source: v ? 'db' : null,
    masked: v ? maskSecret(v) : '',
    updatedAt: row ? row.updatedAt : null,
    updatedBy: row ? row.updatedBy : null,
  };
}

/** 画面表示用のマスク。先頭数文字と末尾4文字だけ残す。 */
export function maskSecret(k) {
  const s = String(k || '');
  if (!s) return '';
  if (s.length < 12) return '****';
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

export async function saveSecret(dbKey, value, by) {
  if (!SUPA_URL || !SERVICE_KEY) return { error: 'サーバー設定エラー: Supabase の環境変数が未設定です' };
  const r = await fetch(`${SUPA_URL}/rest/v1/app_secrets?on_conflict=key`, {
    method: 'POST',
    headers: { ...sbHeaders(), Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ key: dbKey, value: String(value), updated_at: new Date().toISOString(), updated_by: String(by || '管理局') }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    if (/app_secrets/.test(t) && /(does not exist|Could not find)/i.test(t)) {
      return { error: '保存先のテーブル(app_secrets)がまだありません。Supabase の SQL Editor で docs/sql/app_secrets.sql を1回実行してください。', needsTable: true };
    }
    return { error: '保存に失敗しました: ' + t.slice(0, 200) };
  }
  _cache = { at: 0, map: null }; // 次の参照で読み直す
  return { ok: true };
}

export async function deleteSecret(dbKey) {
  if (!SUPA_URL || !SERVICE_KEY) return { error: 'サーバー設定エラー' };
  const r = await fetch(`${SUPA_URL}/rest/v1/app_secrets?key=eq.${encodeURIComponent(dbKey)}`, { method: 'DELETE', headers: sbHeaders() });
  if (!r.ok) return { error: '削除に失敗しました' };
  _cache = { at: 0, map: null };
  return { ok: true };
}
