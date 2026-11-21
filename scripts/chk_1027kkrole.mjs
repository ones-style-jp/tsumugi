// 2026-10-27 個別機能訓練計画書: 2つの役職を持つ職員を計画作成者に選ぶと、選んだ役職が職種に入る(以前はどちらを選んでも1つ目)
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4173'; })();
const b = await chromium.launch(); const r = {};
const page = await (await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ja-JP' })).newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
await page.evaluate(() => { const k = 'daycareAppData_v3'; const d = JSON.parse(localStorage.getItem(k)); d.diarySettings = d.diarySettings || {}; d.diarySettings.staff = [...(d.diarySettings.staff || []), { id: 'st_chk_kk', name: '見本 三郎', role: '生活相談員', role2: '機能訓練指導員' }]; localStorage.setItem(k, JSON.stringify(d));
  sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'kinou_keikaku', pid: null, t: Date.now() })); });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2200); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
await page.locator('button', { hasText: '＋ 新規作成' }).first().click(); await page.waitForTimeout(600);
const sel = page.locator('label', { hasText: /^計画作成者$/ }).locator('xpath=..').locator('select').first();
const job = page.locator('label', { hasText: /^職種$/ }).locator('xpath=..').locator('select').first();
const opts = await sel.locator('option').evaluateAll(os => os.map(o => ({ v: o.value, t: o.textContent, g: o.parentElement.tagName === 'OPTGROUP' ? o.parentElement.label : '' })));
const o2 = opts.find(o => o.t === '見本 三郎' && o.g === '機能訓練指導員'); const o1 = opts.find(o => o.t === '見本 三郎' && o.g === '生活相談員');
r.bothRoles = !!o1 && !!o2;
await sel.selectOption(o2.v); await page.waitForTimeout(200); r.role2 = (await job.inputValue()) === '機能訓練指導員' && (await sel.inputValue()) === o2.v;
await sel.selectOption(o1.v); await page.waitForTimeout(200); r.role1 = (await job.inputValue()) === '生活相談員' && (await sel.inputValue()) === o1.v;
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
