// 2026-10-28 計画書の印刷の枠(data-cap)に、全角で 1行に何字・何行 入るかを測る(見本データ・見本ビルドを配信してから)
//   node scripts/measure_boxcap.mjs --port 4175 > boxcap.json
//   c=1行の字数(全角) / p=1行目の前に印刷される字(「（機能）」など) / l=行数。改行は1行を使い切る。3-2 は3つの欄で余りを分ける
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4175'; })();
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ja-JP' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept());
const K = 'daycareAppData_v3';
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
const ids = await page.evaluate((K) => { const d = JSON.parse(localStorage.getItem(K)); const ps = (d.patients || []).filter(p => p.status === '利用中'); const A = ps[0], B = ps[1]; A.careLevel = '要介護2'; B.careLevel = '要支援1';
  const keep = (arr) => (arr || []).filter(x => x.patientId !== A.id && x.patientId !== B.id);
  const blank5 = Array.from({ length: 5 }, () => ({ from: '', to: '', content: '', jisshi: '', tassei: '', effect: '' }));
  d.tsushoKeikakuRecords = [...keep(d.tsushoKeikakuRecords), { id: 'cap_tk', patientId: A.id, createdAt: 9e12, createdDate: '令和8年10月28日', planType: 'kaigo', services: blank5, flow: [] }, { id: 'cap_tks', patientId: B.id, createdAt: 9e12, createdDate: '令和8年10月28日', planType: 'shien', services: blank5, flow: [], exercises: [] }];
  d.kinouKeikakuRecords = [...keep(d.kinouKeikakuRecords), { id: 'cap_kk', patientId: A.id, createdAt: 9e12, createdDate: '令和8年10月28日', programs: [] }];
  d.seikatsuKinouRecords = [...keep(d.seikatsuKinouRecords), { id: 'cap_sk', patientId: A.id, createdAt: 9e12, recordDate: '令和8年10月28日', adl: {}, kikyo: {}, iadl: {}, shinshin: {} }];
  d.kyomiKanshinRecords = [...keep(d.kyomiKanshinRecords), { id: 'cap_ky', patientId: A.id, createdAt: 9e12, recordDate: '令和8年10月28日', items: {}, custom: [], bikou: ' ' }];
  localStorage.setItem(K, JSON.stringify(d)); return { A: A.id, B: B.id }; }, K);
const grab = async (view, pid, id) => { await page.evaluate(([v, p]) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: p, t: Date.now() })), [view, pid]); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
  return page.evaluate((id) => { const el = document.getElementById(id); if (!el) return ''; const c = el.cloneNode(true); c.style.display = 'block'; return id === 'tk-print-area' ? c.innerHTML : c.outerHTML; }, id); };
const sheets = [['tk', 'tsusho_keikaku', ids.A, 'tk-print-area', 'fixed'], ['tkS', 'tsusho_keikaku', ids.B, 'tk-print-area', 'fixed'], ['kk', 'kinou_keikaku', ids.A, 'kk-print-area', 'fixed'], ['sk', 'seikatsu_kinou', ids.A, 'sk-print-area', 'flow'], ['ky', 'kyomi_kanshin', ids.A, 'ki-print-area', 'flow']];
const out = {};
for (const [name, view, pid, id, mode] of sheets) {
  const html = await grab(view, pid, id); if (!html) { out[name] = { error: 'no print area' }; continue; }
  const m = await ctx.newPage(); await m.setViewportSize({ width: 794, height: 1123 }); await m.setContent(`<html><body style="margin:0;width:794px">${html}</body></html>`); await m.waitForTimeout(300);
  out[name] = await m.evaluate((mode) => {
    const root = document.body.firstElementChild; const res = {}; const seen = new Set();
    for (const el of document.querySelectorAll('[data-cap]')) { const key = el.getAttribute('data-cap'); if (seen.has(key)) continue; seen.add(key);
      const H0 = root.getBoundingClientRect().height; const h0 = el.getBoundingClientRect().height;
      const span = document.createElement('span'); el.appendChild(span);
      const lines = (t) => { span.textContent = t; return new Set([...span.getClientRects()].filter(r => r.width > 0.5).map(r => Math.round(r.top))).size; };
      let c1 = 0; for (let n = 1; n < 160; n++) { if (lines('あ'.repeat(n)) > 1) break; c1 = n; }
      let c = 0; for (let n = 1; n < 160; n++) { if (lines('あ\n' + 'あ'.repeat(n)) > 2) break; c = n; }
      const ok = () => mode === 'fixed' ? (el.getBoundingClientRect().height <= h0 + 0.5 && root.getBoundingClientRect().height <= H0 + 0.5) : root.getBoundingClientRect().height <= 1123.5;
      let l = 0; for (let L = 1; L < 60; L++) { span.textContent = Array(L).fill('あ').join('\n'); if (!ok()) break; l = L; }
      span.remove(); res[key] = { c, p: Math.max(0, c - c1), l };
    }
    return res; }, mode);
  await m.close();
}
console.log(JSON.stringify(out, null, 1)); await b.close();
