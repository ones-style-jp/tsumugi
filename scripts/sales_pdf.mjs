// 営業用1枚資料(A4縦・余白0・@page 準拠) → PDF。事前に public/ を 4174 で配信しておく
import { chromium } from 'playwright';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://localhost:4174'); const OUT = arg('--out', 'docs/マニュアル'); const SHOT = arg('--shot', '');
const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1000, height: 1400 } });
await page.goto(`${BASE}/sales-onepager.html`, { waitUntil: 'networkidle' }); await page.waitForTimeout(600);
await page.emulateMedia({ media: 'print' });
const info = await page.evaluate(() => [...document.querySelectorAll('.page')].map(p => ({ h: p.scrollHeight, ch: p.clientHeight, overflow: p.scrollHeight > p.clientHeight + 1, foot: Math.round(p.querySelector('.foot').getBoundingClientRect().bottom - p.getBoundingClientRect().top) })));
console.log('pages:', JSON.stringify(info));
if (SHOT) { await page.emulateMedia({ media: 'screen' }); const pages = page.locator('.page'); for (let i = 0; i < await pages.count(); i++) await pages.nth(i).screenshot({ path: `${SHOT}/sales_page${i + 1}.png` }); await page.emulateMedia({ media: 'print' }); }
await page.pdf({ path: `${OUT}/つむぎご案内_ご家族向け・ケアマネ向け.pdf`, format: 'A4', landscape: false, printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 }, preferCSSPageSize: true });
console.log('pdf ok');
await b.close();
