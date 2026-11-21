// 2026-10-22 不具合修正: サービス提供記録(月の表)
//  ・状態=出席・特記に「…で終了。」・体温あり → 体温が出る・日付は薄くない
//  ・状態=出席・特記に「来週は休み。」・血圧あり → 血圧が出る
//  ・状態=出席・特記「休み」・数値なし → 状態どおり出席(特記の言葉は見ない・2026-10-22 ユーザー指示)
//  ・運動が未設定の方でも各行の列の数がそろう
import { chromium } from 'playwright';
const PORT = process.argv[2] || '4173'; const r = {}; const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 160)));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const now = new Date(); const y = now.getFullYear(), m = now.getMonth() + 1; const ym = `${y}-${String(m).padStart(2, '0')}`;
const pid = await page.evaluate(([y, m]) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const ps = (d.patients || []).filter(p => p.status === '利用中'); const p = ps[ps.length - 1]; p.plannedExercises = {}; p.plannedExercisesHistory = []; p.scheduleAmPm = ['PM', 'PM', 'PM', 'PM', 'PM', 'PM', 'PM'];
  const dn = ['日','月','火','水','木','金','土']; const mk = (day, extra) => { const dt = new Date(y, m - 1, day); return { id: `tst_tk_${day}`, patientId: p.id, name: p.name, date: `${m}月${day}日`, year: y, dayOfWeek: dn[dt.getDay()], status: '出席', exercises: {}, ...extra }; };
  d.ticketRecords = (d.ticketRecords || []).filter(t => t.patientId !== p.id);
  d.ticketRecords.push(mk(2, { temp: '36.7', temp_PM: '36.7', bpUpSt: '181', bpDnSt: '85', plSt: '105', tokki: '膝痛及び疲れの為3分で終了。', recorder: '見本 太郎' }));
  d.ticketRecords.push(mk(3, { temp: '36.5', bpUpSt: '116', bpDnSt: '84', plSt: '66', tokki: '来週はショートステイで休み。', recorder: '見本 太郎' }));
  d.ticketRecords.push(mk(4, { tokki: '休み' }));
  d.ticketRecords.push(mk(5, { status: '休止', tokki: '' }));
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); return p.id; }, [y, m]);
await page.evaluate(([pid, ym]) => { sessionStorage.setItem('tsumugiOpenTicket', JSON.stringify({ patientId: pid, month: ym })); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'ticket', pid, t: Date.now() })); }, [pid, ym]);
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
const day = (n) => page.evaluate((n) => { const rows = [...document.querySelectorAll('#print-content-ticket tr')]; const i = rows.findIndex(tr => [...tr.cells].some(c => c.rowSpan > 1 && new RegExp(`^\\s*${n}\\s*（`).test(c.innerText))); if (i < 0) return null; const dc = [...rows[i].cells].find(c => c.rowSpan > 1); return { grey: /text-slate-400/.test(dc.className), text: rows.slice(i, i + 2).map(tr => tr.innerText.replace(/\s+/g, ' ')).join(' / ') }; }, n);
const d2 = await day(2), d3 = await day(3), d4 = await day(4), d5 = await day(5); console.log('d5', JSON.stringify(d5)); console.log('d2', JSON.stringify(d2)); console.log('d3', JSON.stringify(d3)); console.log('d4', JSON.stringify(d4));
r.endShown = !!d2 && /36\.7/.test(d2.text) && /181\/85/.test(d2.text) && !d2.grey;
r.yasumiShown = !!d3 && /116\/84/.test(d3.text) && !d3.grey;
r.statusOnly = !!d4 && !d4.grey; // ★ 2026-10-22(ユーザー指示): 状態だけで判定。特記に「休み」でも状態が出席なら欠席扱いにしない
  r.pauseGrey = !d5 || d5.grey; // 休止は欠席と同じ扱い(日が出ない場合も可)
const sp = await page.evaluate(() => { const out = []; document.querySelectorAll('#print-content-ticket table').forEach((tb, ti) => { const occ = {}; [...tb.rows].forEach((tr, ri) => { let sum = 0; [...tr.cells].forEach(c => { sum += c.colSpan || 1; if ((c.rowSpan || 1) > 1) for (let k = 1; k < c.rowSpan; k++) occ[ri + k] = (occ[ri + k] || 0) + (c.colSpan || 1); }); sum += occ[ri] || 0; if (tr.cells.length) out.push(`${ti}:${sum}`); }); }); return [...new Set(out)]; });
const per = {}; sp.forEach(x => { const [t, n] = x.split(':'); (per[t] = per[t] || new Set()).add(n); }); r.colsEven = Object.keys(per).length > 0 && Object.values(per).every(st => st.size === 1); console.log('spans', JSON.stringify(sp));
await page.screenshot({ path: '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad/tickfix.jpg', type: 'jpeg', quality: 55 });
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
