// 2026-10-28 月の途中で退所した方も、その月のモニタリングの対象に残す(ユーザー「月の途中で退所してもモニタリングは送る」)
//   見本の利用者1人を「昨日で退所(状態=退所)」にし、その月に通所の記録を持たせる → その月のモニタリング(未作成)に出る・翌月には出ない・ホームの未確定の人数に入る
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4173'; })();
const b = await chromium.launch(); const r = {};
const y0 = new Date(); y0.setDate(y0.getDate() - 1); const Y = y0.getFullYear(), M = y0.getMonth() + 1, D = y0.getDate();
const iso = `${Y}-${String(M).padStart(2, '0')}-${String(D).padStart(2, '0')}`; const ym = `${Y}-${String(M).padStart(2, '0')}`;
const nx = new Date(Y, M, 1); const ymNext = `${nx.getFullYear()}-${String(nx.getMonth() + 1).padStart(2, '0')}`;
async function open(prep) {
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
  const name = await page.evaluate(([iso, Y, M, D, prep]) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const p = (d.patients || []).find(x => x.status === '利用中' && !x.endDate);
    p.endDate = iso; p.status = '退所'; d.ticketRecords = (d.ticketRecords || []).filter(t => !(t.patientId === p.id && t.id === 'chk_monend'));
    d.ticketRecords.push({ id: 'chk_monend', patientId: p.id, date: `${M}月${D}日`, year: Y, status: '出席', _savedAt: Date.now() });
    d.monitoringRecords = (d.monitoringRecords || []).filter(x => !(x.patientId === p.id));
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0');
    if (prep) (new Function('ym', prep))(); return p.name; }, [iso, Y, M, D, prep]);
  return { page, name };
}
const monShows = async (target) => { const { page, name } = await open(`sessionStorage.setItem('tsumugiMonJump', JSON.stringify({ ym: '${target}', filter: 'unentered' })); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'monitoring', pid: null, t: Date.now() }));`);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
  const t = await page.locator('main, body').first().innerText(); const has = t.includes(name); await page.context().close(); return has; };
r.shownInEndMonth = await monShows(ym);
r.notShownNextMonth = !(await monShows(ymNext));
// ホームの未確定の人数: 退所の方を入れたときと、記録を消して(その月の通所なし)入れないときの差が1
const homeCount = async (withRec) => { const { page } = await open(withRec ? `sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'dashboard', pid: null, t: Date.now() }));` : `const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.ticketRecords = d.ticketRecords.filter(t => t.id !== 'chk_monend'); localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'dashboard', pid: null, t: Date.now() }));`);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
  const t = await page.getByTestId('home-tasks').innerText(); await page.context().close(); const mm = t.match(new RegExp(`モニタリング（${M}月分）\\s*未確定\\s*(\\d+)名`)); return mm ? Number(mm[1]) : 0; };
const hWith = await homeCount(true), hWithout = await homeCount(false); r.homeCounts = hWith === hWithout + 1; if (!r.homeCounts) console.log('HOME', hWith, hWithout);
await b.close();
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); process.exit(Object.values(r).every(Boolean) ? 0 : 1);
