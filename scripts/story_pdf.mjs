import { chromium } from 'playwright';
const [,, src, out] = process.argv;
const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 760, height: 1100 } });
await page.goto('file://' + src, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
await page.addStyleTag({ content: '@page{size:A4;margin:14mm 14mm 16mm} body{font-size:14.5px;background:#fff} h2{break-after:avoid} .foot{margin-top:28px} .wrap{padding:0 !important;max-width:none} .box,.scene,.steps li{break-inside:avoid} .pill{border:1px solid currentColor}' });
await page.emulateMedia({ media: 'print' });
await page.pdf({ path: out, format: 'A4', printBackground: true, preferCSSPageSize: true });
await b.close(); console.log('pdf ok');
