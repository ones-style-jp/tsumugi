// 2026-10-29(試験版) ユーザー「未保存の印入れてみて」: 各種設定の左の項目に、保存していない入力がある印(●)
//   iPad 横: ①開いただけでは印なし ②事業所名を書きかえると「事業所情報」に印・保存の左に「保存していない入力があります」
//   ③ほかの項目(日誌)へ移っても事業所情報の印は残る ④元の名前に戻すと印が消える ⑤もう一度書きかえて「保存」→印が消える
//   実行: node scripts/chk_1029unsaved.mjs [--port 4175]
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4175'; })();
const b = await chromium.launch(); const r = {};
const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage();
page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => d.accept());
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.systemSettings = d.systemSettings || {}; d.facilityName = '見本デイ'; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), name: '見本デイ' }; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'settings', pid: null, t: Date.now() })); });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2200);
const dot = () => page.getByTestId('settings-dirty-facility').count(); const hint = () => page.getByTestId('settings-unsaved-hint').count();
r.noMarkAtOpen = (await dot()) === 0 && (await hint()) === 0;
const ok = await page.evaluate(() => { const el = [...document.querySelectorAll('[data-testid="settings-content"] input')].find(e => e.value === '見本デイ'); if (el) el.setAttribute('data-chk-name', '1'); return !!el; }); r.found = ok;
const inp = page.locator('input[data-chk-name="1"]');
await inp.fill('見本デイ２'); await page.waitForTimeout(600);
r.markAfterEdit = (await dot()) === 1 && (await hint()) === 1; console.log('書きかえ', await dot(), await hint());
await page.getByTestId('settings-vtab-diary').click(); await page.waitForTimeout(600); r.markStays = (await dot()) === 1;
await page.getByTestId('settings-vtab-facility').click(); await page.waitForTimeout(600);
await page.evaluate(() => { const el = [...document.querySelectorAll('[data-testid="settings-content"] input')].find(e => e.value === '見本デイ２'); if (el) el.setAttribute('data-chk-name', '1'); }); // 項目を移ると欄は作り直されるので、もう一度探す
await page.locator('input[data-chk-name="1"]').fill('見本デイ'); await page.waitForTimeout(700); r.markGoneOnRevert = (await dot()) === 0 && (await hint()) === 0; console.log('元に戻す', await dot(), await hint());
await page.locator('input[data-chk-name="1"]').fill('見本デイ３'); await page.waitForTimeout(600); const before = await dot();
await page.getByTestId('settings-save').click(); await page.waitForTimeout(1500); r.markGoneOnSave = before === 1 && (await dot()) === 0 && (await hint()) === 0; console.log('保存', before, '->', await dot());
await b.close();
const all = Object.values(r).every(Boolean); console.log(r, all ? 'PASS' : 'FAIL'); process.exit(all ? 0 : 1);
