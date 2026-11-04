// trial521: 各種設定 — 「1週間前の送迎を自動コピー」の説明がⓘマークの中・要支援の計画書の名前に江東区の候補が無い・定型文の欄が無い
import { chromium } from 'playwright';
const r = {}; const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP' })).newPage();
page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.goto('http://localhost:4175/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'settings', pid: null, t: Date.now() }))); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
await page.locator('button:visible', { hasText: /^日誌$/ }).first().click(); await page.waitForTimeout(800);
const txt = await page.evaluate(() => document.body.innerText);
r.autocopy_hidden = txt.includes('1週間前の送迎を自動コピー') && !txt.includes('7日前の同じ時間帯');
await page.locator('button:visible', { hasText: /^計画書$/ }).first().click(); await page.waitForTimeout(800);
const t2 = await page.evaluate(() => document.body.innerText);
r.no_koto = !t2.includes('江東区総合事業個別サービス計画書'); r.no_presets = !t2.includes('計画書の定型文（3-3'); r.title_ok = t2.includes('要支援の計画書の名前') && !t2.includes('国の決まった名前は無く');
await page.screenshot({ path: '/tmp/chk_1105settingshint.png' });
await b.close(); const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
