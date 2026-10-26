// 2026-10-26 試験版 trial412: 提供記録 ①文言(戻す・通常表示へ・拡大表示) ②全画面の帯に 並び替え・一括○・印の外し ③一言のボタンを出さない設定 ④一言かマイクが1つだけなら欄いっぱい
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4173'; })();
const b = await chromium.launch(); const r = {};
async function open(view, prep) {
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, locale: 'ja-JP' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  const pid = await page.evaluate(([view, prep]) => { localStorage.setItem('tsumugiSidebarOpen', '0'); const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.systemSettings = d.systemSettings || {}; (new Function('d', 'localStorage', prep))(d, localStorage); localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); const p = (d.patients || []).find(x => x.status === '利用中'); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view, pid: view === 'dash_personal' ? p.id : null, date: (() => { const d = new Date(); if (d.getDay() === 0) d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })(), t: Date.now() })); return p.id; }, [view, prep || '']);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2200); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 600 }).catch(() => {}); return { page, pid }; }
const longPress = async (page, loc) => { const bb = await loc.boundingBox(); await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down(); await page.waitForTimeout(750); await page.mouse.up(); await page.waitForTimeout(300); };
// ① ② 通常→全画面
{ const { page } = await open('record', "localStorage.setItem('tsumugiFullscreenMode','fit'); d.systemSettings.tokkiPresets = d.systemSettings.tokkiPresets || ['体調不良'];");
  const body = () => page.locator('body').innerText();
  r.normalBack = /戻す/.test(await page.getByTestId('rec-toolbar').innerText()) && !/元に戻す/.test(await body());
  await page.getByTestId('rec-act-fullscreen').click(); await page.waitForTimeout(400);
  r.pickZoomLabel = /拡大表示/.test(await page.getByTestId('fs-pick').innerText()) && !/大きく表示/.test(await page.getByTestId('fs-pick').innerText());
  await page.getByTestId('fs-pick-fit').click(); await page.waitForTimeout(1500);
  const bar = page.getByTestId('rec-fs-bar'); const bt = await bar.innerText();
  r.fsLabels = /通常表示へ/.test(bt) && /戻す/.test(bt) && !/元に戻す/.test(bt) && !/通常表示に戻る/.test(bt) && /拡大表示/.test(await page.getByTestId('fs-mode-switch').innerText());
  r.fsButtons = (await page.getByTestId('fs-order-btn').count()) === 1 && (await page.getByTestId('fs-act-bulkex').count()) === 1;
  await page.getByTestId('fs-act-bulkex').click(); await page.waitForTimeout(500); r.fsBulkOpens = /運動の一括○/.test(await body()); await page.keyboard.press('Escape'); await page.locator('button:visible', { hasText: /^(やめる|閉じる|キャンセル)$/ }).last().click({ timeout: 800 }).catch(() => {}); await page.waitForTimeout(300);
  await page.getByTestId('fs-order-btn').click(); await page.waitForTimeout(500); r.fsOrderOpens = /並び順|並べ替え|並び替え/.test(await body()); await page.keyboard.press('Escape'); await page.locator('button:visible', { hasText: /^(やめる|閉じる|キャンセル)$/ }).last().click({ timeout: 800 }).catch(() => {}); await page.waitForTimeout(300);
  r.noMarksBar = (await page.getByTestId('fs-marks-bar').count()) === 0;
  console.log('A', JSON.stringify(r)); await longPress(page, page.locator('[data-testid^="rv-name-"]').first()); r.marksBar = (await page.getByTestId('fs-marks-bar').count()) === 1 && /印 1/.test(await page.getByTestId('fs-marks-bar').innerText());
  await page.getByTestId('fs-marks-clear').click(); await page.waitForTimeout(300); r.marksCleared = (await page.getByTestId('fs-marks-bar').count()) === 0;
  await page.locator('button', { hasText: /^通常表示へ$/ }).click(); await page.waitForTimeout(600); r.backNormal = (await page.getByTestId('rec-toolbar').count()) === 1;
  await page.context().close(); }
// ③ ④ 一言を出さない → マイクが欄いっぱい
{ const { page } = await open('record', "d.systemSettings.tokkiPresets = ['体調不良']; d.systemSettings.tokkiPresetOff = true; d.systemSettings.tokkiVoiceOff = false;");
  r.presetHidden = (await page.locator('[data-testid^=\"rv-tokki-pick-\"]').count()) === 0;
  const mic = page.locator('[data-testid^=\"rv-tokki-mic-\"]').first(); const mh = (await mic.count()) ? (await mic.boundingBox()).height : 0; console.log('micH', mh); r.micTall = mh >= 36;
  await page.context().close(); }
{ const { page } = await open('record', "d.systemSettings.tokkiPresets = ['体調不良']; d.systemSettings.tokkiPresetOff = false; d.systemSettings.tokkiVoiceOff = false;");
  const sel = page.locator('[data-testid^=\"rv-tokki-pick-\"]').first(); const sh = (await sel.boundingBox()).height; console.log('selH', sh); r.bothSmall = sh <= 26;
  await page.context().close(); }
// ③' 各種設定にチェックがある
{ const { page } = await open('settings', "");
  await page.getByTestId('settings-search-input').fill('一言'); await page.waitForTimeout(300); await page.getByTestId('settings-search-hit-0').click(); await page.waitForTimeout(700);
  r.settingToggle = (await page.getByTestId('tokki-preset-toggle').count()) === 1 && (await page.getByTestId('tokki-voice-toggle').count()) === 1;
  await page.context().close(); }
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
