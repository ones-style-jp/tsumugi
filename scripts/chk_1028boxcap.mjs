// 2026-10-28 計画書の欄の制限(印刷の枠に入る量): 上限いっぱいに入れても印刷の枠が伸びない・A4からはみ出さない(長い1行・改行で行いっぱい の2通り)
//   と、画面で上限を超えて入れると入る分だけになる。枠の値は App.jsx の TSU_BOXCAP をそのまま読む
import { chromium } from 'playwright'; import fs from 'node:fs';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4173'; })();
const src = fs.readFileSync('src/App.jsx', 'utf8'); const CAP = Function('return ' + src.match(/const TSU_BOXCAP = (\{[\s\S]*?\n\});/)[1])();
const wrap = (b) => 'あ'.repeat(Math.floor(b.l * b.c - (b.p || 0)));
const lines = (b) => Array.from({ length: b.l }, (_, i) => 'あ'.repeat(i === 0 ? b.c - (b.p || 0) : b.c)).join('\n');
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ja-JP' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
const K = 'daycareAppData_v3'; const r = {};
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
const ids = await page.evaluate((K) => { const d = JSON.parse(localStorage.getItem(K)); const ps = (d.patients || []).filter(p => p.status === '利用中'); ps[0].careLevel = '要介護2'; ps[1].careLevel = '要支援1'; localStorage.setItem(K, JSON.stringify(d)); return { A: ps[0].id, B: ps[1].id }; }, K);
const recFor = (kind, fill) => { const T = { tk: CAP.tk, tkS: CAP.tkS, kk: CAP.kk, sk: CAP.sk, ky: CAP.ky }[kind]; const v = (k) => fill && T[k] ? fill(T[k]) : '';
  const base = { createdAt: 9e12, createdDate: '令和8年10月28日', recordDate: '令和8年10月28日' };
  if (kind === 'tk' || kind === 'tkS') { const n = kind === 'tk' ? 5 : 4; const o = { ...base, id: 'bc_' + kind, planType: kind === 'tk' ? 'kaigo' : 'shien', flow: [], services: Array.from({ length: 5 }, (_, i) => ({ from: '', to: '', content: i < n ? v('svcContent') : '', effect: i < n ? v('svcEffect') : '', jisshi: '', tassei: '' })) };
    ['keii', 'honninKibou', 'kazokuKibou', 'shakaiSanka', 'kyotakuKankyo', 'kenkoJotai', 'iryoRisk', 'longGoal', 'shortGoal', 'tokki', 'soukatsu', 'cpGaiyou'].forEach(k => { o[k] = v(k); });
    if (kind === 'tkS') o.exercises = fill ? Array.from({ length: 8 }, () => ({ content: fill({ ...T.exContent, l: 1 }), amount: fill({ ...T.exAmount, l: 1 }), freq: fill({ ...T.exFreq, l: 1 }), note: fill({ ...T.exNote, l: 1 }) })) : [];
    return o; }
  if (kind === 'kk') { const o = { ...base, id: 'bc_kk', programs: [] }; Object.keys(T).forEach(k => { o[k] = v(k); }); return o; }
  if (kind === 'sk') return { ...base, id: 'bc_sk', adl: {}, kikyo: {}, iadl: {}, shinshin: {}, ninchi: v('ninchi'), kadai: v('kadai'), bikou: v('bikou') };
  return { ...base, id: 'bc_ky', items: {}, custom: [], bikou: fill ? v('bikou') : ' ' }; };
const SHEETS = { tk: ['tsushoKeikakuRecords', 'tsusho_keikaku', 'A', 'tk-print-area', 'fixed'], tkS: ['tsushoKeikakuRecords', 'tsusho_keikaku', 'B', 'tk-print-area', 'fixed'], kk: ['kinouKeikakuRecords', 'kinou_keikaku', 'A', 'kk-print-area', 'fixed'], sk: ['seikatsuKinouRecords', 'seikatsu_kinou', 'A', 'sk-print-area', 'flow'], ky: ['kyomiKanshinRecords', 'kyomi_kanshin', 'A', 'ki-print-area', 'flow'] };
const measure = async (kind, fill) => { const [arr, view, who, id] = SHEETS[kind]; const pid = ids[who]; const rec = { ...recFor(kind, fill), patientId: pid };
  await page.evaluate(([K, arr, pid, rec, v]) => { const d = JSON.parse(localStorage.getItem(K)); d[arr] = [...(d[arr] || []).filter(x => x.patientId !== pid), rec]; localStorage.setItem(K, JSON.stringify(d)); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid, t: Date.now() })); }, [K, arr, pid, rec, view]);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800);
  const html = await page.evaluate((id) => { const el = document.getElementById(id); if (!el) return ''; const c = el.cloneNode(true); c.style.display = 'block'; return id === 'tk-print-area' ? c.innerHTML : c.outerHTML; }, id);
  const m = await ctx.newPage(); await m.setViewportSize({ width: 794, height: 1123 }); await m.setContent(`<html><body style="margin:0;width:794px">${html}</body></html>`); await m.waitForTimeout(250);
  const res = await m.evaluate(() => { const root = document.body.firstElementChild; const cells = {}; document.querySelectorAll('[data-cap]').forEach(el => { const k = el.getAttribute('data-cap'); cells[k] = Math.max(cells[k] || 0, el.getBoundingClientRect().height); });
    const sh = root.querySelector('.kk-sheet') || root; return { H: root.getBoundingClientRect().height, sh: sh.scrollHeight, cells }; });
  await m.close(); return res; };
for (const kind of Object.keys(SHEETS)) {
  const mode = SHEETS[kind][4]; const base = await measure(kind, null);
  for (const [vn, fn] of [['wrap', wrap], ['lines', lines]]) {
    const full = await measure(kind, fn); const bad = [];
    if (mode === 'fixed') { if (full.H > base.H + 0.5) bad.push(`sheet ${base.H}->${full.H}`); Object.keys(base.cells).forEach(k => { if (full.cells[k] > base.cells[k] + 0.5) bad.push(`${k} ${Math.round(base.cells[k])}->${Math.round(full.cells[k])}`); }); }
    else if (full.H > 1123.5) bad.push(`page ${Math.round(full.H)}`);
    r[`${kind}_${vn}`] = bad.length === 0; if (bad.length) console.log(kind, vn, bad.slice(0, 6).join(' | '));
  }
}
// 画面: 上限を超えて入れると入る分だけ(1行の目標・改行で行いっぱい・1行目に（機能）がある欄)・残りの字数
await page.evaluate(([K, pid]) => { const d = JSON.parse(localStorage.getItem(K)); d.tsushoKeikakuRecords = (d.tsushoKeikakuRecords || []).filter(x => x.patientId !== pid); d.kinouKeikakuRecords = (d.kinouKeikakuRecords || []).filter(x => x.patientId !== pid); localStorage.setItem(K, JSON.stringify(d)); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'tsusho_keikaku', pid, t: Date.now() })); }, [K, ids.A]);
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800);
await page.locator('button', { hasText: '＋ 新規作成' }).first().click(); await page.waitForTimeout(500);
const box = (label) => page.locator('label', { hasText: new RegExp('^' + label) }).first().locator('xpath=../..'); const fld = (label) => box(label).locator('textarea, input').first();
await fld('通所介護利用までの経緯').fill('あ\nい\nう\nえ\nお'); await page.waitForTimeout(150);
r.uiLinesCut = (await fld('通所介護利用までの経緯').inputValue()) === 'あ\nい\nう';
await fld('通所介護利用までの経緯').fill('あ'.repeat(10)); await page.waitForTimeout(150);
r.uiLeft = (await box('通所介護利用までの経緯').getByTestId('box-count').innerText()).includes(`あと${CAP.tk.keii.c * CAP.tk.keii.l - 10}字`);
const sv = page.getByText('目的とケアの提供方針・内容', { exact: true }).first().locator('xpath=../..').locator('textarea').first();
await sv.fill('あ'.repeat(60)); await page.waitForTimeout(150); r.uiOneLine = (await sv.inputValue()).length === CAP.tk.svcContent.c;
await page.evaluate(([K, pid]) => { sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'kinou_keikaku', pid, t: Date.now() })); }, [K, ids.A]);
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); await page.locator('button', { hasText: '＋ 新規作成' }).first().click(); await page.waitForTimeout(500);
const kf = page.getByText('（機能）', { exact: true }).first().locator('xpath=../..').locator('textarea').first();
await kf.fill('あ'.repeat(60)); await page.waitForTimeout(150); r.uiPrefix = (await kf.inputValue()).length === CAP.kk.shortKinou.c - CAP.kk.shortKinou.p;
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
