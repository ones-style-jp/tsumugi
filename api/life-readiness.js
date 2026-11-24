// Vercel Serverless Function: 全店の「LIFE 提出の準備状況」を管理局に見せる(2026-11-24 trial634)
//
// POST /api/life-readiness { secret, ym? }   secret = ADMIN_API_SECRET(管理局の合言葉・admin-secrets と同じ)・ym = 提出年月 'YYYY-MM'(省略=今月)
//   → { ok, at, ym, stores: [ { key, name, isTest, addons, office, patients, forms: { adl, seikatsu, kinou } } ] }
//   各店舗の app_state を読み、件数だけを数える(氏名・被保険者番号などの個人情報は返さない)。読むだけで何も書かない。
//   数え方は LIFE 提出ダッシュボード(App.jsx _lifeRowsFor)と同じ: 様式の元データごとに利用者の最新の評価を見る。
//     adl=ADL評価(adlRecords.evalDate)→科学的介護推進/ADL維持等、seikatsu=生活機能チェック(seikatsuKinouRecords.recordDate 和暦)、kinou=個別機能訓練計画書(kinouKeikakuRecords.createdDate 和暦)
//     recent=最新の評価が提出年月から3か月以内・old=3か月より前・none=評価なし。utilization=利用中(退所・終了・利用終了日を過ぎた方を除く)
import crypto from 'crypto';

const SUPA_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const secretOk = (given) => {
  const want = String(process.env.ADMIN_API_SECRET || '');
  if (!want) return false;
  const a = crypto.createHash('sha256').update(want).digest();
  const b = crypto.createHash('sha256').update(String(given || '')).digest();
  return crypto.timingSafeEqual(a, b);
};
async function sbJson(path) {
  const r = await fetch(`${SUPA_URL}/rest/v1/${path}`, { headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY } });
  if (!r.ok) throw new Error(`supabase ${r.status} ${path.slice(0, 60)}`);
  return r.json();
}
// 日付の読み取り(個人情報は使わない): 'YYYY-MM-DD' / '令和n年m月d日' / 'YYYY/MM/DD' / 'YYYYMMDD' → 'YYYYMM'(読めなければ '')
const ymOf = (s) => {
  const t = String(s || '').trim(); if (!t) return '';
  let m = t.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/); if (m) return `${m[1]}${String(m[2]).padStart(2, '0')}`;
  m = t.match(/令和\s*(\d+)\s*年\s*(\d+)\s*月/); if (m) return `${2018 + Number(m[1])}${String(m[2]).padStart(2, '0')}`;
  m = t.match(/^(\d{4})(\d{2})(\d{2})$/); if (m) return `${m[1]}${m[2]}`;
  m = t.match(/(\d{4})\s*年\s*(\d{1,2})\s*月/); if (m) return `${m[1]}${String(m[2]).padStart(2, '0')}`;
  return '';
};
const isoAny = (s) => { const t = String(s || '').trim(); let m = t.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/); if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`; m = t.match(/令和\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/); if (m) return `${2018 + Number(m[1])}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`; return ''; };
const todayIso = () => { const d = new Date(Date.now() + 9 * 3600e3); return d.toISOString().slice(0, 10); };
const monthsDiff = (ymA, ymB) => (Number(ymA.slice(0, 4)) * 12 + Number(ymA.slice(4, 6))) - (Number(ymB.slice(0, 4)) * 12 + Number(ymB.slice(4, 6)));

function summarize(data, ym) {
  const d = (data && typeof data === 'object') ? data : {};
  const ss = d.systemSettings || {}; const fi = ss.facilityInfo || {}; const ad = ss.addons || {};
  const today = todayIso();
  const pats = (Array.isArray(d.patients) ? d.patients : []).filter(p => p && p.id != null && String(p.name || '').trim());
  const active = pats.filter(p => { if (/退所|終了/.test(String(p.status || ''))) return false; const e = isoAny(p.endDate); return !(e && e < today); });
  const digits = (v) => String(v == null ? '' : v).normalize('NFKC').replace(/\D/g, '');
  const insuredOk = active.filter(p => digits(p.insuranceNo).length === 10).length;
  const insuredShort = active.filter(p => { const n = digits(p.insuranceNo).length; return n > 0 && n < 10; }).length;
  const insurerOk = active.filter(p => digits(p.insurerNo || fi.insurerNo).length === 6).length;
  const basic4 = active.filter(p => digits(p.insuranceNo).length === 10 && digits(p.insurerNo || fi.insurerNo).length === 6 && String(p.gender || '').trim() && isoAny(p.birthDate)).length;
  const levelOk = active.filter(p => { const fs = (p.personalFile && p.personalFile.faceSheet) || {}; return String(fs.adlLevel || '').trim() && String(fs.dementiaLevel || '').trim(); }).length;
  const ymKey = String(ym || '').replace('-', '');
  const formOf = (recs, pidOf, ymGet) => {
    const latest = new Map();
    (Array.isArray(recs) ? recs : []).forEach(r => { if (!r) return; const pid = String(pidOf(r)); const y = ymGet(r); if (!y) return; const cur = latest.get(pid); if (!cur || y > cur) latest.set(pid, y); });
    let recent = 0, old = 0, none = 0, thisMonth = 0, lastMonth = 0; const byMonth = {};
    const lm = (() => { const y = Number(ymKey.slice(0, 4)), m = Number(ymKey.slice(4, 6)); const d2 = new Date(y, m - 2, 1); return `${d2.getFullYear()}${String(d2.getMonth() + 1).padStart(2, '0')}`; })();
    active.forEach(p => { const y = latest.get(String(p.id)); if (!y) { none++; return; } const diff = monthsDiff(ymKey, y); if (diff <= 3) recent++; else old++; if (y === ymKey) thisMonth++; if (y === lm) lastMonth++; byMonth[y] = (byMonth[y] || 0) + 1; });
    const months = Object.keys(byMonth).sort().slice(-6).map(k => ({ ym: k, n: byMonth[k] }));
    return { recent, old, none, thisMonth, lastMonth, months };
  };
  return {
    addons: { kagaku: !!ad.kasan_kagaku, adl: !!ad.kasan_adl, kinou2: !!ad.kasan_kinou2 },
    office: { officeNumber: String(fi.officeNumber || ''), serviceCode: String(fi.serviceCode || ''), officeNumber2: String(fi.officeNumber2 || ''), serviceCode2: String(fi.serviceCode2 || ''), insurerNo: String(fi.insurerNo || ''), defaultJob: String(fi.lifeDefaultJob || ''), trinity: fi.lifeTrinity == null ? null : Number(fi.lifeTrinity) },
    patients: { total: pats.length, active: active.length, insuredOk, insuredShort, insurerOk, basic4, levelOk },
    forms: {
      adl: formOf(d.adlRecords, r => r.patientId, r => ymOf(r.evalDate)),
      seikatsu: formOf(d.seikatsuKinouRecords, r => r.patientId, r => ymOf(r.recordDate)),
      kinou: formOf(d.kinouKeikakuRecords, r => r.patientId, r => ymOf(r.createdDate)),
    },
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST のみ' });
  let body = req.body; if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } } body = body || {};
  if (!secretOk(body.secret)) return res.status(401).json({ error: '合言葉が違います' });
  if (!SUPA_URL || !SERVICE_KEY) return res.status(500).json({ error: 'サーバーの設定がありません(SUPABASE_URL / SERVICE_ROLE_KEY)' });
  const ym = /^\d{4}-\d{2}$/.test(String(body.ym || '')) ? String(body.ym) : (() => { const d = new Date(Date.now() + 9 * 3600e3); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; })();
  try {
    const [keys, stores] = await Promise.all([
      sbJson('app_state?select=key,version,updated_at&key=like.store_*&order=key.asc'),
      sbJson('stores?select=id,name,short_name').catch(() => []),
    ]);
    const nameOf = new Map((Array.isArray(stores) ? stores : []).map(s => [String(s.id), String(s.short_name || s.name || '')]));
    const out = [];
    for (const k of (Array.isArray(keys) ? keys : [])) {
      const key = String(k.key || ''); if (!key.startsWith('store_')) continue;
      const sid = key.slice('store_'.length);
      let row = null; try { const rows = await sbJson(`app_state?select=data&key=eq.${encodeURIComponent(key)}&limit=1`); row = Array.isArray(rows) ? rows[0] : null; } catch (e) { out.push({ key, name: nameOf.get(sid) || '', isTest: /test|shisaku/.test(sid), error: String(e && e.message || e).slice(0, 80) }); continue; }
      const data = row && row.data; const fi = (data && data.systemSettings && data.systemSettings.facilityInfo) || {};
      out.push({ key, name: nameOf.get(sid) || String(fi.name || '') || sid, isTest: /test|shisaku/.test(sid), version: k.version, updatedAt: k.updated_at, ...summarize(data, ym) });
    }
    return res.status(200).json({ ok: true, at: new Date().toISOString(), ym, stores: out });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e).slice(0, 160) });
  }
}
