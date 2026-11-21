// スマホ幅: 提供記録の操作ボタンが4列・一括○の小窓を開くと後ろの画面が動かない(閉じると戻る)・休み連絡の今日に枠
import { chromium } from 'playwright';
const OUT = '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad';
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.goto('http://localhost:4185/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'record', pid: null, t: Date.now() }))); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
const r = {};
await page.getByTestId('fold-btn-record').click().catch(() => {}); await page.waitForTimeout(400);
const acts = page.getByTestId('rec-actions'); const boxes = await acts.locator('button:visible').evaluateAll(els => els.map(e => { const b = e.getBoundingClientRect(); return { t: e.innerText.trim(), top: Math.round(b.top), w: Math.round(b.width) }; }));
r.fourInRow = boxes.length === 4 && new Set(boxes.map(x => x.top)).size === 1 && boxes.some(x => x.t === '一括○');
await page.screenshot({ path: `${OUT}/phoneui_actions.png` });
// スクロールして位置を覚える → 小窓を開く → 後ろの箱をスクロールしようとしても動かない
const sc = async () => page.evaluate(() => { const els = [document.getElementById('tsuContentScroller'), ...document.querySelectorAll('.record-view-scroll')].filter(Boolean); return els.map(e => e.scrollTop); });
await page.evaluate(() => { const e = document.querySelector('.record-view-scroll') || document.getElementById('tsuContentScroller'); if (e) e.scrollTop = 200; });
await page.getByTestId('rec-act-bulkex').click({ timeout: 5000 }); await page.waitForTimeout(300);
const before = await sc();
r.locked = await page.evaluate(() => document.documentElement.classList.contains('tsu-back-lock'));
await page.mouse.move(200, 120); await page.mouse.wheel(0, 600); await page.waitForTimeout(300);
await page.evaluate(() => { const e = document.querySelector('.record-view-scroll') || document.getElementById('tsuContentScroller'); const cs = e && getComputedStyle(e); window.__ov = cs && cs.overflowY; });
r.backOverflowHidden = (await page.evaluate(() => window.__ov)) === 'hidden';
const after = await sc(); r.backNotMoved = JSON.stringify(before) === JSON.stringify(after);
await page.locator('button', { hasText: 'キャンセル' }).click(); await page.waitForTimeout(300);
r.unlocked = !(await page.evaluate(() => document.documentElement.classList.contains('tsu-back-lock')));
// 休み連絡
await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'absence_fax', pid: null, t: Date.now() }))); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
const today = page.getByTestId('abs-today'); r.todayFrame = (await today.count()) === 1 && /inset/.test(await today.evaluate(e => getComputedStyle(e).boxShadow));
if (await today.count()) { await today.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${OUT}/phoneui_abs.png` }); }
console.log(JSON.stringify(boxes)); console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
