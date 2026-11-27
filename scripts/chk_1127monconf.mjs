// 2026-11-27 モニタリング: 1127e「確定しているのに上の 確定 がずっと0名」/ trial650 本部が足す AI下書きの回数(--no-bonus で確定の検査だけ)
//   1 1人ずつ確定 → 上の「確定 N名」が増える・読み直しても同じ・未確定で絞ると出ない
//   2 本部の追加回数 → 上限に足される(「本部の追加30回を含む」)  3 管理局の画面: 保存 → 一覧 → 取り消す(ほかの設定は残る)
import { chromium } from 'playwright';
const PORT = process.argv.find(a => /^\d{4}$/.test(a)) || '4175'; const NOBONUS = process.argv.includes('--no-bonus');
const b = await chromium.launch(); const r = {};
const now = new Date(); const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
async function open({ init, filter } = {}) {
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  if (init) await page.addInitScript(init);
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
  const goMon = async (f) => { await page.evaluate(([ym, f]) => { localStorage.setItem('tsumugiSidebarOpen', '0'); sessionStorage.setItem('tsumugiMonJump', JSON.stringify({ ym, filter: f || 'none' })); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'monitoring', pid: null, t: Date.now() })); }, [ym, f]);
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {}); };
  await goMon(filter); return { ctx, page, goMon };
}
const confN = async (page) => { const t = await page.getByTestId('mon-conf-n').innerText(); return Number((t.match(/確定\s*(\d+)名/) || [])[1]); };
const todoN = async (page) => { const t = await page.getByTestId('mon-todo-n').innerText(); return Number((t.match(/未確定\s*(\d+)名/) || [])[1]); };
{ // 1 確定の人数
  const { ctx, page, goMon } = await open();
  await page.evaluate(([ym]) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const per = `${Number(ym.slice(0, 4))}年${Number(ym.slice(5, 7))}月`; d.monitoringRecords = (d.monitoringRecords || []).filter(x => x.period !== per);
    // 見本にはこの月の通所が無いので、利用中の5人に1日の出席(体温つき)を足す
    const Y = Number(ym.slice(0, 4)), M = Number(ym.slice(5, 7)); d.ticketRecords = (d.ticketRecords || []).filter(t => !/^chk_monconf/.test(String(t.id)));
    (d.patients || []).filter(x => x.status === '利用中' && !x.endDate).slice(0, 5).forEach((x, i) => d.ticketRecords.push({ id: 'chk_monconf_' + i, patientId: x.id, date: `${M}月1日`, year: Y, status: '出席', temp_AM: '36.5', _savedAt: Date.now() }));
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); }, [ym]);
  await goMon();
  const c0 = await confN(page), t0 = await todoN(page); r.start_zero = c0 === 0 && t0 === 5;
  const btn = () => page.locator('.tsu-mon-table tbody tr button', { hasText: /^✓ 確定$/ });
  const name1 = await page.locator('.tsu-mon-table tbody tr .tsu-mon-name').first().evaluate(el => el.querySelector('div').firstChild.textContent.trim());
  await btn().first().click(); await page.waitForTimeout(900); r.one = (await confN(page)) === 1 && (await todoN(page)) === t0 - 1;
  await btn().first().click(); await page.waitForTimeout(900); r.two = (await confN(page)) === 2 && (await todoN(page)) === t0 - 2;
  await goMon(); r.reload_two = (await confN(page)) === 2;
  // 確定を解除すると戻る
  await page.locator('.tsu-mon-table tbody tr button', { hasText: /^✓ 確定済$/ }).first().click(); await page.waitForTimeout(900); r.unconfirm_one = (await confN(page)) === 1;
  await page.locator('.tsu-mon-table tbody tr button', { hasText: /^✓ 確定$/ }).first().click(); await page.waitForTimeout(900);
  // 未確定で絞る → 確定した方は出ない・確定 0名(絞った中)
  await goMon('unconfirmed'); const names = await page.locator('.tsu-mon-table tbody tr .tsu-mon-name').allInnerTexts(); r.filter_unconfirmed = !names.some(x => x.includes(name1)) && (await todoN(page)) === t0 - 2 && (await confN(page)) === 0;
  if (!r.filter_unconfirmed) console.log('FILTER', names.length, t0, name1);
  await ctx.close();
}
if (!NOBONUS) {
  const lim = async (page) => { const t = await page.getByTestId('mon-ai-quota').innerText(); return { t, lim: Number((t.match(/上限(\d+)回/) || [])[1]), rem: Number((t.match(/残り(\d+)回/) || [])[1]) }; };
  { const { ctx, page } = await open(); const base = await lim(page); await ctx.close();
    const o = await open({ init: `window.__tsumugiE2E = { ...(window.__tsumugiE2E || {}), globalPolicies: { aiBonus: { '': { '${ym}': 30, '2020-01': 500 } } } };` }); const plus = await lim(o.page); await o.ctx.close();
    r.bonus_limit = plus.lim === base.lim + 30 && plus.rem === base.rem + 30; r.bonus_text = plus.t.includes('本部の追加30回を含む') && !base.t.includes('本部の追加');
    if (!r.bonus_limit) console.log('BONUS', base, plus); }
  { // 3 管理局の画面
    const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
    await page.addInitScript(`window.__tsumugiE2E = { ...(window.__tsumugiE2E || {}), stores: [{ id: 's1', name: 'テスト店A' }, { id: 's2', name: 'テスト店B' }], globalPolicies: { pinDeadline: '2027-01-01', aiBonus: { s2: { '2026-10': 5 } } } };`);
    await page.goto(`http://localhost:${PORT}/#hqaibonus`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
    r.panel = await page.getByTestId('hq-ai-bonus').count() === 1; r.save_disabled = await page.getByTestId('hq-ai-bonus-save').isDisabled();
    await page.getByTestId('hq-ai-bonus-store').selectOption('s1'); await page.getByTestId('hq-ai-bonus-n').fill('80'); await page.getByTestId('hq-ai-bonus-save').click(); await page.waitForTimeout(600);
    const gp = await page.evaluate(() => window.__tsumugiE2E.globalPolicies); r.saved = gp.aiBonus.s1[ym] === 80 && gp.aiBonus.s2['2026-10'] === 5 && gp.pinDeadline === '2027-01-01';
    const list = await page.getByTestId('hq-ai-bonus-list').innerText(); r.listed = /テスト店A/.test(list) && /追加 80回/.test(list) && /テスト店B/.test(list);
    r.msg = (await page.getByTestId('hq-ai-bonus-msg').innerText()).includes('80回');
    await page.getByTestId('hq-ai-bonus-list').locator('div', { hasText: 'テスト店A' }).locator('button', { hasText: '取り消す' }).first().click(); await page.waitForTimeout(600);
    const gp2 = await page.evaluate(() => window.__tsumugiE2E.globalPolicies); r.cancelled = !gp2.aiBonus.s1 && gp2.aiBonus.s2['2026-10'] === 5 && !(await page.getByTestId('hq-ai-bonus-list').innerText()).includes('テスト店A');
    await ctx.close(); }
}
await b.close();
console.log(r, Object.values(r).every(Boolean) ? 'ALL PASS' : 'FAIL'); process.exit(Object.values(r).every(Boolean) ? 0 : 1);
