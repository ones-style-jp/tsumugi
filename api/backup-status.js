// Vercel Serverless Function: 写真の控え(AWS S3)の「最後の実行」を管理局に見せる(2026-11-16)
//
// POST /api/backup-status { secret } または { token }
//   secret = ADMIN_API_SECRET(管理局の合言葉・admin-secrets と同じ)
//   token  = 職員の証(staff-auth が発行)。本部(super_admin)だけ
//   → { ok, configured, bucket, region, lastRun:{ startedAt, finishedAt, copied, skipped, remaining, errorCount, totalFiles, totalStores, appState }, manifestUpdatedAt }
//   値(鍵)は返さない。S3 の manifest/last_run.json と manifest/latest.json を読むだけ(書かない)。
import crypto from 'crypto';
import { s3FromSecrets, awsConfig, maskAws } from './_s3.js';

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const unb64u = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
const sigStaff = (payload) => crypto.createHmac('sha256', 'tsumugi-staff-token|' + SERVICE_KEY).update(payload).digest('hex'); // staff-auth.js と同じ
function readStaff(token) {
  try {
    const [payload, sig] = String(token || '').split('.'); if (!payload || !sig) return null;
    const expect = sigStaff(payload);
    if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
    const t = JSON.parse(unb64u(payload)); if (!t || !t.sid || !t.exp || Date.now() > Number(t.exp)) return null;
    return t;
  } catch { return null; }
}
const secretOk = (given) => {
  const want = String(process.env.ADMIN_API_SECRET || '');
  if (!want) return false;
  const a = crypto.createHash('sha256').update(want).digest();
  const b = crypto.createHash('sha256').update(String(given || '')).digest();
  return crypto.timingSafeEqual(a, b);
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  let body = req.body; if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } } body = body || {};
  const st = body.token ? readStaff(body.token) : null;
  const authed = (st && st.role === 'super_admin') || secretOk(body.secret);
  if (!authed) return res.status(401).json({ error: '本部だけが見られます' });
  try {
    const cfg = await awsConfig();
    if (!cfg.configured) return res.status(200).json({ ok: true, configured: false, message: 'AWS の設定がまだありません(外部サービス設定 → AWS S3（写真の控え）)' });
    const s3 = await s3FromSecrets();
    const lastRun = await s3.getJson('manifest/last_run.json', null);
    const manifest = await s3.getJson('manifest/latest.json', null);
    const pick = lastRun ? {
      startedAt: lastRun.startedAt, finishedAt: lastRun.finishedAt, elapsedMs: lastRun.elapsedMs, trigger: lastRun.trigger, dryRun: !!lastRun.dryRun,
      ok: !!lastRun.ok, listed: lastRun.listed, copied: lastRun.copied, skipped: lastRun.skipped, remaining: lastRun.remaining,
      errorCount: lastRun.errorCount ?? (Array.isArray(lastRun.errors) ? lastRun.errors.length : 0), errors: Array.isArray(lastRun.errors) ? lastRun.errors.slice(0, 10) : [],
      appState: lastRun.appState || null, totalFiles: lastRun.totalFiles, totalStores: lastRun.totalStores,
    } : null;
    return res.status(200).json({
      ok: true, configured: true, bucket: cfg.bucket, region: cfg.region,
      lastRun: pick,
      manifestUpdatedAt: manifest ? manifest.updatedAt || null : null,
      totalFiles: manifest ? Object.keys(manifest.files || {}).length : 0,
      stores: manifest ? Object.entries(manifest.appState || {}).map(([k, v]) => ({ store: k, date: v && v.date, version: v && v.version })) : [],
    });
  } catch (e) {
    return res.status(200).json({ ok: false, configured: true, error: maskAws(String((e && e.message) || e)).slice(0, 300) });
  }
}
