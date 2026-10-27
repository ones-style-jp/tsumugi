// 2026-10-27 通所介護計画書: ①「月末」で達成予定日が末日 ②印刷に「利用者（本人）署名」 ③一括自動生成で本人の希望に興味・関心が入らない
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4173'; })();
const b = await chromium.launch(); const r = {};
const page = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
const pid = await page.evaluate(() => { localStorage.setItem('tsumugiSidebarOpen', '0'); const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const p = (d.patients || []).find(x => x.status === '利用中'); d.kyomiKanshinRecords = [{ id: 'ky1', patientId: p.id, recordDate: '令和8年10月1日', items: {}, custom: [{ name: '囲碁', shitemitai: true }], bikou: 'テスト備考', createdAt: Date.now() }]; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'tsusho_keikaku', pid: p.id, t: Date.now() })); return p.id; });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2200); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
await page.locator('button', { hasText: /＋ 新規作成/ }).first().click(); await page.waitForTimeout(800);
// ③ 一括自動生成 → 本人の希望に「してみたい」が入らない
await page.locator('button', { hasText: /一括自動生成/ }).first().click(); await page.waitForTimeout(800);
const kibou = await page.locator('textarea').filter({ has: page.locator('xpath=..') }).first().inputValue().catch(() => '');
const allText = await page.evaluate(() => [...document.querySelectorAll('textarea')].map(t => t.value).join('\n'));
r.noKyomiInKibou = !/してみたい：囲碁/.test(allText); if (!r.noKyomiInKibou) console.log('KIBOU', allText.slice(0, 200)); void kibou;
// ① 月末
const eomBtn = page.getByTestId('tk-short-due-eom'); await eomBtn.scrollIntoViewIfNeeded(); await eomBtn.click(); await page.waitForTimeout(500);
const dues = await page.locator('input[placeholder^="達成予定日"]').evaluateAll(els => els.map(e => e.value)); console.log('DUES', JSON.stringify(dues), 'eomBtns', await page.getByTestId('tk-short-due-eom').count());
const due = dues.find(v => /令和/.test(v)) || ''; const m = due.match(/令和(\d+)年(\d+)月(\d+)日/);
r.eom = !!m && (() => { const y = 2018 + +m[1]; const last = new Date(y, +m[2], 0).getDate(); return +m[3] === last; })(); if (!r.eom) console.log('DUE', due);
// ② 署名欄(印刷領域)
await page.locator('button', { hasText: /一時保存/ }).first().click(); await page.waitForTimeout(600);
const printHtml = await page.evaluate(() => { const el = document.getElementById('tk-print-area'); return el ? el.innerHTML : ''; });
r.signature = /利用者（本人）署名/.test(printHtml); if (!r.signature) console.log('PRINT len', printHtml.length);
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close(); void pid;
