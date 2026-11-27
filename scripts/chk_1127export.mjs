// 2026-11-27 1127a: 各種設定 → データ管理 の「データ一括エクスポート」。出るのは CSV(Excel で開ける)だけ。
//   PDF/HTML と期間の選択は無い・ZIP の中は CSV と README だけ・PDF の部品(jsPDF・html2canvas)は読まない
//   使い方: node scripts/chk_1127export.mjs 4173
import { chromium } from 'playwright';
import { execFileSync } from 'child_process';
const PORT = process.argv[2] || '4173'; const BASE = `http://localhost:${PORT}`;
const b = await chromium.launch(); const R = []; const ok = (n, c, d) => { R.push([n, !!c]); console.log((c ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? ' ' + JSON.stringify(d) : '')); };
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', acceptDownloads: true }); const page = await ctx.newPage();
page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'settings', pid: null, t: Date.now() }))); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800);
await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
await page.evaluate(() => { const bs = [...document.querySelectorAll('button')].filter(x => x.textContent.trim() === 'データ管理' && [...x.parentElement.querySelectorAll('button')].some(y => y.textContent.trim() === '体力測定')); if (bs[0]) bs[0].click(); }); await page.waitForTimeout(900);
const title = await page.getByTestId('export-title').innerText().catch(() => '');
ok('1 見出しは CSV(Excel で開けます)', /CSV/.test(title) && /Excel/.test(title) && !/PDF/.test(title), title);
const box = page.locator('div', { has: page.getByTestId('export-title') }).last();
const txt = await box.innerText();
ok('2 PDF/HTML と期間の選択が無い', !/PDF \(推奨\)|HTML \(高速\)/.test(txt) && !/年単位|月単位|期間指定/.test(txt), txt.slice(0, 200));
ok('3 出力形式は CSV と書いてある', /CSV（Excel で開けます）を ZIP/.test(await page.getByTestId('export-format').innerText().catch(() => '')));
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.locator('button', { hasText: 'CSV を ZIP でダウンロード' }).click()]);
const fp = '/tmp/chk_1127export.zip'; await dl.saveAs(fp);
const names = JSON.parse(execFileSync('python3', ['-c', 'import zipfile,json,sys;print(json.dumps(zipfile.ZipFile(sys.argv[1]).namelist(),ensure_ascii=False))', fp]).toString());
console.log('zip', dl.suggestedFilename(), JSON.stringify(names));
const files = names.filter(n => !n.endsWith('/'));
ok('4 ZIP の中は CSV・README・_meta だけ(PDF/HTML なし)', files.length >= 2 && files.every(n => /\.(csv|txt|json)$/.test(n)) && files.some(n => /01_利用者一覧\.csv$/.test(n)), files);
ok('5 ZIP の名前は 利用者情報', /^tsumugi_利用者情報_\d{4}-\d{2}-\d{2}\.zip$/.test(dl.suggestedFilename()), dl.suggestedFilename());
ok('6 PDF の部品を読まない', await page.evaluate(() => !window.jspdf && !window.html2canvas));
await b.close();
const bad = R.filter(x => !x[1]); console.log(bad.length ? `FAIL ${bad.length}: ${bad.map(x => x[0]).join(' / ')}` : 'ALL PASS'); process.exit(bad.length ? 1 : 0);
