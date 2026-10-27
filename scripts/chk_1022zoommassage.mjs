// 2026-10-22 試験版: 提供記録
//  ・拡大入力(虫眼鏡)で介護整体を選べる(担当を選ぶ→✓実施にする)
//  ・拡大入力の個別運動「10秒×3セット」が1行(折り返さない)
//  ・スマホ縦(390px)のカードにも介護整体の欄があり選べる・吹き出しが画面からはみ出さない・個別運動の値が1行
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4173'; })();
const b = await chromium.launch(); const r = {};
const LONG = '10秒×3セット';
async function open(opt) { const ctx = await b.newContext({ locale: 'ja-JP', timezoneId: 'Asia/Tokyo', ...opt }); const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  const cfg = await page.evaluate((LONG) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const ss = d.systemSettings = d.systemSettings || {};
    if (!Array.isArray(ss.exerciseItems) || !ss.exerciseItems.length) ss.exerciseItems = [{ id: 'u1', name: '①ﾊﾞｲｸ', type: 'text', useKeypad: true, defaultUnit: '分' }, { id: 'u2', name: '②ﾚｯｸﾞP', type: 'text', useKeypad: true, defaultUnit: 'kg' }, { id: 'onyoku', name: '温浴', type: 'text', useKeypad: true, defaultUnit: '分' }];
    let slot = ss.exerciseItems.find(i => i.type === 'individual'); if (!slot) { slot = { id: 'ind_slot_t', name: '個別運動②', type: 'individual' }; ss.exerciseItems.push(slot); }
    ss.individualExerciseItems = (ss.individualExerciseItems || []).filter(x => x.id !== 'ix_knee_t'); ss.individualExerciseItems.unshift({ id: 'ix_knee_t', name: '膝伸ばし（枕）' });
    if (!Array.isArray(ss.massageStaff) || !ss.massageStaff.length) ss.massageStaff = ['見本A', '見本B', '見本C'];
    (d.patients || []).forEach(p => { p.individualExercises = [{ itemId: 'ix_knee_t', defaultValue: LONG }]; p.individualExerciseSlotDefaults = { [slot.id]: 'ix_knee_t' }; p.individualExercisesHistory = []; });
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); return { slot: slot.id, staff: ss.massageStaff }; }, LONG);
  await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'record', pid: null, t: Date.now() }))); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
  await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 600 }).catch(() => {}); return { page, cfg }; }
// 1行かどうか: AutoFitText の span の高さが文字の大きさの1.6倍未満・横にはみ出さない
const oneLine = (loc) => loc.evaluate((el, LONG) => { const sp = [...el.querySelectorAll('span')].find(s => s.textContent === LONG && !s.querySelector('span')); if (!sp) return { found: false, text: el.innerText }; const fs = parseFloat(getComputedStyle(sp).fontSize); const h = sp.getBoundingClientRect().height; const par = sp.parentElement; return { found: true, fs, h, one: h < fs * 1.6, fit: sp.scrollWidth <= par.clientWidth + 1 }; }, LONG);
// ---- iPad 横: 拡大入力 ----
{ const { page, cfg } = await open({ viewport: { width: 1180, height: 820 }, hasTouch: true }); console.log('cfg', JSON.stringify(cfg));
  const row = page.locator('#record-table tr[data-rv-pid]:not([data-rv-status="欠席"]):not([data-rv-status="休業"]):not([data-rv-status="休止"])').first();
  await row.locator('button[title="この方だけを大きな文字で入力します"]').first().click(); await page.waitForTimeout(600);
  const ind = page.getByTestId(`zoom-ind-${cfg.slot}`); const ol = await oneLine(ind); console.log('zoom ind', JSON.stringify(ol)); r.zoomIndOneLine = ol.found && ol.one && ol.fit && ol.fs >= 12;
  const zm = page.getByTestId('zoom-massage'); r.zoomMassageShown = await zm.isVisible(); r.zoomMassageEnabled = await zm.isEnabled();
  await zm.click(); await page.waitForTimeout(400); r.zoomMenu = await page.getByText('担当を選ぶ', { exact: true }).isVisible();
  await page.locator('button:visible', { hasText: new RegExp(`^${cfg.staff[1]}$`) }).last().click(); await page.waitForTimeout(500);
  r.zoomChosen = (await zm.innerText()).includes(cfg.staff[1]); console.log('zoom chosen', JSON.stringify(await zm.innerText()));
  await zm.click(); await page.waitForTimeout(400); await page.locator('button:visible', { hasText: '実施にする' }).last().click(); await page.waitForTimeout(500);
  r.zoomDone = /実施済み/.test(await zm.innerText()); console.log('zoom done', JSON.stringify(await zm.innerText()));
  await page.screenshot({ path: '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad/zoommassage_ipad.jpg', type: 'jpeg', quality: 60, fullPage: false });
  await page.locator('button:visible', { hasText: /^閉じる$/ }).first().click(); await page.waitForTimeout(500);
  const pid = await row.getAttribute('data-rv-pid'); r.tableReflects = (await page.locator(`#record-table tr[data-rv-pid="${pid}"]`).innerText()).includes(cfg.staff[1]);
  await page.context().close(); }
// ---- スマホ縦(カード) ----
{ const { page, cfg } = await open({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const cards = page.locator('.tsu-rv-cards [data-rec-card]'); const n = await cards.count(); let card = null, cid = null;
  for (let i = 0; i < n; i++) { const c = cards.nth(i); const id = await c.getAttribute('data-rec-card'); if (await page.getByTestId(`m-massage-${id}`).count() && await page.getByTestId(`m-massage-${id}`).isEnabled()) { card = c; cid = id; break; } }
  r.phoneMassageShown = !!card;
  if (card) { const ib = page.getByTestId(`m-ind-btn-${cfg.slot}-${cid}`); await ib.scrollIntoViewIfNeeded(); const ol = await oneLine(ib); console.log('phone ind', JSON.stringify(ol)); r.phoneIndOneLine = ol.found && ol.one && ol.fit && ol.fs >= 8;
    const mb = page.getByTestId(`m-massage-${cid}`); await mb.scrollIntoViewIfNeeded(); await mb.click(); await page.waitForTimeout(400);
    const menu = page.getByText('担当を選ぶ', { exact: true }); r.phoneMenu = await menu.isVisible();
    const box = await menu.evaluate(el => { let m = el; while (m && getComputedStyle(m).position !== 'fixed') m = m.parentElement; const b = m.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; }); console.log('phone menu', JSON.stringify(box)); r.phoneMenuInside = box.l >= 0 && box.r <= 390 && box.t >= 0 && box.b <= 844;
    await page.locator('button:visible', { hasText: new RegExp(`^${cfg.staff[0]}$`) }).last().click(); await page.waitForTimeout(500);
    r.phoneChosen = (await mb.innerText()).includes(cfg.staff[0]); console.log('phone chosen', JSON.stringify(await mb.innerText()));
    await page.screenshot({ path: '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad/zoommassage_phone.jpg', type: 'jpeg', quality: 60 });
    // 拡大入力(スマホ)でも1行
    await card.locator('button[title="この方だけを大きな文字で入力します"]').first().click(); await page.waitForTimeout(600);
    const ol2 = await oneLine(page.getByTestId(`zoom-ind-${cfg.slot}`)); console.log('phone zoom ind', JSON.stringify(ol2)); r.phoneZoomOneLine = ol2.found && ol2.one && ol2.fit;
    r.phoneZoomMassage = (await page.getByTestId('zoom-massage').innerText()).includes(cfg.staff[0]);
    await page.screenshot({ path: '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad/zoommassage_phonezoom.jpg', type: 'jpeg', quality: 60 }); }
  await page.context().close(); }
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
