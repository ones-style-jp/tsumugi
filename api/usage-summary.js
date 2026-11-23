// Vercel Serverless Function: 従量課金のサービスの「利用量と概算の料金」を管理局に見せる(2026-11-23 trial621)
//
// POST /api/usage-summary { secret }   secret = ADMIN_API_SECRET(管理局の合言葉・admin-secrets と同じ)
//   → { ok, at, rates, aws, interfax, brevo, unavailable:[…] }
//   aws      … S3 に置いてある数・容量(種類ごと)・概算の保管料・控えに失敗しているファイル(manifest/latest.json の failed)
//   interfax … 残高と、今月に送ったFAXの通数・枚数・料金(InterFAX 側の記録 units × costPerUnit)
//   brevo    … 今月のメール送信数(Brevo の集計)
//   鍵や値は返さない。読むだけで何も書かない。
//   概算の単価はこのファイルの RATES(S3 標準 大阪 $0.025/GB・月、1ドル=150円)。正確な請求は各サービスの管理画面で。
import crypto from 'crypto';
import { getSecret } from './_secrets.js';
import { s3FromSecrets, awsConfig } from './_s3.js';

const RATES = { s3UsdPerGbMonth: 0.025, usdJpy: 150, brevoFreePerDay: 300, anthropicUsdPerM: { haiku: [1, 5], sonnet: [3, 15], opus: [15, 75], other: [3, 15] } }; // Claude は [入力, 出力] ドル/100万トークン(概算)

const secretOk = (given) => {
  const want = String(process.env.ADMIN_API_SECRET || '');
  if (!want) return false;
  const a = crypto.createHash('sha256').update(want).digest();
  const b = crypto.createHash('sha256').update(String(given || '')).digest();
  return crypto.timingSafeEqual(a, b);
};
const monthStartJst = () => { const now = new Date(Date.now() + 9 * 3600e3); return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 9 * 3600e3); }; // JST の月初(UTC 時刻で)
const withTimeout = (p, ms, label) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${label}: ${ms / 1000}秒以内に返事がありません`)), ms))]);

async function awsPart() {
  const cfg = await awsConfig();
  if (!cfg.configured) return { configured: false };
  const s3 = await s3FromSecrets();
  const items = await withTimeout(s3.listAll('', 100000), 40000, 'S3 の一覧');
  const by = { photos: { n: 0, bytes: 0 }, appState: { n: 0, bytes: 0 }, records: { n: 0, bytes: 0 }, tables: { n: 0, bytes: 0 }, other: { n: 0, bytes: 0 } };
  let bytes = 0;
  for (const it of items) {
    const k = String(it.key || ''); const g = k.startsWith('pf/') ? 'photos' : k.startsWith('app_state/') ? 'appState' : k.startsWith('ticket_records/') ? 'records' : k.startsWith('tables/') ? 'tables' : 'other';
    by[g].n += 1; by[g].bytes += Number(it.size) || 0; bytes += Number(it.size) || 0;
  }
  const gb = bytes / 1073741824;
  const manifest = await s3.getJson('manifest/latest.json', null);
  const failedMap = (manifest && manifest.failed) || {};
  const failed = Object.entries(failedMap).map(([path, v]) => ({ path, count: Number(v && v.count) || 0, error: String((v && v.error) || '').slice(0, 160), at: (v && v.at) || null, firstAt: (v && v.firstAt) || null }))
    .sort((a, b) => String(b.at || '').localeCompare(String(a.at || ''))).slice(0, 30);
  return { configured: true, bucket: cfg.bucket, region: cfg.region, objects: items.length, bytes, gb: Math.round(gb * 1000) / 1000, by,
    estUsdMonth: Math.round(gb * RATES.s3UsdPerGbMonth * 1000) / 1000, estJpyMonth: Math.round(gb * RATES.s3UsdPerGbMonth * RATES.usdJpy),
    failedCount: Object.keys(failedMap).length, failed, manifestUpdatedAt: manifest ? manifest.updatedAt || null : null };
}

async function interfaxPart() {
  const user = await getSecret('INTERFAX_USER', 'interfax_user');
  const pass = await getSecret('INTERFAX_PASS', 'interfax_pass');
  if (!user || !pass) return { configured: false };
  const auth = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
  const H = { Authorization: auth, Accept: 'application/json' };
  const out = { configured: true, balance: null, month: { count: 0, pages: 0, units: 0, cost: 0, failed: 0 }, note: '' };
  try { const r = await withTimeout(fetch('https://rest.interfax.net/accounts/self/ppcards/balance', { headers: H }), 15000, 'InterFAX 残高'); const t = await r.text().catch(() => ''); if (r.ok) out.balance = String(t).trim().slice(0, 20); else out.note += `残高: HTTP ${r.status}。`; } catch (e) { out.note += `残高: ${String(e.message || e).slice(0, 80)}。`; }
  // 今月の送信(新しい順に 100 件ずつ・月初より前が出たら止める・最大 10 ページ)
  try {
    const start = monthStartJst(); let lastId = null; let pages = 0; let stop = false;
    while (!stop && pages < 10) {
      const url = `https://rest.interfax.net/outbound/faxes?limit=100${lastId ? `&lastId=${encodeURIComponent(lastId)}` : ''}`;
      const r = await withTimeout(fetch(url, { headers: H }), 15000, 'InterFAX 送信の一覧'); if (!r.ok) { out.note += `送信の一覧: HTTP ${r.status}。`; break; }
      const list = await r.json().catch(() => []); if (!Array.isArray(list) || !list.length) break;
      for (const f of list) {
        const t = f && (f.completionTime || f.submitTime); const when = t ? new Date(t) : null;
        if (when && when < start) { stop = true; break; }
        const ok = Number(f.status) === 0;
        if (ok) { out.month.count += 1; out.month.pages += Number(f.pagesSent || f.pageCount || 0) || 0; out.month.units += Number(f.units || 0) || 0; out.month.cost += (Number(f.units || 0) || 0) * (Number(f.costPerUnit || 0) || 0); }
        else out.month.failed += 1;
      }
      lastId = list[list.length - 1] && list[list.length - 1].id; pages += 1; if (list.length < 100) break;
    }
    out.month.cost = Math.round(out.month.cost * 100) / 100;
  } catch (e) { out.note += `送信の一覧: ${String(e.message || e).slice(0, 80)}。`; }
  return out;
}

// Claude(AI)の今月: ai-draft が S3 に残した usage/anthropic/<年月>/…-<系統>-i<入力>-o<出力>-s<店舗>.json を一覧だけで集計(中身は読まない)
async function anthropicPart() {
  const cfg = await awsConfig();
  if (!cfg.configured) return { configured: false, why: 'AWS の控えが未設定のため記録していません' };
  const s3 = await s3FromSecrets(); const ym = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7);
  const items = await withTimeout(s3.listAll(`usage/anthropic/${ym}/`, 100000), 30000, 'AI の記録の一覧');
  const month = { calls: 0, input: 0, output: 0, estUsd: 0 }; const byStore = {}; const byFam = {};
  for (const it of items) {
    const m = /-(haiku|sonnet|opus|other)-i(\d+)-o(\d+)-s([A-Za-z0-9_-]*)\.json$/.exec(String(it.key || '')); if (!m) continue;
    const fam = m[1], inp = Number(m[2]) || 0, outp = Number(m[3]) || 0, sid = m[4] || 'unknown'; const r = RATES.anthropicUsdPerM[fam] || RATES.anthropicUsdPerM.other;
    const usd = (inp * r[0] + outp * r[1]) / 1e6;
    month.calls += 1; month.input += inp; month.output += outp; month.estUsd += usd;
    byStore[sid] = byStore[sid] || { calls: 0, input: 0, output: 0 }; byStore[sid].calls += 1; byStore[sid].input += inp; byStore[sid].output += outp;
    byFam[fam] = (byFam[fam] || 0) + 1;
  }
  month.estUsd = Math.round(month.estUsd * 1000) / 1000; month.estJpy = Math.round(month.estUsd * RATES.usdJpy);
  return { configured: true, ym, month, byStore, byFam, since: '2026-11-24' };
}

async function brevoPart() {
  const key = await getSecret('BREVO_API_KEY', 'brevo_api_key');
  if (!key) return { configured: false };
  const start = monthStartJst(); const d0 = new Date(start.getTime() + 9 * 3600e3).toISOString().slice(0, 10); const d1 = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  try {
    const r = await withTimeout(fetch(`https://api.brevo.com/v3/smtp/statistics/aggregatedReport?startDate=${d0}&endDate=${d1}`, { headers: { 'api-key': key, accept: 'application/json' } }), 15000, 'Brevo の集計');
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { configured: true, error: (j && j.message) || `HTTP ${r.status}` };
    return { configured: true, from: d0, to: d1, requests: Number(j.requests) || 0, delivered: Number(j.delivered) || 0, hardBounces: Number(j.hardBounces) || 0, softBounces: Number(j.softBounces) || 0, blocked: Number(j.blocked) || 0, spamReports: Number(j.spamReports) || 0, freePerDay: RATES.brevoFreePerDay };
  } catch (e) { return { configured: true, error: String(e.message || e).slice(0, 120) }; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  let body = req.body; if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } } body = body || {};
  if (!secretOk(body.secret)) return res.status(401).json({ error: '本部だけが見られます' });
  const safe = async (fn, label) => { try { return await fn(); } catch (e) { return { configured: true, error: `${label}: ${String((e && e.message) || e).replace(/AKIA[0-9A-Z]{12,}/g, 'AKIA…').slice(0, 160)}` }; } };
  const [aws, interfax, brevo, anthropic] = await Promise.all([safe(awsPart, 'AWS'), safe(interfaxPart, 'InterFAX'), safe(brevoPart, 'Brevo'), safe(anthropicPart, 'Claude')]);
  return res.status(200).json({ ok: true, at: new Date().toISOString(), rates: RATES, aws, interfax, brevo, anthropic,
    unavailable: [
      { id: 'supabase', name: 'Supabase（データベース・写真の置き場）', why: '利用量は Supabase の管理画面(Usage)でだけ見られます。つむぎの鍵では取れません' },
      { id: 'vercel', name: 'Vercel（配信・サーバー）', why: '通信量は Vercel の管理画面(Usage)でだけ見られます' },
      { id: 'gmail', name: 'Google メール', why: '無料の範囲(1日 500 通まで)。件数は Gmail の送信済みで' },
    ] });
}
