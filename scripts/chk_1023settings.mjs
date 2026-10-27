// 2026-10-23 試験版: 各種設定の組み直し。システム/ログイン・管理者/データ管理/マニュアル のタブ・各タブの「この中の項目」ボタン・
//   LIFE連携の番号は事業所情報で入力(LIFE連携は表示だけ)・上の帯の文字の選択はなし
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4173'; })();
const b = await chromium.launch(); const r = {}; const errs = [];
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage();
page.on('dialog', d => d.accept()); page.on('pageerror', e => { errs.push(e.message); console.log('PAGEERROR', e.message.slice(0, 200)); }); page.on('console', m => { if (m.type() === 'error' && /Maximum update depth/.test(m.text())) errs.push(m.text()); });
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'settings', pid: null, t: Date.now() }))); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800);
const tab = async (label) => { await page.evaluate((label) => { const bs = [...document.querySelectorAll('button')].filter(x => x.textContent.trim() === label && [...x.parentElement.querySelectorAll('button')].some(y => y.textContent.trim() === '体力測定')); if (bs[0]) bs[0].click(); }, label); await page.waitForTimeout(900);
  return page.evaluate(() => [...document.querySelectorAll('[data-sec-title]')].filter(e => e.offsetParent).map(e => e.getAttribute('data-sec-title'))); };
const sys = await tab('システム'); console.log('システム', JSON.stringify(sys));
r.systemOnlyDevice = sys.includes('この端末の表示') && sys.includes('この端末の名前・最終更新') && !sys.some(t => /ログイン情報|管理者の設定|データ管理|操作マニュアル/.test(t));
r.noIconbarSetting = await page.getByTestId('set-iconbar').count() === 0;
r.jumpShown = await page.getByTestId('sec-jump').count() === 1;
if (r.jumpShown) { const y0 = await page.evaluate(() => { const el = [...document.querySelectorAll('[data-sec-title]')].filter(e => e.offsetParent)[1]; return el.getBoundingClientRect().top; });
  await page.getByTestId('sec-jump').locator('button').nth(1).click(); await page.waitForTimeout(900);
  const y1 = await page.evaluate(() => { const el = [...document.querySelectorAll('[data-sec-title]')].filter(e => e.offsetParent)[1]; return el.getBoundingClientRect().top; }); console.log('jump', Math.round(y0), '→', Math.round(y1)); r.jumpScrolls = y1 < y0 - 20 || y1 < 200; }
const lg = await tab('ログイン・管理者'); console.log('ログイン・管理者', JSON.stringify(lg)); r.loginTab = lg.includes('ログイン情報') && lg.includes('管理者の設定');
const dt = await tab('データ管理'); console.log('データ管理', JSON.stringify(dt)); r.dataTab = dt.includes('データ管理');
const mn = await tab('マニュアル'); console.log('マニュアル', JSON.stringify(mn)); r.manualTab = mn.includes('操作マニュアル・ご利用ガイド');
await tab('事業所情報'); r.facilityInputs = await page.evaluate(() => { const ls = [...document.querySelectorAll('label')].map(l => l.textContent); return ls.some(t => /^保険者番号（6桁）/.test(t)) && ls.some(t => /^サービス種類コード/.test(t)) && ls.some(t => /^総合事業（要支援・事業対象者）の事業所番号/.test(t)); }); /* trial395: 総合事業の欄は「別の番号」を選んだときだけ */
await tab('LIFE連携'); r.lifeReadOnly = await page.evaluate(() => { const lab = [...document.querySelectorAll('label')].find(l => /^保険者番号（6桁）/.test(l.textContent)); if (!lab) return false; const box = lab.parentElement; return !box.querySelector('input') && /事業所情報/.test(lab.textContent); });
await page.waitForTimeout(1500); r.noLoopErrors = errs.length === 0;
// trial407: 全体検索(候補を押すとその見出しへ)・自動入力の属性
await page.getByTestId('settings-search-input').fill('端末名'); await page.waitForTimeout(400); r.searchHits = (await page.getByTestId('settings-search-list').count()) === 1 && /この端末の名前/.test(await page.getByTestId('settings-search-list').innerText());
await page.getByTestId('settings-search-hit-0').click(); await page.waitForTimeout(800); r.searchJump = (await page.locator('[data-sec-title="この端末の名前・最終更新"]').count()) === 1; r.noAutofill = await page.evaluate(() => [...document.querySelectorAll('input[name^="tsu-"]')].every(i => (i.getAttribute('autocomplete') || '') !== '')); /* 見本版では端末名の欄が無いことがあるので、tsu- の欄すべてに autocomplete が付いているかで見る */
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
