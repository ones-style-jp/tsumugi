// 2026-10-27 不具合: 和暦の日付を文字で並べていたため、10月の計画書より9月の計画書が新しい扱いだった → 日付で並べる
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4173'; })();
const b = await chromium.launch(); const r = {};
const page = await (await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ja-JP' })).newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
const K = 'daycareAppData_v3';
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
const pid = await page.evaluate((K) => { const d = JSON.parse(localStorage.getItem(K)); const p = (d.patients || []).find(x => x.status === '利用中'); p.careLevel = '要介護1';
  d.tsushoKeikakuRecords = (d.tsushoKeikakuRecords || []).filter(x => x.patientId !== p.id);
  // わざと「10月」を先に作った形(作った時刻は9月の方が新しい)にして、日付で並ぶかを見る
  d.tsushoKeikakuRecords.push({ id: 'tk_chk_oct', patientId: p.id, createdAt: 1000, createdDate: '令和8年10月1日', shortGoal: '十月の目標', planType: 'kaigo' });
  d.tsushoKeikakuRecords.push({ id: 'tk_chk_sep', patientId: p.id, createdAt: 2000, createdDate: '令和8年9月30日', shortGoal: '九月の目標', planType: 'kaigo' });
  localStorage.setItem(K, JSON.stringify(d)); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'tsusho_keikaku', pid: p.id, t: Date.now() })); return p.id; }, K);
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2200); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
const rows = await page.locator('text=/作成日: 令和8年/').allInnerTexts();
r.listOrder = rows.length >= 2 && rows[0].includes('10月1日') && rows[1].includes('9月30日');
const h = await page.evaluate(() => (document.getElementById('tk-print-area') || {}).innerHTML || '');
r.printLatest = h.includes('十月の目標') && !h.includes('九月の目標');
// 新規作成の「前回作成日」は10月の方
await page.locator('button', { hasText: '＋ 新規作成' }).first().click(); await page.waitForTimeout(600);
const prev = await page.locator('label', { hasText: /^前回作成日$/ }).locator('xpath=..').locator('input').first().inputValue().catch(() => '');
r.prevDate = /10月1日/.test(prev); if (!r.prevDate) console.log('prev', prev);
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
