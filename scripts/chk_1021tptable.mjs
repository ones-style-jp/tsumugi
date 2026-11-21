// 2026-10-21 週の運行表「送りの表を別に」(試験版): 時間帯ごとに1枚・上=迎え・下=送り(送りの車ごとに送る順番どおりの名前と着く時間)・座席表の週は最初にこれが選ばれる
//   ＋ 表のいちばん下が紙の枠の内側(下の横線が切れない) ＋ クラス在籍表の見出しは利用者の行より低い(印刷・画面)・用紙に収まる
//   使い方: node scripts/chk_1021tptable.mjs [port] [--stable](安定版は下の横線だけ)
import { chromium } from 'playwright';
import fs from 'fs';
const PORT = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '4173'; const ST = process.argv.includes('--stable');
const OUT = '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad/tpsheet';
const b = await chromium.launch(); const r = {};
const mon = new Date(); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7)); const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const days = Array.from({ length: 6 }, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return isoOf(d); });
const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 160)));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const seed = (custom) => page.evaluate(([days, custom]) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.diarySettings.cars = [{ id: 'c1', name: '1号車', type: '', cap: '7' }, { id: 'c2', name: '2号車', type: '', cap: '6' }, { id: 'c3', name: '3号車', type: '', cap: '5' }];
  const act = d.patients.filter(p => p.status === '利用中').slice(0, 30); const tp = {};
  days.forEach(iso => ['AM', 'PM'].forEach((sl, si) => { const L = act.slice(si * 15, si * 15 + 15); const sizes = [6, 5, 4]; let o = 0; const cars = {}; ['c1', 'c2', 'c3'].forEach((cid, ci) => { cars[cid] = L.slice(o, o + sizes[ci]).map((p, i) => ({ pid: p.id, t: sl === 'AM' ? `8:${String(20 + i * 6).padStart(2, '0')}` : `13:${String(5 + i * 5).padStart(2, '0')}` })); o += sizes[ci]; });
    const dropAt = {}; Object.values(cars).forEach(ms => [...ms].reverse().forEach((m, i) => { dropAt[String(m.pid)] = sl === 'AM' ? `12:${String(15 + i * 7).padStart(2, '0')}` : `16:${String(20 + i * 7).padStart(2, '0')}`; }));
    tp[`${iso}_${sl}`] = { cars, walkers: [], others: [], un: [], dropAt, _savedAt: Date.now() }; }));
  let moved = null;
  if (custom) { const P = tp[`${days[2]}_AM`]; const c1 = [...P.cars.c1].reverse(), c2 = [...P.cars.c2].reverse(), c3 = [...P.cars.c3].reverse(); const mv = c2.shift(); c1.push(mv); moved = mv.pid; P.dropAt[String(mv.pid)] = '12:58';
    P.dropMode = 'custom'; P.drop = { cars: { c1: c1.map((m, i) => ({ pid: m.pid, seat: i })), c2: c2.map((m, i) => ({ pid: m.pid, seat: i })), c3: c3.map((m, i) => ({ pid: m.pid, seat: i })) }, walkers: [], others: [], driver: { c1: '見本 一', c2: '模擬 四' }, depart: {} }; }
  d.transportPlans = tp; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); return { moved: moved && d.patients.find(p => p.id === moved).name, first2: d.patients.find(p => p.id === tp[`${days[2]}_AM`].cars.c2[tp[`${days[2]}_AM`].cars.c2.length - 2].pid).name }; }, [days, custom]);
const goTp = async () => { await page.evaluate((iso) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, date: iso, t: Date.now() })), days[0]); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 800 }).catch(() => {}); };
const cap = async (choice) => { await page.evaluate(() => { window.__ph = ''; window.addEventListener('setPrintHtml', e => { window.__ph = (e.detail && e.detail.html) || ''; }, { once: true }); });
  await page.locator('button:visible', { hasText: /^ダウンロード$/ }).first().click(); await page.waitForTimeout(400);
  const def = ST ? null : (await page.getByTestId('tp-print-drop-none').isChecked().catch(() => null));
  if (choice) await page.getByTestId(`tp-print-drop-${choice}`).check();
  await page.locator('button:visible', { hasText: /^ダウンロード$/ }).last().click(); await page.waitForTimeout(1500);
  const ph = await page.evaluate(() => window.__ph); await page.keyboard.press('Escape').catch(() => {}); await page.locator('button:visible', { hasText: /^(閉じる|×|✕)$/ }).last().click().catch(() => {}); await page.waitForTimeout(400); return { ph, def }; };
const bottoms = async (html) => { fs.writeFileSync(`${OUT}/chk_tmp.html`, `<!doctype html><meta charset=utf-8><body style="margin:0;background:#fff">${html}</body>`); const p2 = await (await b.newContext({ viewport: { width: 1123, height: 794 } })).newPage(); await p2.goto('file://' + `${OUT}/chk_tmp.html`); await p2.waitForTimeout(300);
  const v = await p2.evaluate(() => [...document.querySelectorAll('[data-page-break]')].map(pg => { const box = pg.firstElementChild.getBoundingClientRect(); const t = pg.querySelector('table').getBoundingClientRect(); return Math.round(box.bottom - t.bottom); })); await p2.context().close(); return v; };
// 1) 座席表なしの週: 1枚・下の横線
{ await seed(false); await goTp(); const { ph, def } = await cap(null); const bt = await bottoms(ph); r.normalBottom = bt.length >= 1 && bt.length <= 2 && bt.every(x => x >= 1); /* ★ 2026-10-22: 文字を大きくするため2枚になる週がある */ if (!ST) r.defaultNone1 = def === true; console.log('normal', JSON.stringify(bt)); }
if (!ST) {
  // 2) 座席表の週: 最初は「送りの表を別に」・午前/午後の2枚・送りの表に送る順番どおり
  const info = await seed(true); await goTp(); const { ph, def } = await cap('table'); r.defaultNone2 = def === true;
  const pages = ph.split('data-page-break="1"').length - 1; r.twoPages = pages === 2 && ph.includes('午前送り') && ph.includes('午後送り') && ph.includes('運行表（午前）');
  r.noSendCol = !ph.includes('>送り</td>'); // 迎えの見出しに「送り」の列が無い
  const am = ph.split('午前送り')[1] || ''; r.movedInDrop = !!info.moved && am.includes(info.moved) && am.includes('12:58') && am.includes('模擬'); if (!r.movedInDrop) console.log('moved dbg', info.moved, am.includes(info.moved||'??'), am.includes('12:58'), am.includes('模擬'), am.includes('模擬'));
  const bt = await bottoms(ph); r.tableBottom = bt.length === 2 && bt.every(x => x >= 1); console.log('table', JSON.stringify(bt));
  // 3) 入れない: 送りの時間が出ない
  await goTp(); const n = await cap('none'); r.noneNoDrop = !/>12:\d\d</.test(n.ph) && />8:\d\d</.test(n.ph);
  // 4) クラス在籍表: 見出しは利用者の行より低い・用紙に収まる
  await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'class_roster', pid: null, t: Date.now() }))); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800);
  const scr = await page.evaluate(() => { const t = document.querySelector('[data-testid="cr-am"]'); const trs = [...t.querySelectorAll('tr')].map(tr => tr.getBoundingClientRect().height); return { hdr: trs[1], row: trs[2] }; }); r.crScreen = scr.hdr < scr.row;
  const html = await page.locator('#print-content-classroster').evaluate(e => e.outerHTML);
  fs.writeFileSync(`${OUT}/chk_cr.html`, `<!doctype html><meta charset=utf-8><body style="margin:0;background:#fff">${html.replace(/display:\s*none/g, 'display:block')}</body>`); const p3 = await (await b.newContext({ viewport: { width: 1123, height: 794 } })).newPage(); await p3.goto('file://' + `${OUT}/chk_cr.html`); await p3.waitForTimeout(300);
  const pr = await p3.evaluate(() => { const root = document.getElementById('print-content-classroster'); const ts = [...root.querySelectorAll('table')]; const trs = [...ts[0].querySelectorAll('tr')].map(tr => tr.getBoundingClientRect().height); return { hdr: trs[1], row: trs[2], last: ts[ts.length - 1].getBoundingClientRect().bottom }; }); await p3.context().close();
  r.crPrint = pr.hdr < pr.row && pr.last <= 794 - 20; console.log('cr', JSON.stringify(scr), JSON.stringify(pr));
}
console.log(r, Object.values(r).every(v => v === true) ? 'PASS' : 'FAIL'); await b.close();
