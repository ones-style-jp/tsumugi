// 設定 → システム の端末名の下に「保存の状態」(○×・端末の印・版)が出る。Cookie に端末名が控えられる
import { chromium } from 'playwright';
const OUT = '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad';
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1200, height: 900 }, locale: 'ja-JP' })).newPage();
page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 160)));
await page.goto('http://localhost:4185/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'settings', pid: null, t: Date.now() }))); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1000);
await page.locator('button', { hasText: /^システム$/ }).first().click().catch(() => {}); await page.waitForTimeout(600);
const st = page.getByTestId('device-storage-status');
const n = await st.count(); const txt = n ? await st.innerText() : '';
// 端末名を保存 → Cookie にも入る
const inp = page.locator('input[placeholder="例: 事務所PC / iPad（相談員） / 送迎iPhone"]').first(); await inp.fill('テスト端末A');
await inp.locator('xpath=ancestor::div[1]').locator('button').first().click(); await page.waitForTimeout(500);
const ck = await page.evaluate(() => document.cookie);
const txt2 = await page.getByTestId('device-storage-status').innerText().catch(() => '');
const r = { shown: n === 1, hasItems: /ブラウザ保存/.test(txt) && /IndexedDB/.test(txt) && /Cookie/.test(txt) && /端末の印/.test(txt) && /版/.test(txt), cookieSaved: /tsumugiDeviceName=/.test(ck), afterSave: /Cookie ○/.test(txt2) };
await st.scrollIntoViewIfNeeded().catch(() => {}); await page.screenshot({ path: `${OUT}/devdiag.png` });
console.log(txt2.split('\n')[0]); console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
