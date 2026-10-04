// A4 縦の案内(ご家族向け・ケアマネ向け・営業用表裏)を PDF 化(余白0・@page 準拠)。事前に public/ を 4174 で配信しておく
//   node scripts/lp_pdf.mjs [--base http://localhost:4174] [--out docs/マニュアル] [--shot <dir>]
import { chromium } from 'playwright';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://localhost:4174'); const OUT = arg('--out', 'docs/マニュアル'); const SHOT = arg('--shot', '');
const JOBS = [
  ['lp-kazoku.html', 'つむぎのご案内_ご家族向け.pdf'],
  ['lp-kankeisha.html', 'つむぎのご案内_ケアマネ向け.pdf'],
  ['sales-onepager.html', 'つむぎご案内_ご家族向け・ケアマネ向け.pdf'],
  ['lp-cm-touroku.html', 'つむぎアカウント登録のお願い_ケアマネ・居宅事業所向け.pdf'],
];
const b = await chromium.launch(); let bad = 0;
for (const [src, name] of JOBS) {
  const page = await b.newPage({ viewport: { width: 1000, height: 1400 } });
  await page.goto(`${BASE}/${src}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(600);
  await page.emulateMedia({ media: 'print' });
  const info = await page.evaluate(() => [...document.querySelectorAll('.page')].map(p => ({ h: p.scrollHeight, ch: p.clientHeight, overflow: p.scrollHeight > p.clientHeight + 1 })));
  console.log(src, 'pages:', JSON.stringify(info)); if (info.some(x => x.overflow)) bad++;
  if (SHOT) { await page.emulateMedia({ media: 'screen' }); const pages = page.locator('.page'); const tag = src.replace('.html', ''); for (let i = 0; i < await pages.count(); i++) await pages.nth(i).screenshot({ path: `${SHOT}/${tag}_p${i + 1}.png` }); await page.emulateMedia({ media: 'print' }); }
  await page.pdf({ path: `${OUT}/${name}`, format: 'A4', landscape: false, printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 }, preferCSSPageSize: true });
  console.log('pdf ok', name); await page.close();
}
await b.close(); if (bad) { console.log('OVERFLOW', bad); process.exit(1); }
