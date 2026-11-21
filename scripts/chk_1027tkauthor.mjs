// 2026-10-27 通所介護計画書: 計画作成者は職員(日誌の職員を含む)のプルダウンで、選ぶと職種も入る・2つの役職を持つ人はどちらの役職でも選べる・共同作成者(複数)・印刷に共同作成者
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4173'; })();
const b = await chromium.launch(); const r = {};
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ja-JP' });
const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
// 日誌の職員に、2つの役職を持つ見本の職員を足す
await page.evaluate(() => { const k = 'daycareAppData_v3'; const d = JSON.parse(localStorage.getItem(k)); d.diarySettings = d.diarySettings || {}; d.diarySettings.staff = [...(d.diarySettings.staff || []), { id: 'st_chk_tk', name: '見本 次郎', role: '生活相談員', role2: '機能訓練指導員' }]; localStorage.setItem(k, JSON.stringify(d));
  sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'tsusho_keikaku', pid: null, t: Date.now() })); });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2200); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
await page.locator('button', { hasText: '＋ 新規作成' }).first().click(); await page.waitForTimeout(600);
const sel = page.getByTestId('tk-author').locator('select');
const opts = await sel.locator('option').evaluateAll(os => os.map(o => ({ v: o.value, t: o.textContent, g: o.parentElement.tagName === 'OPTGROUP' ? o.parentElement.label : '' })));
const o2 = opts.find(o => o.t === '見本 次郎' && o.g === '機能訓練指導員'); const o1 = opts.find(o => o.t === '見本 次郎' && o.g === '生活相談員');
r.bothRoles = !!o1 && !!o2;
await sel.selectOption(o2.v); await page.waitForTimeout(200);
r.pickRole2 = (await page.getByTestId('tk-author-job').inputValue()) === '機能訓練指導員' && (await sel.inputValue()) === o2.v;
await sel.selectOption(o1.v); await page.waitForTimeout(200);
r.pickRole1 = (await page.getByTestId('tk-author-job').inputValue()) === '生活相談員' && (await sel.inputValue()) === o1.v;
// 共同作成者: 2人にチェック
await page.getByTestId('tk-coauthors').locator('summary').click(); await page.waitForTimeout(200);
const boxes = page.getByTestId('tk-coauthors').locator('input[type=checkbox]'); const n = await boxes.count();
await boxes.nth(0).check(); await boxes.nth(1).check(); await page.waitForTimeout(200);
const co = (await page.getByTestId('tk-coauthors').locator('summary').innerText()).trim();
r.coAuthors = n >= 2 && co.split('／').length === 2 && !co.includes('見本 次郎');
await page.locator('button', { hasText: '保存して閉じる' }).first().click(); await page.waitForTimeout(900);
const rec = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const a = d.tsushoKeikakuRecords || []; return a[a.length - 1] || null; });
r.saved = !!rec && rec.author === '見本 次郎' && rec.authorJob === '生活相談員' && String(rec.coAuthors || '').split('／').length === 2;
// 印刷の中身に共同作成者
const html = await page.evaluate(() => { const el = document.getElementById('tk-print-area'); return el ? el.innerHTML : ''; }); // 印刷の中身(画面には出さない所に描いてある)
r.printCo = html.includes('共同作成者：') && html.includes(String(rec.coAuthors).split('／')[0]);
if (!r.printCo) console.log('print html len', html.length);
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
