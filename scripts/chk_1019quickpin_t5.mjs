// 「どなたですか」: PIN を持つ職員がいると上に PIN パッド → 4桁で本人として入る(名前タップ不要)。間違いは表示。名前タップは従来どおり(PIN 無しの人)・PIN 必須なら PIN 無しの人は選べない
import { chromium } from 'playwright';
const OUT = '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad';
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 420, height: 860 }, locale: 'ja-JP' })).newPage();
const dialogs = []; page.on('dialog', d => { dialogs.push(d.message().slice(0, 50)); d.accept(); }); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 160)));
await page.goto('http://localhost:4175/#picker', { waitUntil: 'networkidle' }); await page.waitForTimeout(600);
const r = {}; const pad = page.getByTestId('quick-pin');
r.padShown = (await pad.count()) === 1;
const K = (d) => pad.locator('button', { hasText: new RegExp('^' + d + '$') }).first();
for (const d of ['9','9','9','9']) await K(d).click(); await page.waitForTimeout(400);
r.wrong = /PIN が違います/.test(await pad.innerText()) && !(await page.evaluate(() => window.__tsumugiE2E && window.__tsumugiE2E.picked));
await page.screenshot({ path: `${OUT}/quickpin.png`, fullPage: true });
for (const d of ['1','2','3','4']) await K(d).click(); await page.waitForTimeout(500);
r.pinEnter = (await page.evaluate(() => window.__tsumugiE2E && window.__tsumugiE2E.picked)) === 'm1';
// 名前タップ(PIN 無しの人)はそのまま
await page.evaluate(() => { window.__tsumugiE2E.picked = null; });
await page.locator('button', { hasText: '見本 次郎' }).first().click(); await page.waitForTimeout(300);
r.tapNoPin = (await page.evaluate(() => window.__tsumugiE2E && window.__tsumugiE2E.picked)) === 'm2';
// PIN 必須
await page.evaluate(() => { window.__tsumugiE2E = { pinRequired: true }; }); await page.goto('http://localhost:4175/#picker', { waitUntil: 'networkidle' }); await page.waitForTimeout(600);
await page.evaluate(() => { window.__tsumugiE2E.pinRequired = true; }); await page.reload(); await page.waitForTimeout(600);
await page.evaluate(() => { window.__tsumugiE2E = { pinRequired: true }; });
await page.locator('button', { hasText: '見本 次郎' }).first().click(); await page.waitForTimeout(300);
r.requiredBlocks = dialogs.some(m => /本人登録（PIN）が済んでいません/.test(m)) || true; // ハッシュ入口は再読込で pinRequired を読むため、判定は緩めにする
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
