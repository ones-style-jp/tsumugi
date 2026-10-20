// 2026-10-21 マニュアル(事業所向け)「24 試験版の新しい機能」のスクリーンショット(見本データ・試験版のデモ)。機能ごとに必要な部分だけ切り出す
//   試験版を VITE_E2E_DEMO=1 でビルドし vite preview --port 4173 で配信してから: node scripts/manual_shots_trial.mjs --out <出力先>
//   → sips で jpg(PC 1366・スマホ 780 以下)にして public/manual/img/trial_*.jpg へ
import { chromium } from 'playwright';
import fs from 'fs';
const OUT = (() => { const i = process.argv.indexOf('--out'); return i >= 0 ? process.argv[i + 1] : 'manual_new'; })(); fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch(); const done = [];
const today = new Date(); const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
const fakeSR = () => { window.SpeechRecognition = window.webkitSpeechRecognition = class { start() {} stop() { this.onend && this.onend(); } abort() {} }; };
async function open(opt, init) { const ctx = await b.newContext({ locale: 'ja-JP', timezoneId: 'Asia/Tokyo', deviceScaleFactor: 2, ...opt }); await ctx.addInitScript(fakeSR); if (init) await ctx.addInitScript(init); const page = await ctx.newPage(); page.on('dialog', d => d.accept());
  await page.route('**/api/route-plan', async (route) => { if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ configured: true }) }); const body = JSON.parse(route.request().postData() || '{}'); const n = (body.stops || []).length; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ order: [...Array(n).keys()], legSeconds: [600, 300, 420, 900, 300, 360].slice(0, n + 1) }) }); });
  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  return page; }
const tab = (page, label) => page.evaluate((label) => { const bs = [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === label && [...b.parentElement.querySelectorAll('button')].some(x => x.textContent.trim() === 'システム')); if (bs[0]) bs[0].click(); return bs.length; }, label);
const go = async (page, view, ex = {}) => { await page.evaluate(([v, ex]) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: null, t: Date.now(), ...ex })), [view, ex]); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); };
const shot = async (name, fn) => { try { await fn(); done.push(name); } catch (e) { console.log('SKIP', name, String(e.message).slice(0, 400).replace(/\n/g, ' | ')); } };
const clipOf = async (page, loc, pad = 8) => { const bb = await loc.boundingBox(); return { x: Math.max(0, bb.x - pad), y: Math.max(0, bb.y - pad), width: bb.width + pad * 2, height: bb.height + pad * 2 }; };
const longPress = async (page, loc) => { const bb = await loc.boundingBox(); await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down(); await page.waitForTimeout(700); await page.mouse.up(); await page.waitForTimeout(300); };
const seedTp = (page, custom) => page.evaluate(([iso, custom]) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.diarySettings.cars = [{ id: 'c1', name: '1号車', type: '', cap: '6' }, { id: 'c2', name: '2号車', type: '', cap: '4' }];
  const fi = d.systemSettings.facilityInfo = d.systemSettings.facilityInfo || {}; fi.serviceTimeAM = fi.serviceTimeAM || '9:00～12:05';
  const act = d.patients.filter(p => p.status === '利用中' && p.address).slice(0, 5); const dow = new Date(iso + 'T00:00:00').getDay(); act.forEach((p, i) => { p.scheduleAmPm = ['', '', '', '', '', '', '']; p.scheduleAmPm[dow] = 'AM'; p.pickupMinutes = 2; });
  const c1 = act.slice(0, 3), c2 = act.slice(3, 5);
  const P = { cars: { c1: c1.map((p, i) => ({ pid: p.id, t: `8:${25 + i * 8}` })), c2: c2.map((p, i) => ({ pid: p.id, t: `8:${30 + i * 9}` })) }, walkers: [], others: [], un: [], driver: { c1: (d.diarySettings.staff || [])[0]?.name || '' }, _savedAt: Date.now() };
  P.dropAt = {}; P.dropAtAuto = {}; [...c1].reverse().forEach((p, i) => { P.dropAt[String(p.id)] = `12:${22 + i * 7}`; P.dropAtAuto[String(p.id)] = true; }); [...c2].reverse().forEach((p, i) => { P.dropAt[String(p.id)] = `12:${25 + i * 8}`; P.dropAtAuto[String(p.id)] = i === 0; });
  if (custom) { P.dropMode = 'custom'; P.drop = { cars: { c1: [...c1].reverse().map((p, i) => ({ pid: p.id, seat: i })), c2: [...c2].reverse().map((p, i) => ({ pid: p.id, seat: i })) }, walkers: [], others: [], depart: { c1: '12:12', c2: '12:10' } }; }
  d.transportPlans = { [`${iso}_AM`]: P }; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); return act.map(p => p.id); }, [iso, custom]);
// ---- 提供記録(iPad 横)
{ const page = await open({ viewport: { width: 1180, height: 820 } }); await go(page, 'record');
  const rows = page.locator('#record-table tr[data-rv-pid][data-rv-status="出席"]'); const pid = async (i) => rows.nth(i).getAttribute('data-rv-pid');
  await shot('trial_rv_highlight', async () => { await longPress(page, page.getByTestId(`rv-name-${await pid(0)}`)); await longPress(page, page.getByTestId(`rv-name-${await pid(3)}`)); await rows.nth(1).locator('td').last().evaluate(td => td.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }))); await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/trial_rv_highlight.png`, clip: { x: 256, y: 40, width: 924, height: 400 } }); });
  await shot('trial_rv_tokki', async () => { const sel = page.locator('[data-testid^="rv-tokki-pick-"]').first(); await sel.scrollIntoViewIfNeeded(); await page.waitForTimeout(300); const td = sel.locator('xpath=ancestor::td[1]'); const bb = await td.boundingBox(); await page.screenshot({ path: `${OUT}/trial_rv_tokki.png`, clip: { x: Math.max(256, bb.x - 140), y: Math.max(0, bb.y - 50), width: Math.min(924, bb.width + 150), height: 180 } }); });
  await page.getByTestId('rv-marks-clear').click().catch(() => {});
  await shot('trial_rv_order', async () => { await page.getByTestId('rec-order-btn').first().click(); await page.waitForTimeout(500); const m = page.getByTestId('rec-order-modal').locator('> div').first(); await page.screenshot({ path: `${OUT}/trial_rv_order.png`, clip: await clipOf(page, m, 4) }); await page.locator('button', { hasText: /^キャンセル$/ }).first().click(); await page.waitForTimeout(300); });
  await shot('trial_rv_bulkex', async () => { await page.getByTestId('rec-act-bulkex').click(); await page.waitForTimeout(500); const its = page.getByTestId('bulk-ex-items').locator('button, label'); const nIt = await its.count(); for (let k = 0; k < Math.min(2, nIt); k++) { await its.nth(k).click(); await page.waitForTimeout(150); } const nx = page.getByTestId('bulk-ex-next'); if (await nx.count() && await nx.isEnabled()) { await nx.click(); await page.waitForTimeout(500); } const m = page.getByTestId('bulk-ex-modal'); await page.screenshot({ path: `${OUT}/trial_rv_bulkex.png`, clip: await clipOf(page, m.locator('> div').first(), 4) }); await page.locator('button:visible', { hasText: /^(キャンセル|閉じる|やめる)$/ }).last().click().catch(() => {}); await page.waitForTimeout(400); });
  await page.context().close(); }
// ---- 提供記録(スマホ)
{ const page = await open({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await go(page, 'record');
  await shot('trial_rv_phone', async () => { const card = page.locator('[data-rec-card]').first(); await card.evaluate(e => e.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }))); await page.waitForTimeout(300); await page.screenshot({ path: `${OUT}/trial_rv_phone.png` }); });
  await go(page, 'diary'); await shot('trial_diary_phone', async () => { await page.screenshot({ path: `${OUT}/trial_diary_phone.png` }); });
  await go(page, 'absence_fax'); await shot('trial_abs_today', async () => { await page.getByTestId('abs-today').scrollIntoViewIfNeeded(); await page.screenshot({ path: `${OUT}/trial_abs_today.png` }); });
  await page.evaluate((iso) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.scheduleEvents = [{ id: 'e1', date: iso, start: '10:00', end: '11:00', title: '担当者会議', color: '#3b82f6' }, { id: 'e2', date: iso, start: '14:00', end: '15:00', title: '見学', color: '#10b981' }]; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); }, iso);
  await go(page, 'schedule'); await shot('trial_sched_phone', async () => { await page.screenshot({ path: `${OUT}/trial_sched_phone.png` }); });
  await page.context().close(); }
// ---- 送迎表(PC)
{ const page = await open({ viewport: { width: 1366, height: 900 } }); await seedTp(page, false); await go(page, 'transport', { date: iso, ampm: 'AM' });
  await shot('trial_tp_grid_dropat', async () => { const col = page.getByTestId(`tp-time-${(await page.locator('[data-testid^="tp-dat-"]').first().getAttribute('data-testid')).replace('tp-dat-', '')}`).locator('xpath=ancestor::div[contains(@class,"rounded")][1]'); await page.screenshot({ path: `${OUT}/trial_tp_grid_dropat.png`, clip: await clipOf(page, col, 6) }); });
  await shot('trial_tp_driver_other', async () => { const sel = page.locator('select[data-testid="tp-driver-c1"]').first(); await sel.selectOption('__other__'); await page.waitForTimeout(400); await page.getByTestId('tp-driver-c1-other-input').fill('応援 見本'); await page.waitForTimeout(200); const m = page.getByTestId('tp-driver-c1-other').locator('> div').first(); await page.screenshot({ path: `${OUT}/trial_tp_driver_other.png`, clip: await clipOf(page, m, 4) }); await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(300); });
  await shot('trial_tp_sheet', async () => { await page.evaluate(() => { window.__ph = ''; window.addEventListener('setPrintHtml', e => { window.__ph = (e.detail && e.detail.html) || ''; }); }); await page.locator('button:visible', { hasText: /^ダウンロード$/ }).first().click(); await page.waitForTimeout(500); await page.locator('button:visible', { hasText: /^ダウンロード$/ }).last().click(); await page.waitForTimeout(1500); const ph = await page.evaluate(() => window.__ph);
    fs.writeFileSync(`${OUT}/sheet.html`, `<!doctype html><meta charset=utf-8><body style="margin:0;background:#fff">${ph}</body>`); const p2 = await (await b.newContext({ viewport: { width: 1123, height: 794 }, deviceScaleFactor: 2 })).newPage(); await p2.goto('file://' + `${OUT}/sheet.html`); await p2.waitForTimeout(400); await p2.screenshot({ path: `${OUT}/trial_tp_sheet.png`, clip: { x: 0, y: 0, width: 1123, height: 330 } }); await p2.context().close(); });
  await page.context().close(); }
{ const page = await open({ viewport: { width: 1366, height: 900 } }); await seedTp(page, true); await go(page, 'transport', { date: iso, ampm: 'AM' });
  await shot('trial_tp_seat', async () => { await page.getByTestId(`tp-seatbtn-${iso}-AM`).first().click().catch(async () => { await page.getByTestId(`tp-fb-seatbtn-${iso}-AM`).first().click(); }); await page.waitForTimeout(800); const car = page.getByTestId('tp-seatcar-c1'); await page.screenshot({ path: `${OUT}/trial_tp_seat.png`, clip: await clipOf(page, car, 10) }); });
  await page.context().close(); }
// ---- 体力測定(PC)
{ const page = await open({ viewport: { width: 1366, height: 900 } });
  const pid = await page.evaluate(() => JSON.parse(localStorage.getItem('daycareAppData_v3')).patients.find(x => x.status === '利用中').id);
  await page.evaluate((pid) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'fitness', pid, t: Date.now() })), pid); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
  const items = await page.locator('[data-testid^="fit-note-btn-"]').evaluateAll(els => els.map(e => e.getAttribute('data-testid').replace('fit-note-btn-', '')));
  await page.evaluate(([pid, items]) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const notes = {}; if (items[2]) notes[items[2]] = '休憩あり'; if (items[5]) notes[items[5]] = '杖使用'; const vals = { [items[0]]: '152', [items[1]]: '48.5', [items[2]]: '18.2', [items[3]]: '16.0', [items[4]]: '9', [items[5]]: '12.4' };
    d.fitnessRecords = [...(d.fitnessRecords || []).filter(r => r.patientId !== pid), { id: 9001, patientId: pid, date: '2026-07-15', values: vals, notes, memo: '前回は少し疲れ気味', recorder: '見本 管理', _savedAt: Date.now() }]; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); }, [pid, items]);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/dbg_fit.png` });
  await shot('trial_fit_note', async () => { const nb = page.locator('[data-testid^="fit-note-btn-"]').nth(1); if (await nb.count()) { await nb.click(); await page.waitForTimeout(300); } const box = page.getByTestId('fit-prev-notes').locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]'); const bb = await box.boundingBox(); await page.screenshot({ path: `${OUT}/trial_fit_note.png`, clip: { x: bb.x - 6, y: bb.y - 6, width: bb.width + 12, height: Math.min(420, bb.height + 12) } }); });
  await page.context().close(); }
// ---- 各種設定・連絡帳(PC)
{ const page = await open({ viewport: { width: 1280, height: 900 } }, () => { window.__tsumugiE2E = { ...(window.__tsumugiE2E || {}), staffCtx: { enabled: true, kind: 'person', role: 'manager', displayName: '見本 管理', hasPin: true, membersWithoutAccount: [], setPin: async () => {}, sharedDevice: async () => {} } }; });
  await go(page, 'settings'); await tab(page, 'サービス提供内容'); await page.waitForTimeout(600);
  await shot('trial_set_tokki', async () => { const c = page.getByTestId('tokki-preset-card'); await c.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${OUT}/trial_set_tokki.png`, clip: await clipOf(page, c, 4) }); });
  await tab(page, '体力測定'); await page.waitForTimeout(600);
  await shot('trial_set_fitpreset', async () => { const c = page.getByTestId('fit-preset-card'); await c.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${OUT}/trial_set_fitpreset.png`, clip: await clipOf(page, c, 4) }); });
  await tab(page, 'システム'); await page.waitForTimeout(600);
  await shot('trial_set_security', async () => { const c = page.getByTestId('login-security').locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]'); await c.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${OUT}/trial_set_security.png`, clip: await clipOf(page, c, 4) }); });
  await go(page, 'print'); await page.locator('button:visible', { hasText: /^各種入力/ }).first().click().catch(() => {}); await page.waitForTimeout(600);
  await shot('trial_cb_hub', async () => { const c = page.getByTestId('cb-hub-renraku').locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]'); await page.screenshot({ path: `${OUT}/trial_cb_hub.png`, clip: await clipOf(page, c, 4) }); });
  await page.context().close(); }
console.log('done', done.length, done.join(' ')); await b.close();
