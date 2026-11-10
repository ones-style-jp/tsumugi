// テスト店舗: 検査で登録した「検守り …」の利用者を 各種設定 → 一括削除 で消す(画面からログイン)
import { chromium } from 'playwright';
const BASE = 'https://tsumugi-git-trial-ones-style.vercel.app';
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage();
page.on('dialog', d => { console.log('dialog:', d.message().slice(0, 80).replace(/\n/g, ' ')); d.accept(); });
await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
await page.evaluate(() => { localStorage.setItem('tsumugiSidebarOpen', '0'); });
await page.locator('input[autocomplete^="username"]').first().fill('test'); await page.locator('input[autocomplete="current-password"]').first().fill('testoooo');
await page.locator('button[type=submit]:visible, button:visible:has-text("ログイン")').first().click(); await page.waitForTimeout(7000);
const settle = async () => { for (let i = 0; i < 6; i++) { const body = await page.locator('body').innerText();
  if (/管理者パスワードを入力/.test(body)) { const inp = page.locator('input[type=password]:visible').last(); await inp.fill('test1234'); await inp.press('Enter'); await page.waitForTimeout(4000); continue; }
  if (/どなたですか/.test(body)) { const el = page.locator('button:visible', { hasText: /試験 管理者/ }).first(); if (await el.count()) { await el.evaluate(b => b.click()); await page.waitForTimeout(3000); continue; } }
  if (/この端末の名前/.test(body)) { const inp = page.locator('input[type=text]:visible, input:not([type]):visible').first(); if (await inp.count()) await inp.fill('live-cleanup'); await page.locator('button:visible', { hasText: /この名前で保存/ }).first().click({ timeout: 1500 }).catch(() => {}); await page.waitForTimeout(3000); continue; }
  if (!/どなたですか|パスワード|この端末の名前/.test(body)) break; await page.waitForTimeout(3000); } };
await settle();
await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'settings', pid: null, t: Date.now() }))); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(8000); await settle();
await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
// 一括削除のある項目を探す
const tabs = await page.locator('button:visible').allInnerTexts();
for (const t of ['システム', 'データ', '管理', '利用者', 'その他']) { if (await page.locator('body').innerText().then(x => /一括削除/.test(x))) break; const bt = page.locator('button:visible', { hasText: new RegExp('^' + t) }).first(); if (await bt.count()) { await bt.click(); await page.waitForTimeout(1200); } }
let body = await page.locator('body').innerText(); console.log('has bulk:', /一括削除/.test(body), 'admin needed:', /管理者として認証/.test(body));
if (/管理者として認証/.test(body)) { await page.locator('button:visible', { hasText: /管理者として認証/ }).first().click(); await page.waitForTimeout(1500); await settle(); await page.waitForTimeout(1000); }
// 検守り の行のチェックを付ける
const rows = page.locator('label:visible, div:visible').filter({ hasText: /^.{0,40}検守り/ });
const cbs = page.locator('input[type=checkbox]:visible');
let picked = 0;
const n = await cbs.count();
for (let i = 0; i < n; i++) { const cb = cbs.nth(i); const txt = await cb.evaluate(el => (el.closest('label') || el.parentElement || {}).innerText || ''); if (/検守り/.test(txt)) { await cb.check(); picked++; } }
console.log('checkboxes', n, 'picked', picked);
if (picked) { const del = page.locator('button:visible', { hasText: /選択した\d+件を削除|選択した\d+名を削除/ }).first(); console.log('delete button:', await del.count() ? await del.innerText() : 'none'); if (await del.count()) { await del.click(); await page.waitForTimeout(8000); } }
await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'master', pid: null, t: Date.now() }))); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(8000); await settle();
console.log('remaining 検守り on master:', await page.getByText('検守り', { exact: false }).count());
await page.screenshot({ path: process.env.S + '/shots/live_cleanup.png' }); await b.close();
