// 2026-10-29 ユーザー「それらに合わせてマニュアルのスクショを変更しといて」
//   各種設定(左に縦の項目)・個人ファイル(左にカテゴリ)・ケアマネ事業所・担当者(上の帯なし)・家族関係者閲覧 管理(送付先の印・イベント/クラスなし)・
//   計画書(左の縦の並び)に合わせて、マニュアルの写真を撮り直す。試験版の見本ビルド(VITE_E2E_DEMO=1)を配信してから
//   node scripts/manual_shots_1029.mjs [--base http://localhost:4175] [--out public/manual/img]
//   ★ 見本データには実在の店舗名・電話番号・職員の名前が入っているので、事業所名・住所・電話・管理者・職員・利用者の住所と電話を架空に置き換えて撮る。
//     実在のもの(店舗名・番号・職員の名前)が画面の文字にも入力欄の中にも残っていたら、その写真は保存せずに止める
import { chromium } from 'playwright';
import path from 'node:path';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://localhost:4175'); const OUT = arg('--out', 'public/manual/img');
const NG = /扇橋|6458|ひかり|佐藤 健一|高橋|岩岡|長谷川|田中/;
const b = await chromium.launch();
const seed = () => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const nm = '（見本）つむぎデイサービス', ph = '03-0000-0000';
  d.facilityName = nm; d.facilityPhone = ph; d.contactBookConfig = { ...(d.contactBookConfig || {}), facilityName: nm, facilityPhone: ph };
  d.systemSettings = d.systemSettings || {};
  d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), name: nm, phone: ph, fax: '03-0000-0001', address: '東京都新宿区西新宿2-8-1', zip: '', zipCode: '', building: '', email: '', manager: '見本 管理者', serviceResponsible: '見本 管理者' };
  d.systemSettings.massageStaff = ['見本A', '見本B', '見本C', 'ヘルプ'];
  let k = 0; const fixed = { '管理者': '見本 管理者', '機能訓練指導員': '見本 訓練', '生活相談員': '見本 相談' };
  d.diarySettings = d.diarySettings || {}; d.diarySettings.staff = (d.diarySettings.staff || []).map(s => ({ ...s, name: !s.name ? '' : (fixed[s.role] || `見本 職員${'ABCDEF'[k++] || ''}`) }));
  d.storeMembers = (d.storeMembers || []).map((m, i) => ({ ...m, name: `見本 職員${i + 1}` }));
  (d.ticketRecords || []).forEach(r => { if (r && r.massage && !/^見本/.test(r.massage)) r.massage = '見本A'; });
  (d.patients || []).forEach((p, i) => { p.address = '東京都新宿区西新宿2-8-1'; p.addressBuilding = ''; p.addressRoom = ''; p.prefecture = ''; p.city = ''; p.addressLine = ''; p.zipCode = ''; p.phone = `03-0000-${String(1000 + i).slice(-4)}`; p.phoneMobile = ''; p.familyPhone = ''; p.familyPhoneMobile = ''; });
  d.systemSettings.addons = { ...(d.systemSettings.addons || {}), tsusho_keikaku: true, kinou_keikaku: true, kasan_kagaku: true, kasan_adl: true };
  // 記録の介護整体の担当・作成者などにも職員の名前が入っているので、データ全体で架空の名前に置き換える
  const RE = [[/佐藤 健一/g, '見本 管理者'], [/長谷川/g, '見本D'], [/高橋/g, '見本A'], [/岩岡/g, '見本B'], [/田中/g, '見本C']];
  const fix = (o) => { if (typeof o === 'string') { let t = o; for (const [r, v] of RE) t = t.replace(r, v); return t; } if (Array.isArray(o)) return o.map(fix); if (o && typeof o === 'object') { for (const k of Object.keys(o)) o[k] = fix(o[k]); return o; } return o; };
  localStorage.setItem('daycareAppData_v3', JSON.stringify(fix(d))); };
const open = async ({ vp = { width: 1366, height: 900 }, dpr = 1.5, sidebar = '1', manager = false } = {}) => {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: dpr, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
  if (manager) await ctx.addInitScript(() => { window.__tsumugiE2E = { ...(window.__tsumugiE2E || {}), staffCtx: { enabled: true, kind: 'person', role: 'manager', displayName: '見本 管理者', hasPin: true, membersWithoutAccount: [], setPin: async () => {}, sharedDevice: async () => {} } }; });
  const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 160)));
  await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  await page.evaluate(seed);
  await page.evaluate((s) => { localStorage.setItem('tsumugiSidebarOpen', s); sessionStorage.setItem('tsumugiActiveRecorder', JSON.stringify({ id: 'demo_rec', name: '見本 職員', roleLabel: '介護職員' })); }, sidebar);
  return { ctx, page }; };
const go = async (page, view, pid = null) => { await page.evaluate(([v, p]) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: p, t: Date.now() })), [view, pid]);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {}); await page.waitForTimeout(200); };
const guard = async (page, key) => { const t = await page.locator('body').innerText(); const v = await page.evaluate(() => [...document.querySelectorAll('input,textarea,select')].map(e => e.value).join(' '));
  const m = (t + ' ' + v).match(NG); if (m) { console.log(`NG(${key}): 実在のものが残っている「${m[0]}」`); process.exit(1); } };
const full = async (page, key) => { await guard(page, key); await page.screenshot({ path: path.join(OUT, `${key}.jpg`), type: 'jpeg', quality: 82 }); console.log('saved', key); };
const elem = async (page, loc, key, pad = 4) => { await guard(page, key); await loc.scrollIntoViewIfNeeded(); await page.waitForTimeout(300); const bb = await loc.boundingBox();
  await page.screenshot({ path: path.join(OUT, `${key}.jpg`), type: 'jpeg', quality: 85, clip: { x: Math.max(0, bb.x - pad), y: Math.max(0, bb.y - pad), width: bb.width + pad * 2, height: bb.height + pad * 2 } }); console.log('saved', key); };
const sec = (page, title) => page.locator(`[data-sec-title="${title}"]`).first();

// ---- 21章 各種設定(パソコン 1366×900・左のメニューを開いた状態)
{ const { ctx, page } = await open({ manager: true });
  await go(page, 'settings'); await full(page, 'staff_settings_facility');
  for (const [id, key] of [['life', 'staff_settings_life'], ['record', 'staff_settings_record'], ['diary', 'staff_settings_diary']]) {
    await page.getByTestId(`settings-vtab-${id}`).click(); await page.waitForTimeout(800); await page.getByTestId('settings-content').evaluate(e => e.scrollTo(0, 0)); await page.waitForTimeout(300); await full(page, key); }
  // サービス提供内容 → サービス提供内容の項目管理 / 特記の一言・音声入力
  await page.getByTestId('settings-vtab-record').click(); await page.waitForTimeout(800);
  await elem(page, sec(page, 'サービス提供内容の項目管理'), 'settings_popup');
  await elem(page, page.getByTestId('tokki-preset-card'), 'trial_set_tokki');
  await page.getByTestId('settings-vtab-fitness').click(); await page.waitForTimeout(800);
  await elem(page, page.getByTestId('fit-preset-card'), 'trial_set_fitpreset');
  await page.getByTestId('settings-vtab-login').click(); await page.waitForTimeout(800); // ログインとロックの設定は 10/23 から「ログイン・管理者」
  await elem(page, page.getByTestId('login-security').locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]'), 'trial_set_security');
  await ctx.close(); }
// ---- 24章 各種設定の左の並び(iPad 横 1180・左のメニューは閉じる)
{ const { ctx, page } = await open({ vp: { width: 1180, height: 760 }, sidebar: '0' });
  await go(page, 'settings'); await guard(page, 'trial_settings_vnav');
  await page.screenshot({ path: path.join(OUT, 'trial_settings_vnav.jpg'), type: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: 1180, height: 560 } }); console.log('saved trial_settings_vnav');
  await ctx.close(); }
// ---- 16章 個人ファイル / 17章 ケアマネ事業所・担当者 / 19章 家族関係者閲覧 管理
{ const { ctx, page } = await open();
  await go(page, 'master');
  const nm = page.locator('button:visible', { hasText: /^例示 花子/ }).first();
  if (await nm.count()) await nm.click(); else await page.evaluate(() => { const el = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && /^要(介護|支援)\d$/.test((e.textContent || '').trim())); if (el) el.click(); });
  await page.waitForTimeout(1200); await page.locator('button:visible', { hasText: /個人ファイル/ }).first().click(); await page.waitForTimeout(1500);
  await full(page, 'staff_master_file');
  await go(page, 'cmmaster'); await full(page, 'staff_cmmaster');
  await page.locator('button:visible', { hasText: /担当者を追加/ }).first().click(); await page.waitForTimeout(700); await full(page, 'staff_cm_add_person');
  await page.locator('button:visible', { hasText: /^キャンセル$/ }).first().click().catch(() => {});
  await go(page, 'family_admin'); await full(page, 'staff_family_admin');
  await ctx.close(); }
// ---- 24章 計画書の左の並び(iPad 横・通所介護計画書を開いたところ)
{ const { ctx, page } = await open({ vp: { width: 1180, height: 820 }, dpr: 2, sidebar: '0' });
  await go(page, 'tsusho_keikaku'); await guard(page, 'tk_tabs');
  const nav = page.getByTestId('kk-side'); const bb = await nav.boundingBox(); const last = await page.getByTestId('kk-side-tsusho-seikatsu_kinou').boundingBox(); // 上の組(通所介護計画書)だけ
  await page.screenshot({ path: path.join(OUT, 'tk_tabs.jpg'), type: 'jpeg', quality: 85, clip: { x: bb.x, y: bb.y, width: bb.width, height: last.y + last.height - bb.y + 10 } }); console.log('saved tk_tabs');
  await ctx.close(); }
await b.close(); console.log('shots ok');
