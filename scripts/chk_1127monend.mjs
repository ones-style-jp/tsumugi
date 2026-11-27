// 2026-11-27 trial650 月の途中で利用終了(退所)になった方のモニタリング(ユーザー「最後のモニタリングを作って送る。その月が終わった次から対象外」)
//   a 通所ありで退所 → その月に出る(印つき)  b 休止のまま退所(その月の通所なし) → その月の「通所なし」に出る(印つき)・翌月は出ない
//   c 利用終了日が月末(まだ先) → その月は出る・翌月は出ない  d 前の月に退所 → その月には出ない
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : (process.argv[2] || '4175'); })();
const b = await chromium.launch(); const r = {};
const y0 = new Date(); y0.setDate(y0.getDate() - 1); const Y = y0.getFullYear(), M = y0.getMonth() + 1, D = y0.getDate();
const z = (n) => String(n).padStart(2, '0'); const iso = `${Y}-${z(M)}-${z(D)}`; const ym = `${Y}-${z(M)}`;
const nx = new Date(Y, M, 1); const ymNext = `${nx.getFullYear()}-${z(nx.getMonth() + 1)}`;
const lastOf = new Date(Y, M, 0).getDate(); const monthEnd = `${ym}-${z(lastOf)}`;
const pv = new Date(Y, M - 1, 0); const prevEnd = `${pv.getFullYear()}-${z(pv.getMonth() + 1)}-${z(pv.getDate())}`;
async function look(target) {
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
  const ids = await page.evaluate(([iso, Y, M, D, monthEnd, prevEnd, target]) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3'));
    const ps = (d.patients || []).filter(x => x.status === '利用中' && !x.endDate && x.startDate && String(x.startDate).slice(0, 10) < prevEnd.slice(0, 8) + '01').slice(0, 4); const [a, bb, c, dd] = ps;
    const inMonth = (t, pid) => t.patientId === pid && new RegExp('^' + M + '月').test(String(t.date || '')) && (!t.year || Number(t.year) === Y);
    d.ticketRecords = (d.ticketRecords || []).filter(t => !/^chk_monend/.test(String(t.id)) && !inMonth(t, bb.id));
    a.endDate = iso; a.status = '退所'; d.ticketRecords.push({ id: 'chk_monend_a', patientId: a.id, date: `${M}月${D}日`, year: Y, status: '出席', _savedAt: Date.now() });
    bb.endDate = iso; bb.status = '休止'; bb.pauseHistory = [{ reason: '入院', fromDate: prevEnd, toDate: iso }]; bb.statusUpdatedAt = Date.now();
    c.endDate = monthEnd;
    dd.endDate = prevEnd; dd.status = '退所';
    const idset = new Set(ps.map(x => x.id)); d.monitoringRecords = (d.monitoringRecords || []).filter(x => !idset.has(x.patientId));
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0');
    sessionStorage.setItem('tsumugiMonJump', JSON.stringify({ ym: target, filter: 'unentered' })); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'monitoring', pid: null, t: Date.now() }));
    return ps.map(x => ({ id: x.id, name: x.name })); }, [iso, Y, M, D, monthEnd, prevEnd, target]);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
  const out = await page.evaluate((ids) => { const rows = [...document.querySelectorAll('.tsu-mon-table tbody tr')]; const res = {};
    ids.forEach(({ id, name }, i) => { const tr = rows.find(x => x.querySelector('.tsu-mon-name') && x.querySelector('.tsu-mon-name').innerText.includes(name)); const badge = document.querySelector(`[data-testid="mon-end-${id}"]`);
      const box = tr ? tr.closest('table').parentElement : null; res['abcd'[i]] = { shown: !!tr, badge: badge ? badge.innerText : '', absent: !!(box && /通所なし/.test(box.innerText.slice(0, 40))) }; }); return res; }, ids);
  await ctx.close(); return out;
}
const cur = await look(ym), next = await look(ymNext);
r.a_shown = cur.a.shown && !cur.a.absent; r.a_badge = cur.a.badge === `${M}/${D} 利用終了`;
r.b_shown_absent = cur.b.shown && cur.b.absent; r.b_badge = cur.b.badge === `${M}/${D} 利用終了`;
r.c_shown = cur.c.shown; r.c_badge = cur.c.badge === `${M}/${lastOf} 利用終了`;
r.d_not_shown = !cur.d.shown;
r.next_a_gone = !next.a.shown; r.next_b_gone = !next.b.shown; r.next_c_gone = !next.c.shown; r.next_d_gone = !next.d.shown;
await b.close();
if (!Object.values(r).every(Boolean)) console.log(JSON.stringify({ cur, next }));
console.log(r, Object.values(r).every(Boolean) ? 'ALL PASS' : 'FAIL'); process.exit(Object.values(r).every(Boolean) ? 0 : 1);
