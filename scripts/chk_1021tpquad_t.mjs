// 2026-10-21 送迎表のダウンロード(試験版):
//  週: 「名前の右に時間」は「時間 車名」の順で、長い車名でも時間が欄に見える／「入れない」は送りの列も印も出ない／送りの表の見出しは「氏名」「時間」
//  1日: A4横で 午前の迎え・午前の送り・午後の迎え・午後の送り が1枚(1コマ15名)・名前の横の「送12:50」の印なし・送りを入れないと送りの欄なし・
//       大きい店舗(1コマ28名)は紙からはみ出さない(午前・午後で分かれてよい)
import { chromium } from 'playwright';
import fs from 'fs';
const OUT = '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad/tpsheet';
const b = await chromium.launch(); const r = {};
const mon = new Date(); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7)); const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const days = Array.from({ length: 6 }, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return isoOf(d); });
const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 160)));
await page.goto('http://localhost:4185/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const seed = (big, absAM = 12, absPM = 3, variant = false) => page.evaluate(([days, big, absAM, absPM, variant]) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3'));
  const sizes = big ? [8, 7, 7, 6] : [6, 5, 4]; const per = sizes.reduce((a, x) => a + x, 0);
  d.diarySettings.cars = sizes.map((n, i) => ({ id: 'c' + (i + 1), name: ['ステップワゴン', 'ハイエース', 'セレナ', 'ノア'][i], type: '', cap: String(n + 1) }));
  const act = d.patients.filter(p => p.status === '利用中').slice(0, per * 2); const tp = {};
  days.forEach((iso, di) => ['AM', 'PM'].forEach((sl, si) => { const L = act.slice(si * per, si * per + per); let o = 0; const cars = {}; sizes.forEach((n, ci) => { cars['c' + (ci + 1)] = L.slice(o, o + n).map((p, i) => ({ pid: p.id, t: sl === 'AM' ? `8:${String(20 + i * 5).padStart(2, '0')}` : `13:${String(5 + i * 5).padStart(2, '0')}` })); o += n; });
    const dropAt = {}; Object.values(cars).forEach(ms => [...ms].reverse().forEach((m, i) => { dropAt[String(m.pid)] = sl === 'AM' ? `12:${String(10 + i * 6).padStart(2, '0')}` : `16:${String(10 + i * 6).padStart(2, '0')}`; }));
    const P = { cars, walkers: [], others: [], un: [], driver: { c1: '見本 一', c2: '例示 二', ...(variant ? { c3: '髙橋 一' } : {}) }, dropAt, _savedAt: Date.now() };
    if (di === 2 && sl === 'AM') { const c1 = [...cars.c1].reverse(), c2 = [...cars.c2].reverse(); const mv = c2.shift(); c1.push(mv); P.dropMode = 'custom'; P.drop = { cars: { c1: c1.map((m, i) => ({ pid: m.pid, seat: i })), c2: c2.map((m, i) => ({ pid: m.pid, seat: i })), c3: [...cars.c3].reverse().map((m, i) => ({ pid: m.pid, seat: i })) }, walkers: [], others: [], driver: { c1: '見本 一', c2: '模擬 四' }, depart: {} }; }
    tp[`${iso}_${sl}`] = P; }));
  { const iso = days[4]; const dt = new Date(iso + 'T00:00:00'); const dow = dt.getDay(), dn = dt.getDate(); const mk = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`; d.monthlyShifts = d.monthlyShifts || {}; d.monthlyShifts[mk] = d.monthlyShifts[mk] || {};
    const extra = d.patients.filter(p => p.status === '利用中' && !act.includes(p)).slice(0, absAM + absPM); if (variant) { extra[0].name = '髙橋 花子'; extra[1].name = '高橋 花江'; extra[2].name = '高橋 進'; d.diarySettings.staff = [...(d.diarySettings.staff || []), { id: 'stv1', name: '高橋 二' }]; } extra.forEach((p, i) => { const sl2 = i < absAM ? 'AM' : 'PM'; p.scheduleAmPm = [...(p.scheduleAmPm || ['', '', '', '', '', '', ''])]; p.scheduleAmPm[dow] = sl2; d.monthlyShifts[mk][p.id] = { ...(d.monthlyShifts[mk][p.id] || {}), [`${dn}_${sl2}`]: '欠席' }; }); }
  d.transportPlans = tp; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); }, [days, big, absAM, absPM, variant]);
const goTp = async () => { await page.evaluate((iso) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, date: iso, t: Date.now() })), days[0]); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 800 }).catch(() => {}); };
const cap = async (mode, opt) => { await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 600 }).catch(() => {}); await page.evaluate(() => { window.__ph = ''; window.addEventListener('setPrintHtml', e => { window.__ph = (e.detail && e.detail.html) || ''; }, { once: true }); });
  await page.locator('button:visible', { hasText: /^ダウンロード$/ }).first().click(); await page.waitForTimeout(400);
  if (mode === 'days') { await page.locator('button:visible', { hasText: /^日ごと/ }).first().click(); await page.waitForTimeout(200); if (opt === 'off') await page.getByTestId('tp-print-dropat').locator('input').uncheck(); }
  else if (opt) await page.getByTestId(`tp-print-drop-${opt}`).check();
  await page.locator('button:visible', { hasText: /^ダウンロード$/ }).last().click(); await page.waitForTimeout(1500);
  const ph = await page.evaluate(() => window.__ph); await page.keyboard.press('Escape').catch(() => {}); await page.locator('button:visible', { hasText: /^(閉じる|×|✕)$/ }).last().click().catch(() => {}); await page.waitForTimeout(400); return ph; };
const render = async (html, w, h, fn) => { fs.writeFileSync(`${OUT}/chk_q.html`, `<!doctype html><meta charset=utf-8><body style="margin:0;background:#fff">${html}</body>`); const p2 = await (await b.newContext({ viewport: { width: w, height: h } })).newPage(); await p2.goto('file://' + `${OUT}/chk_q.html`); await p2.waitForTimeout(300); const v = await p2.evaluate(fn); await p2.context().close(); return v; };
const overflowCheck = () => [...document.querySelectorAll('[data-page-break]')].map(pg => { const box = pg.firstElementChild; const inner = box.firstElementChild; const body = inner && inner.children[1]; return { over: body ? body.scrollHeight - body.clientHeight : 0 }; });
// 週(1コマ15名・長い車名・金曜の休み 午前5名・午後1名)
await seed(false, 5, 1); await goTp();
{ const w = await cap('week', 'col');
  const v = await render(w, 1123, 794, () => [...document.querySelectorAll('td')].filter(td => /号車|ステップワゴン|ハイエース|セレナ|ノア|\d{1,2}:\d{2} /.test(td.textContent) && td.style.color === 'rgb(55, 48, 163)').map(td => ({ t: td.textContent, fits: td.scrollWidth <= td.clientWidth + 1, cw: td.clientWidth, sw: td.scrollWidth, fs: td.style.fontSize })));
  const withCar = v.filter(x => /[^\d:\s]/.test(x.t)); r.weekColTimeFirst = withCar.length > 0 && withCar.every(x => /^\d{1,2}:\d{2} /.test(x.t));
  r.weekColFits = v.length > 0 && v.every(x => x.fits); if (!r.weekColFits) console.log('col clipped', JSON.stringify(v.filter(x => !x.fits).slice(0, 3))); }
{ const w = await cap('week', null); const abs = (w.match(/休み: [^<]*/g) || []); r.weekAbsShort = abs.length > 0 && abs.every(t => !/\S \S/.test(t.replace(/^休み: /, ''))); if (!r.weekAbsShort) console.log('abs', abs.slice(0, 2));
  r.weekDefaultNone = !w.includes('>送り</td>');
  const ar = await render(w, 1123, 794, () => { const rows = [...document.querySelectorAll('tr')].filter(tr => /^(午前|午後)$/.test((tr.firstElementChild && tr.firstElementChild.textContent || '').trim())); return rows.map(tr => { const tds = [...tr.children].slice(2); return Math.min(...tds.map(td => { const r0 = td.getBoundingClientRect(); const boxes = [...td.children].filter(c => c.querySelector('table')); const bottom = Math.max(r0.top, ...boxes.map(c => c.getBoundingClientRect().bottom)); return Math.round(r0.bottom - bottom); })); }); });
  r.weekAbsAreaEqual = ar.length === 2 && Math.abs(ar[0] - ar[1]) <= 3; console.log('abs area', JSON.stringify(ar));
  const ov = await render(w, 1123, 794, () => { const root = document.getElementById('transport-print-inner'); return root.scrollHeight - root.clientHeight; }); r.weekNoOverflow = ov <= 0; }
{ const w = await cap('week', 'none'); r.weekNone = !/>\d{1,2}:\d{2} [^<]*</.test(w) && !w.includes('>送り</td>') && !/送(ステップワゴン|ハイエース)/.test(w); }
{ const w = await cap('week', 'table'); r.weekTableHead = w.includes('>氏名</td>') && w.includes('>時間</td>') && !w.includes('送る順') && !w.includes('>着く<'); }
// 1日(1コマ15名・金曜の休み 午前12名・午後3名)
await seed(false, 12, 3, true); await goTp();
{ const d = await cap('days', null); const pages = (d.match(/data-page-break="1"/g) || []).length;
  r.dayOnePagePerDay = pages === 6; r.dayQuads = ['午前　迎え', '午前　送り', '午後　迎え', '午後　送り'].every(t => d.includes(t)); r.dayNoTags = !/送\d{1,2}:\d{2}/.test(d) && /12:\d\d/.test(d);
  r.dayDropDriver = d.includes('>模擬</b>') && !d.includes('模擬 四') && d.includes('>見本</b>'); r.dayDrvWhite = /background:#ffffff;[^>]*><span style="writing-mode:vertical-rl;text-orientation:upright;white-space:nowrap;"><b style="font-size:\d+px;line-height:1.1;color:#111827;">/.test(d); const ov = await render(d, 1123, 794, overflowCheck); r.dayNoOverflow = ov.every(x => x.over <= 1); console.log('day pages', pages, JSON.stringify(ov.slice(0, 3)));
  { const abs = (d.match(/休み: [^<]*/g) || []); const all = abs.join(' ');
    r.dayAbsShort = abs.length > 0 && abs.every(t => !/\S \S/.test(t.replace(/^休み: /, ''))) && all.includes('髙橋（花子）') && all.includes('高橋（花江）') && all.includes('高橋（進）'); console.log('day abs', JSON.stringify(abs.map(t => t.slice(0, 60))));
    r.dayDrvVariant = d.includes('>一</b>') && !d.includes('>髙橋</b>');
    const wd = await render(d, 1123, 794, () => [...document.querySelectorAll('[data-page-break]')].map(pg => { const tbs = [...pg.querySelectorAll('table')]; const first = (n) => { const t = tbs.find(t0 => [...t0.querySelectorAll('tr')].some(tr => tr.children.length === n && /\S/.test(tr.children[0].textContent))); const tr = t && [...t.querySelectorAll('tr')].find(tr0 => tr0.children.length === n && /\S/.test(tr0.children[0].textContent)); return tr ? [...tr.children].map(td => Math.round(td.getBoundingClientRect().width)) : null; };
      const pk = first(4), dp = first(2); const labs = [...pg.querySelectorAll('span[style*="writing-mode:vertical-rl"]')].map(sp => Math.round(sp.parentElement.getBoundingClientRect().width)); const dropCols = [...pg.querySelectorAll('div')].filter(dv => /送り$/.test((dv.firstElementChild && dv.firstElementChild.textContent || '').trim()) && dv.style.width).map(dv => Math.round(dv.getBoundingClientRect().width)); return { pk, dp, lab: Math.min(...labs), dropCol: dropCols[0] || 0 }; }));
    console.log('day widths', JSON.stringify(wd.slice(0, 2)));
    r.dayDropSameWidth = wd.length > 0 && wd.every(x => x.pk && x.dp && Math.abs(x.pk[0] - x.dp[0]) <= 2 && Math.abs(x.pk[1] - x.dp[1]) <= 2);
    r.dayDropNarrow = wd.every(x => x.dropCol > 0 && x.dropCol < 1123 * 0.3); r.dayLabelWider = wd.every(x => x.lab >= 19); if (!r.dayLabelWider) console.log("lab", wd.map(x => x.lab)); }
}
{ const d = await cap('days', 'off'); r.dayOffNoDrop = !d.includes('午前　送り') && d.includes('午前　迎え'); }
// 1日(大きい店舗 1コマ28名): はみ出さない
await seed(true); await goTp();
{ const d = await cap('days', null); const pages = (d.match(/data-page-break="1"/g) || []).length; const ov = await render(d, 1123, 794, overflowCheck); r.bigNoOverflow = ov.every(x => x.over <= 1); console.log('big pages', pages, JSON.stringify(ov.slice(0, 4))); }
console.log(r, Object.values(r).every(v => v === true) ? 'PASS' : 'FAIL'); await b.close();
