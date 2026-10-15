// エリア担当者向け「10月の更新まとめ(10/6〜10/15)」の画面写真(見本＝架空データのみ・今日基準)
//   安定版デモを 4173 で配信してから: node scripts/a15_shots.mjs --out <dir> [--only seat,diary,...]
import { chromium, devices } from 'playwright';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://localhost:4173'); const OUT = arg('--out', '/tmp/a15'); const ONLY = arg('--only', '');
const want = (k) => !ONLY || ONLY.split(',').includes(k);
const log = (...a) => console.log('[a15]', ...a);
const FAC = 'つむぎ デイサービス（見本）', TEL = '03-0000-0000';
const today = new Date(); const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
const b = await chromium.launch();
const routeMock = async (page) => page.route('**/api/route-plan', async (route) => { const rq = route.request(); if (rq.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ configured: true }) }); const bd = JSON.parse(rq.postData() || '{}'); const n = (bd.stops || []).length; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ order: [...Array(n).keys()], legSeconds: Array(n + 1).fill(360), stopCoords: (bd.stops || []).map((_, i) => ({ lat: 35.6 + i * 0.001, lng: 139.7 })), originCoord: { lat: 35.6, lng: 139.7 } }) }); });
const login = async (page) => { await page.goto(`${BASE}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800); if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); } };
const go = async (page, view) => { await page.evaluate((v) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: null, t: Date.now() })), view); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1600); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 400 }).catch(() => {}); };
const shot = async (loc, name) => { try { await loc.scrollIntoViewIfNeeded().catch(() => {}); await loc.screenshot({ path: `${OUT}/${name}.png` }); log('ok', name); } catch (e) { log('NG', name, String(e).slice(0, 120)); } };
// 見本データ: 事業所名・職員・車・今日の利用者(AM 8名・PM 3名)と送迎表
const seed = (page, opt = {}) => page.evaluate(({ iso, FAC, TEL, opt }) => {
  const d = JSON.parse(localStorage.getItem('daycareAppData_v3'));
  d.systemSettings = d.systemSettings || {};
  d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), name: FAC, phone: TEL, address: '東京都江東区見本町9-9', serviceTimeAM: '9:00～12:05', serviceTimePM: '13:20～16:25' };
  if (d.contactBookConfig) d.contactBookConfig.facilityName = FAC;
  d.diarySettings.cars = [{ id: 'cS', name: 'シエンタ', type: '', cap: '5' }, { id: 'cT', name: 'ステップ', type: '', cap: '7', seatRows: '3-3' }, { id: 'cK', name: 'タント', type: '', cap: '3' }];
  d.diarySettings.staff = [{ id: 'm1', name: '見本 管理一', role: '管理者' }, { id: 's1', name: '見本 相談二', role: '生活相談員', role2: '管理者' }, { id: 'st1', name: '見本 運転一', role: '介護職員' }, { id: 'st2', name: '見本 運転二', role: '介護職員' }, { id: 'k1', name: '見本 介護三', role: '介護職員' }];
  d.diarySettings.hideStaffTemp = true;
  const now = new Date(iso); const dow = now.getDay(); const act = d.patients.filter(p => p.status === '利用中');
  act.forEach((p, i) => { const s = ['', '', '', '', '', '', '']; if (i < 7) s[dow] = 'AM'; else if (i >= 8 && i < 11) s[dow] = 'PM'; p.scheduleAmPm = s; p.scheduleChangeHistory = []; p.pickupTimes = ['', '', '', '', '', '', '']; p.address = `東京都江東区見本町1-${i + 1}`; if (i === 1) p.pickupMinutes = '3'; });
  const mk = iso.slice(0, 7); d.monthlyShifts = { [mk]: { [act[7].id]: { [`${now.getDate()}_AM`]: '振替' } } };
  const pk = (arr, h, m0) => arr.map((p, i) => ({ pid: p.id, t: `${h}:${String(m0 + i * 6).padStart(2, '0')}`, mark: false }));
  d.transportPlans = {
    [`${iso}_AM`]: { cars: { cS: pk(act.slice(0, 4), 8, 30), cT: pk([act[4], act[7]], 8, 36), cK: pk(act.slice(5, 7), 8, 40) }, walkers: [], others: [], un: [], memo: '', driver: { cS: '見本 運転一', cT: '見本 運転二', cK: '見本 介護三' }, _savedAt: Date.now() },
    [`${iso}_PM`]: { cars: { cS: pk(act.slice(8, 11), 12, 55), cT: [], cK: [] }, walkers: [], others: [], un: [], memo: '', driver: { cS: '見本 運転一' }, _savedAt: Date.now() },
  };
  d.diaryLogs = {};
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d));
}, { iso, FAC, TEL, opt });

// ---------- 1. 送迎表(パソコン) ----------
if (want('tp')) { const ctx = await b.newContext({ locale: 'ja-JP', timezoneId: 'Asia/Tokyo', viewport: { width: 1366, height: 900 }, deviceScaleFactor: 2 }); const page = await ctx.newPage();
  page.on('dialog', d => d.accept()); page.on('pageerror', e => log('PAGEERROR', e.message.slice(0, 160))); await routeMock(page);
  await login(page); await seed(page); await go(page, 'transport');
  // 自動計算の画面
  await page.getByTestId('tp-autocalc').click(); await page.waitForTimeout(500);
  await shot(page.getByTestId('ac-arrive').locator('xpath=..'), 'a15_ac_modal');
  await page.locator('button', { hasText: '計算する' }).click(); await page.waitForTimeout(3500);
  // シエンタの到着だけ手で 8:57 に
  await page.getByTestId(`tp-arrive-${iso}-AM-cS`).click(); await page.waitForTimeout(300);
  for (let k = 0; k < 5; k++) await page.keyboard.press('Backspace'); await page.keyboard.type('857'); await page.waitForTimeout(150);
  await shot(page.getByTestId('tsu-kp').locator(':scope > div'), 'a15_tp_arrive_kp');
  await page.keyboard.press('Enter'); await page.waitForTimeout(600);
  await shot(page.locator(`[data-tpdrop="cS"][data-tpiso="${iso}"][data-tpslot="AM"]`).locator('xpath=..'), 'a15_tp_cell');
  // 送迎表の設定
  await page.locator('button', { hasText: /^設定$/ }).first().click(); await page.waitForTimeout(500);
  await shot(page.getByTestId('tp-set-arrive-info').locator('xpath=..'), 'a15_tp_settings');
  await page.locator('button', { hasText: /^閉じる$/ }).last().click(); await page.waitForTimeout(300);
  // 座席表(AM送り)
  await page.getByTestId(`tp-dropsame-${iso}-AM`).click(); await page.waitForTimeout(900);
  for (const [cid, nm] of [['cS', '見本 運転一'], ['cT', '見本 運転二'], ['cK', '見本 介護三']]) await page.getByTestId(`tp-seat-driver-${cid}`).selectOption(nm).catch(() => {});
  await page.getByTestId('tp-seat-depart-est').click(); await page.waitForTimeout(600);
  await page.locator('[data-testid="tp-seatcar-cS"] input').first().fill('前・横'); await page.locator('[data-testid="tp-seatcar-cS"] input').first().press('Tab'); await page.waitForTimeout(300);
  await shot(page.getByTestId('tp-seat-modal').locator(':scope > div').first(), 'a15_seat_modal');
  await page.getByTestId('tp-seatcar-cS').getByTestId('tp-seat-no').first().click(); await page.waitForTimeout(400);
  await shot(page.getByTestId('tp-seatcar-cS'), 'a15_seat_order');
  await page.getByTestId('tp-ord-close').click().catch(() => {}); await page.waitForTimeout(200);
  await page.getByTestId('tp-seat-depart-cT').click(); await page.waitForTimeout(300);
  await shot(page.getByTestId('tsu-kp').locator(':scope > div'), 'a15_seat_depart_kp');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  await page.getByTestId('tp-seat-close').click(); await page.waitForTimeout(300);
  // 確定 → 確定後の表示
  await page.getByTestId('tp-finalize').click().catch(() => {}); await page.waitForTimeout(1200);
  await shot(page.getByTestId(`tp-fb-cell-${iso}-AM`), 'a15_tp_final_cell');
  // 日誌: 送迎表取込(未取込の札)
  await go(page, 'diary'); await page.locator('button', { hasText: /^AM$/ }).first().click().catch(() => {}); await page.waitForTimeout(800);
  await shot(page.locator('button', { hasText: '送迎表取込' }).first().locator('xpath=..'), 'a15_diary_bar');
  await page.locator('button', { hasText: '送迎表取込' }).first().click(); await page.waitForTimeout(900);
  await shot(page.locator('[data-testid="diary-sec-cars"], #diary-sec-cars').first(), 'a15_diary_cars');
  await ctx.close(); }

// ---------- 2. 日誌(スマホ): 時間のテンキーの目安・兼務 ----------
if (want('diaryphone')) { const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage();
  page.on('dialog', d => d.dismiss()); page.on('pageerror', e => log('PAGEERROR', e.message.slice(0, 160)));
  await login(page); await seed(page);
  await page.evaluate((iso) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.diaryLogs = { [`${iso}_AM`]: { pick: Object.fromEntries((d.transportPlans[`${iso}_AM`].cars.cS || []).map(m => [`${m.pid}_cS`, true])) } }; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); }, iso);
  await go(page, 'diary'); await page.locator('button', { hasText: /^AM$/ }).first().click().catch(() => {}); await page.waitForTimeout(800);
  // 兼務: 生活相談員の欄だけ・管理者の欄は別
  const click = async (role, name) => page.evaluate(([role, name]) => { const box = document.querySelector('[data-testid="diary-phone-checks"]'); const g = [...box.querySelectorAll(':scope > div')].find(x => (x.querySelector('div')?.textContent || '').trim() === role); const bt = g && [...g.querySelectorAll('button')].find(x => x.textContent.includes(name)); if (bt) bt.click(); }, [role, name]);
  await click('管理者', '見本 管理一'); await page.waitForTimeout(250); await click('生活相談員', '見本 相談二'); await page.waitForTimeout(250);
  await shot(page.getByTestId('diary-phone-checks'), 'a15_diary_kenmu');
  await page.getByTestId('dpc-time-pick-cS').click(); await page.waitForTimeout(400);
  for (let k = 0; k < 6; k++) await page.keyboard.press('Backspace'); await page.keyboard.type('0858'); await page.waitForTimeout(200);
  await shot(page.getByTestId('kp-svc-hint').locator('xpath=ancestor::div[contains(@style,"border-radius")][1]'), 'a15_diary_kp');
  await ctx.close(); }

// ---------- 3. スマホ: 送迎表の運転手向け1日リスト ----------
if (want('dl')) { const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage();
  page.on('dialog', d => d.accept()); page.on('pageerror', e => log('PAGEERROR', e.message.slice(0, 160)));
  await login(page); await seed(page);
  await page.evaluate((iso) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const pl = d.transportPlans[`${iso}_AM`]; const act = d.patients.filter(p => p.status === '利用中'); act.slice(0, 4).forEach((p, i) => { p.phoneMobile = `090-0000-000${i + 1}`; if (i === 0) p.pickupPlace = '玄関前'; }); pl.arrive = { cS: '8:59', cT: '8:59', cK: '8:59' }; pl.arriveAuto = { cS: true, cT: true, cK: true }; pl._final = JSON.parse(JSON.stringify({ cars: pl.cars, walkers: [], others: [], driver: pl.driver })); pl._finalAt = Date.now() - 3600000; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); }, iso);
  await go(page, 'transport'); await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/a15_phone_daylist.png`, clip: { x: 0, y: 0, width: 390, height: 760 } }); log('ok a15_phone_daylist');
  await ctx.close(); }

// ---------- 4. 提供記録: 気分のあとに特記へ書く内容 ----------
if (want('kibun')) { const ctx = await b.newContext({ locale: 'ja-JP', timezoneId: 'Asia/Tokyo', viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 }); const page = await ctx.newPage();
  page.on('dialog', d => d.accept()); page.on('pageerror', e => log('PAGEERROR', e.message.slice(0, 160)));
  await page.clock.install({ time: new Date('2026-10-07T10:40:00') });
  await login(page);
  await page.evaluate(({ FAC }) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.systemSettings = { ...(d.systemSettings || {}), keypadDisabled: true, kibunDisabled: false, facilityInfo: { ...((d.systemSettings || {}).facilityInfo || {}), name: FAC } }; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); }, { FAC });
  await go(page, 'record');
  const pidE = await page.evaluate(() => { const e = [...document.querySelectorAll('table textarea[maxlength="100"]:not([disabled])')][0]; const tr = e && e.closest('tr'); const re = tr && tr.querySelector('[data-testid^="bp-re-St-"]'); return re ? re.getAttribute('data-testid').replace('bp-re-St-', '') : null; });
  const row = page.locator(`tr:has([data-testid="bp-re-St-${pidE}"])`).first();
  await row.locator('td button', { hasText: '通所' }).first().click(); await page.waitForTimeout(400);
  await page.locator('button', { hasText: /^😊?\s*良い$/ }).first().click().catch(async () => { await page.locator('button:has-text("良い")').nth(1).click(); }); await page.waitForTimeout(400);
  await page.locator('[data-testid="kibun-note"] textarea').fill('昨夜はよく眠れたとのこと'); await page.waitForTimeout(200);
  await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: `${OUT}/a15_kibun.png` }); log('ok a15_kibun');
  await ctx.close(); }
await b.close();
