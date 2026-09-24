// マニュアルHTML → PDF (A4縦) 変換 (2026-09-23)。 事前に public/ を配信しておく:  python3 -m http.server 4174 -d public
//   node scripts/manual_pdf.mjs [--base http://localhost:4174] [--out docs/マニュアル]
import { chromium } from 'playwright';
import fs from 'node:fs'; import path from 'node:path';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://localhost:4174'); const OUT = arg('--out', 'docs/マニュアル');
fs.mkdirSync(OUT, { recursive: true });
const jobs = [
  ['manual-jigyosho.html', 'つむぎ操作マニュアル_事業所向け.pdf'],
  ['manual-kazoku.html', 'つむぎご利用ガイド_ご家族向け.pdf'],
  ['manual-kankeisha.html', 'つむぎご利用ガイド_ケアマネ関係者向け.pdf'],
];
const extra = arg('--extra', ''); if (extra) { for (const one of extra.split(';')) { if (!one.trim()) continue; const [src, name, land] = one.split(','); jobs.push([src.trim(), name.trim(), (land||'').trim() === 'landscape']); } } // 複数は ; 区切り
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [src, name, landscape] of jobs) {
  await page.goto(`${BASE}/${src}`, { waitUntil: 'networkidle' });
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(800);
  const file = path.join(OUT, name);
  await page.pdf({ path: file, format: 'A4', landscape: !!landscape, printBackground: true, margin: landscape ? { top: '8mm', bottom: '8mm', left: '8mm', right: '8mm' } : { top: '12mm', bottom: '14mm', left: '10mm', right: '10mm' }, displayHeaderFooter: !landscape, headerTemplate: '<div></div>', footerTemplate: '<div style="font-size:9px;color:#94a3b8;width:100%;text-align:center;">つむぎ　<span class="pageNumber"></span> / <span class="totalPages"></span></div>' });
  console.log('[pdf]', file, Math.round(fs.statSync(file).size / 1024) + 'KB');
}
await browser.close();
