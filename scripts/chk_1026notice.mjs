// 2026-10-26 試験版 trial419: ①ホームの「つむぎ運営からのお知らせ」を開くと左右送り(新しい/古い・矢印キー)で次々見られる ②構造化した変更点(items)が「場所・原因→変更」で出る ③送迎表: 人を乗せただけでは他の人に赤枠が付かない
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4173'; })();
const b = await chromium.launch(); const r = {};
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const now = new Date(); const mon = new Date(now); mon.setDate(now.getDate() + (now.getDay() === 0 ? -6 : 1 - now.getDay())); mon.setHours(0, 0, 0, 0); const key = `${iso(mon)}_AM`;
async function start(view, prep, route) {
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  if (route) await route(page);
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
  const ids = await page.evaluate(([view, prep, key]) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.systemSettings = d.systemSettings || {}; const ps = (d.patients || []).filter(p => p.status === '利用中' && p.address).slice(0, 3); (new Function('d', 'ps', 'key', prep || ''))(d, ps, key); localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); localStorage.setItem('tsumugiTpDriveAck', String(Date.now())); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view, pid: null, date: key.slice(0, 10), ampm: 'AM', t: Date.now() })); return ps.map(p => p.id); }, [view, prep, key]);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
  return { page, ids }; }
// ① ② お知らせの左右送り(update-notes.json を差し替えて 3件・1件は items つき)
{ const notes = { version: 'upd-test', updatedAt: '2026-10-26', prompt: 'all', notes: [
    { id: 'n3', type: 'update', title: '三つ目（最新）', date: '2026-10-26', body: '要点だけ', items: [ { kind: 'bug', where: '日誌', cause: '過去の日誌にも自動反映が働いた', change: '10/26以降の日誌だけにした' }, { kind: 'feat', where: '送迎表', change: '運行表を出した後の変更に赤枠' } ] },
    { id: 'n2', type: 'update', title: '二つ目', date: '2026-10-25', body: '本文2' },
    { id: 'n1', type: 'info', title: '一つ目（古い）', date: '2026-10-24', body: '本文1' } ] };
  const { page } = await start('dashboard', "", async (page) => { await page.route('**/update-notes.json*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(notes) })); });
  await page.waitForTimeout(800); await page.locator('button', { hasText: /つむぎ運営からのお知らせ/ }).first().click().catch(() => {}); await page.waitForTimeout(400);
  const row = page.getByTestId('home-dev-row-n3'); if (!(await row.count())) { await page.locator('button', { hasText: /つむぎ運営からのお知らせ/ }).first().click().catch(() => {}); await page.waitForTimeout(400); }
  await page.getByTestId('home-dev-row-n3').click(); await page.waitForTimeout(400);
  const det = page.getByTestId('notice-detail'); r.navShown = (await page.getByTestId('notice-nav').count()) === 1 && /三つ目/.test(await det.innerText());
  r.itemsShown = (await page.getByTestId('notice-items').count()) === 1 && /変更点 2件/.test(await det.innerText()) && /原因/.test(await det.innerText()) && /不具合の修正 1件/.test(await det.innerText()) && /新機能 1件/.test(await det.innerText());
  await page.getByTestId('notice-next').click(); await page.waitForTimeout(300); r.nextWorks = /二つ目/.test(await det.innerText()) && /2 \/ /.test(await det.innerText());
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(300); r.keyWorks = /一つ目/.test(await det.innerText());
  await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(300); r.prevWorks = /二つ目/.test(await det.innerText());
  r.lastDisabled = await page.getByTestId('notice-prev').isEnabled() && !(await page.getByTestId('notice-next').isEnabled()) === false; // 中央なので両方押せる
  /* trial424: 開いている間は背面ロック・上寄せ(スマホで上が見切れない) */
  r.backLock = await page.evaluate(() => document.documentElement.classList.contains('tsu-back-lock')); r.inBody = await page.evaluate(() => { const o = document.querySelector('[data-testid="notice-overlay"]'); return !!o && o.parentElement === document.body; }); /* trial425: スクロール枠の外(body 直下) */ r.topAligned = (await page.getByTestId('notice-overlay').evaluate(e => getComputedStyle(e).alignItems)) === 'flex-start';
  await page.keyboard.press('Escape'); await page.getByTestId('notice-overlay').click({ position: { x: 3, y: 3 } }).catch(() => {}); await page.waitForTimeout(300); r.unlocked = !(await page.evaluate(() => document.documentElement.classList.contains('tsu-back-lock')));
  if (!r.navShown || !r.itemsShown) console.log('DET', (await det.innerText()).slice(0, 300));
  await page.context().close(); }
// ②' スマホ幅: 長いお知らせでも上(題名)が画面内
{ const long = { version: 'upd-test', updatedAt: '2026-10-26', prompt: 'all', notes: [ { id: 'nl', type: 'update', title: '長いお知らせ', date: '2026-10-26', body: Array.from({ length: 60 }, (_, i) => `行${i + 1} あいうえおかきくけこさしすせそ`).join('\n') } ] };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', hasTouch: true }); const page = await ctx.newPage(); page.on('dialog', d => d.accept());
  await page.route('**/update-notes.json*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(long) }));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
  await page.evaluate(() => { localStorage.setItem('tsumugiSidebarOpen', '0'); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'dashboard', pid: null, t: Date.now() })); });
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
  if (!(await page.getByTestId('home-dev-row-nl').count())) { await page.locator('button', { hasText: /つむぎ運営からのお知らせ/ }).first().click().catch(() => {}); await page.waitForTimeout(400); }
  await page.getByTestId('home-dev-row-nl').click(); await page.waitForTimeout(500);
  const det = page.getByTestId('notice-detail'); const bb = await det.boundingBox(); r.phoneTopVisible = !!bb && bb.y >= 0 && bb.y + bb.height <= 844 + 1; if (!r.phoneTopVisible) console.log('BB', JSON.stringify(bb));
  await ctx.close(); }
// ④ カレンダー: 予定の削除の確認は1回
{ const { page, ids } = await start('schedule', "d.scheduleEvents = (d.scheduleEvents || []).filter(e => e.id !== 'evdel'); d.scheduleEvents.push({ id: 'evdel', date: key.slice(0, 10), title: '削除テスト', start: '10:00' });");
  let dialogs = 0; page.removeAllListeners('dialog'); page.on('dialog', d => { dialogs++; d.accept(); });
  await page.locator('text=削除テスト').first().click(); await page.waitForTimeout(500);
  const delBtn = page.locator('button:visible', { hasText: /^削除$/ }).last(); if (await delBtn.count()) { await delBtn.evaluate(b => b.click()); await page.waitForTimeout(800); } else console.log('no delete button');
  r.deleteConfirmOnce = dialogs === 1; if (!r.deleteConfirmOnce) console.log('DIALOGS', dialogs);
  r.deleted = await page.evaluate(() => !(JSON.parse(localStorage.getItem('daycareAppData_v3')).scheduleEvents || []).some(e => e.id === 'evdel'));
  await page.context().close(); void ids; }
// ③ 送迎表: 配布の控えのあとに人を乗せても他の人に赤枠が付かない
{ const { page, ids } = await start('transport', "const dow = new Date(key.slice(0,10)+'T00:00:00').getDay(); ps.forEach(p => { p.scheduleAmPm = ['','','','','','','']; p.scheduleAmPm[dow] = 'AM'; }); d.diarySettings = d.diarySettings || {}; d.diarySettings.cars = [{ id:'car1', name:'1号車', type:'' }, { id:'car2', name:'2号車', type:'' }]; d.transportPlans = d.transportPlans || {}; const base = { cars: { car1: [{ pid: ps[0].id, t: '8:30' }, { pid: ps[1].id, t: '8:40' }], car2: [] }, walkers: [], walkT: {}, others: [], driver: {} }; /* 今: ps[2] を間に入れ、ps[1] は 2号車へ(時間は同じ) → 赤枠は ps[2](配布後に追加)だけ */ d.transportPlans[key] = { cars: { car1: [{ pid: ps[0].id, t: '8:30' }, { pid: ps[2].id, t: '8:35' }], car2: [{ pid: ps[1].id, t: '8:40' }] }, walkers: [], others: [], un: [], memo: '', driver: {}, _base: base, _baseAt: Date.now() - 1000, _baseId: 'b1', _savedAt: Date.now() };");
  await page.waitForTimeout(800); const btn = page.getByTestId('tp-chg-btn'); const txt = (await btn.count()) ? await btn.innerText() : '';
  r.onlyAddedRed = /変更 1件/.test(txt); if (!r.onlyAddedRed) console.log('CHG', txt);
  await btn.click().catch(() => {}); await page.waitForTimeout(400); const pn = page.getByTestId('tp-chg-panel'); const pt = (await pn.count()) ? await pn.innerText() : ''; r.addedOnly = /配布後に追加/.test(pt) && !/乗車順/.test(pt) && !/車が変更/.test(pt); if (!r.addedOnly) console.log('PANEL', pt.slice(0, 300));
  await page.context().close(); void ids; }
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
