// 2026-11-11 trial557: ①スマホのメニューは左→右スワイプで閉じる(右→左では閉じない) ②ホームの近道はスマホでも設定で出したときだけ
//   ③申し送りのボタンは小さく(スマホ 36px) ④基本の送迎表の説明は1行＋ⓘ(押すと残りが出る) ⑤基本の送迎表で時間を入れると反映の知らせ
//   node chk/chk_1111phonemenu.mjs [port]
import { chromium } from 'playwright';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
const b = await chromium.launch();
const swipe = (page, x1, y1, x2, y2) => page.evaluate(([x1, y1, x2, y2]) => { const el = document.elementFromPoint(x1, y1) || document.body; const mk = (type, x, y) => { const t = new Touch({ identifier: 1, target: el, clientX: x, clientY: y, pageX: x, pageY: y }); return new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true }); }; el.dispatchEvent(mk('touchstart', x1, y1)); el.dispatchEvent(mk('touchend', x2, y2)); }, [x1, y1, x2, y2]);
const open = async (page, view) => {
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(900); }
  await page.evaluate((view) => { localStorage.setItem('tsumugiSidebarOpen', '0'); localStorage.setItem('tsumugiTpDriveAck', String(Date.now())); const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.systemSettings = d.systemSettings || {}; if (d.systemSettings.homeTasks) delete d.systemSettings.homeTasks.shortcuts; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view, pid: null, t: Date.now() })); }, view);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1600); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 400 }).catch(() => {});
};
// ---- スマホ ----
{ const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => { console.log('PAGEERROR', e.message.slice(0, 200)); fails++; });
  await open(page, 'dashboard');
  ok((await page.getByTestId('home-shortcuts').count()) === 0, 'ホーム(スマホ): 近道(記録入力・計画書管理・分析)は出ない');
  const mb = page.getByTestId('home-memo-add'); await mb.scrollIntoViewIfNeeded().catch(() => {}); await page.waitForTimeout(200); const bb = await mb.boundingBox().catch(() => null);
  ok(bb && bb.height <= 38 && bb.height >= 30, `「＋ 申し送りを書く」は小さく(高さ ${bb && Math.round(bb.height)}px)`);
  await page.getByTestId('tsu-tab-menu').click(); await page.waitForTimeout(400);
  ok((await page.getByTestId('tsu-phone-menu').count()) === 1, 'メニューが開く');
  await swipe(page, 300, 400, 120, 410); await page.waitForTimeout(400);
  ok((await page.getByTestId('tsu-phone-menu').count()) === 1, '右→左のスワイプでは閉じない');
  await swipe(page, 80, 400, 300, 405); await page.waitForTimeout(400);
  ok((await page.getByTestId('tsu-phone-menu').count()) === 0, '左→右のスワイプで閉じる');
  await page.getByTestId('tsu-tab-menu').click(); await page.waitForTimeout(400);
  await swipe(page, 100, 400, 140, 405); await page.waitForTimeout(300);
  ok((await page.getByTestId('tsu-phone-menu').count()) === 1, '短い動き(40px)では閉じない');
  await page.getByTestId('tsu-phone-menu-close').click(); await page.waitForTimeout(300);
  ok((await page.getByTestId('tsu-phone-menu').count()) === 0, '×でも閉じる');
  await page.screenshot({ path: '/tmp/chk_1111phonemenu_home.png' }).catch(() => {});
  await page.context().close(); }
// ---- PC: 基本の送迎表の説明 ----
{ const page = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => { console.log('PAGEERROR', e.message.slice(0, 200)); fails++; });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(900); }
  const pid = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.systemSettings = d.systemSettings || {}; d.holidays = []; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [] }; delete d.systemSettings.tpBaseReflect; const dow = new Date().getDay(); const ps = d.patients.filter(p => p.status === '利用中' && !p.endDate); ps.forEach((p, i) => { p.scheduleAmPm = ['', '', '', '', '', '', '']; if (i < 3) { p.scheduleAmPm[dow] = 'AM'; p.pickupType = 'fixed'; p.pickupTimes = ['', '', '', '', '', '', '']; p.pickupTimes[dow] = '08:30'; p.pauseHistory = []; p.startDate = '2025-01-01'; } }); d.diarySettings = d.diarySettings || {}; d.diarySettings.cars = [{ id: 'car1', name: '1号車', type: '' }]; d.transportPlans = {}; const tpl = (() => { const x = new Date('2099-01-05T00:00:00'); x.setDate(x.getDate() + (dow === 0 ? 6 : dow - 1)); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; })(); d.transportPlans[`${tpl}_AM`] = { cars: { car1: ps.slice(0, 3).map((p, i) => ({ pid: p.id, t: `8:${30 + i}`, mark: false })) }, walkers: [], others: [], un: [], memo: '', driver: {}, _savedAt: Date.now() }; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); localStorage.setItem('tsumugiTpDriveAck', String(Date.now())); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, date: '2099-01-05', t: Date.now(), ampm: 'AM' })); window.__tpl = tpl; return ps[0].id; });
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
  // ★ trial573: 基本の送迎表の説明の帯(いつもの並び…ⓘ)と時間編集時の自動反映は廃止 → 帯が無いことだけ見る(反映は chk_1113tp572)
  ok((await page.getByTestId('tp-base-banner').count()) === 0, '説明の帯は無い(trial573)');
  await page.screenshot({ path: '/tmp/chk_1111phonemenu_tp.png' }).catch(() => {});
  await page.context().close(); }
await b.close();
console.log(fails ? `FAILS ${fails}` : 'ALL PASS'); process.exit(fails ? 1 : 0);
