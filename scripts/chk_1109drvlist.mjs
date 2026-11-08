// 2026-11-09 trial531: 送迎表の車の見出しを押すと、運転者の候補がそのまま並ぶ(押した名前で決まる・その他・未選択)
//   実行: node scripts/chk_1109drvlist.mjs [port]   (PC と iPad。スマホの送迎表は見るだけの画面で、車の見出しのメニューは無い)
import { chromium, devices } from 'playwright';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
const b = await chromium.launch(); let ok = true;
const mon = new Date(); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7)); const iso = (x) => `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
for (const [label, dev] of [['pc', { viewport: { width: 1366, height: 900 } }], ['ipad', { viewport: { width: 1024, height: 768 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
  const page = await (await b.newContext({ ...dev, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 160)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
  const mi = iso(mon); const SL = 'AM';
  const carId = await page.evaluate(([mi, SL]) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const ps = (d.patients||[]).filter(p => p.status === '利用中').slice(0, 2); const cars = (d.diarySettings?.cars || d.systemSettings?.cars || []); const cid = (cars[0] && cars[0].id) || 'car1';
    d.transportPlans = d.transportPlans || {}; const k = `${mi}_${SL}`; d.transportPlans[k] = { cars: { [cid]: ps.map((p, i) => ({ pid: p.id, t: `8:${30 + i * 5}` })) }, walkers: [], others: [], un: [], memo: '', driver: {}, _savedAt: Date.now() };
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); localStorage.setItem('tsumugiTpDriveAck', String(Date.now()));
    sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, t: Date.now(), date: mi, ampm: SL })); return cid; }, [mi, SL]);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
  await page.locator('button:visible', { hasText: /停車中です/ }).first().click({ timeout: 500 }).catch(() => {});
  const r = {};
  const head = page.getByTestId(`tp-carhead-${mi}-${SL}-${carId}`).first(); r.head = (await head.count()) === 1; if (!r.head) { console.log(label, r, 'no head'); ok = false; continue; }
  await head.click(); await page.waitForTimeout(400);
  const menu = page.getByTestId(`tp-carmenu-${mi}-${SL}-${carId}`); const opts = menu.locator(`[data-testid="tp-driver-${carId}-opt"]`);
  const n = await opts.count(); r.opts_shown_at_once = n >= 1 && (await menu.locator('select').count()) === 0; // 選ぶ欄はなく、候補がそのまま
  r.opt_tall = n >= 1 && (await opts.first().boundingBox()).height >= 44;
  const nm = await opts.first().getAttribute('data-name');
  await opts.first().click(); await page.waitForTimeout(400);
  r.pick_sets_driver = new RegExp(nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(await page.getByTestId(`tp-driver-txt-${mi}-${SL}-${carId}`).innerText());
  r.menu_closed_after_pick = (await menu.count()) === 0;
  // その他
  await head.click(); await page.waitForTimeout(300); r.cur_checked = (await menu.locator('[role="option"][aria-selected="true"]').count()) === 1;
  await page.getByTestId(`tp-driver-${carId}-other-btn`).click(); await page.waitForTimeout(400);
  const inp = page.getByTestId(`tp-driver-${carId}-other-input`); r.other_prompt = (await inp.count()) === 1; await inp.fill('応援 見本'); await page.getByTestId(`tp-driver-${carId}-other-ok`).click(); await page.waitForTimeout(400);
  r.other_set = /応援 見本/.test(await page.getByTestId(`tp-driver-txt-${mi}-${SL}-${carId}`).innerText());
  // 未選択にする
  await head.click(); await page.waitForTimeout(300); r.other_row_marked = /応援 見本/.test(await menu.innerText()) && /その他/.test(await menu.innerText());
  await page.getByTestId(`tp-driver-${carId}-clear`).click(); await page.waitForTimeout(400);
  r.cleared = /未選択/.test(await page.getByTestId(`tp-driver-txt-${mi}-${SL}-${carId}`).innerText());
  // 保存されているか
  r.saved = await page.evaluate(([mi, cid, SL]) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const pl = d.transportPlans[`${mi}_${SL}`]; return !!pl && (pl.driver || {})[cid] === ''; }, [mi, carId, SL]);
  if (label === 'ipad') await page.screenshot({ path: `/tmp/chk_1109drvlist_${label}.png` }).catch(() => {});
  console.log(label, r); if (!Object.values(r).every(Boolean)) ok = false;
  await page.context().close();
}
await b.close(); console.log(ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
