// 2026-10-26 試験版 trial413: ①変更ログ: 端末名／担当者・提供記録は項目ごとの変化(特記 空→…) ②各種設定の計画書の定型文は案内(本部が管理)・編集欄なし
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4173'; })();
const b = await chromium.launch(); const r = {};
async function open(view, prep) {
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, locale: 'ja-JP' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  const pid = await page.evaluate(([view, prep]) => { localStorage.setItem('tsumugiSidebarOpen', '0'); const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.systemSettings = d.systemSettings || {}; (new Function('d', 'localStorage', prep))(d, localStorage); localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); const p = (d.patients || []).find(x => x.status === '利用中'); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view, pid: view === 'dash_personal' ? p.id : null, date: (() => { const d = new Date(); if (d.getDay() === 0) d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })(), t: Date.now() })); return p.id; }, [view, prep || '']);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2200); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 600 }).catch(() => {}); return { page, pid }; }
// ① 変更ログ
{ const { page } = await open('record', "sessionStorage.setItem('tsumugiActiveRecorder', JSON.stringify({ id: 'm_demo', name: '見本 職員', roleLabel: '介護職員' }));");
  const inp = page.locator('[data-testid^="rv-tokki-input-"]:visible, input[placeholder^="特記"]:visible, textarea[placeholder^="特記"]:visible').first(); await inp.fill('テスト特記'); await page.waitForTimeout(300);
  await page.locator('[data-testid=\"rec-toolbar\"] button', { hasText: /^保存$/ }).first().click().catch(async () => { await page.locator('button:visible', { hasText: /^保存$/ }).first().click(); }); await page.waitForTimeout(1500);
  await page.locator('button:visible', { hasText: /^変更ログ$/ }).first().click(); await page.waitForTimeout(600);
  const box = page.locator('div[style*="99998"]').first(); const txt = (await box.count()) ? await box.innerText() : (await page.locator('body').innerText());
  r.logHasField = /特記 空→テスト特記/.test(txt); r.logHasStaff = /／見本 職員/.test(txt) && /（誰）/.test(txt);
  if (!r.logHasField || !r.logHasStaff) console.log('LOG', JSON.stringify(txt.slice(0, 600)));
  await page.context().close(); }
// ② 定型文は案内だけ
{ const { page } = await open('settings', "");
  await page.getByTestId('settings-search-input').fill('計画書'); await page.waitForTimeout(300); await page.locator('[data-testid^="settings-search-hit-"]', { hasText: /計画書の定型文/ }).first().click(); await page.waitForTimeout(700);
  r.kkInfo = (await page.getByTestId('kk-presets-info').count()) === 1; r.kkNoEdit = (await page.locator('[data-sec-title^=\"計画書の定型文\"] textarea').count()) === 0;
  await page.context().close(); }
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
