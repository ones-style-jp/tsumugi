// 2026-10-27 評価・計画(3か月ごと)で「前回の内容を写す」: 新しい評価のときだけ出る・押すと前回のADLなどが入る(評価日は今日のまま)・前の日の評価を開いたときは出ない
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4173'; })();
const b = await chromium.launch(); const r = {};
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ja-JP' });
const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
const PREV = { eat: 10, transfer: 10, groom: 5, toilet: 5, bath: 0, walk: 10, stairs: 5, dress: 5, stool: 10, urine: 5 };
const pid = await page.evaluate((PREV) => { const k = 'daycareAppData_v3'; const d = JSON.parse(localStorage.getItem(k));
  d.systemSettings = d.systemSettings || {}; d.systemSettings.addons = { ...(d.systemSettings.addons || {}), kasan_kagaku: true };
  const p = (d.patients || []).find(x => x.status === '利用中'); const id = p.id;
  ['adlRecords', 'seikatsuKinouRecords', 'kyomiKanshinRecords'].forEach(key => { d[key] = (d[key] || []).filter(x => x.patientId !== id); });
  d.adlRecords.push({ id: 'adl_chk_prev', patientId: id, evalDate: '2026-07-15', evaluator: '', items: PREV, science: {} });
  localStorage.setItem(k, JSON.stringify(d)); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'kinou_patient', pid: id, t: Date.now() })); return id; }, PREV);
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2200); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
await page.getByTestId('kk-start').click(); await page.waitForTimeout(900);
r.shownForNew = (await page.getByTestId('kk-copy-prev').count()) === 1 && /2026\/07\/15/.test(await page.getByTestId('kk-copy-prev-box').innerText());
await page.getByTestId('kk-copy-prev').click(); await page.waitForTimeout(300);
r.copiedNote = /写しました/.test(await page.getByTestId('kk-copy-prev-box').innerText()) && (await page.getByTestId('kk-copy-prev').count()) === 0;
await page.locator('button', { hasText: /^一時保存$/ }).first().click(); await page.waitForTimeout(900);
const today = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
const saved = await page.evaluate(([pid, today]) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); return (d.adlRecords || []).find(x => x.patientId === pid && x.evalDate === today) || null; }, [pid, today]);
r.savedToday = !!saved && Object.entries(PREV).every(([k, v]) => Number(saved.items[k]) === v);
r.prevKept = await page.evaluate((pid) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const a = (d.adlRecords || []).find(x => x.id === 'adl_chk_prev'); return !!a && a.evalDate === '2026-07-15'; }, pid);
if (!r.savedToday) console.log('saved', saved && saved.items);
// 前の日(7/15)の評価を開くと出ない
const chip = page.locator('button', { hasText: '2026/07/15' }).first();
if (await chip.count()) { await chip.click(); await page.waitForTimeout(600); r.hiddenForOld = (await page.getByTestId('kk-copy-prev-box').count()) === 0; } else { r.hiddenForOld = false; console.log('no chip'); }
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
