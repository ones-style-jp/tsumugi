// 2026-11-11 trial555: iPad/iPhone のホーム画面アプリの印刷 — 印刷用の表示を開いたら裏で PDF を用意し、「印刷する」1回で共有メニューへ
//   node chk/chk_1111iosprint.mjs [port]   (見本データ VITE_E2E_DEMO=1 のビルド)
//   iPad の UA + display-mode: standalone を CDP で真似る。共有メニュー(navigator.share)は差し替えて「呼ばれたか」だけ見る。
import { chromium } from 'playwright';
import fs from 'node:fs';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
const S = process.env.S || '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad';
const OUT = `${S}/shots/iosprint`; fs.mkdirSync(OUT, { recursive: true });
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1080, height: 810 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true, locale: 'ja-JP', timezoneId: 'Asia/Tokyo',
  userAgent: 'Mozilla/5.0 (iPad; CPU OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1' });
const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => { console.log('PAGEERROR', e.message.slice(0, 200)); fails++; });
await page.addInitScript(() => { try { Object.defineProperty(navigator, 'standalone', { get: () => true, configurable: true }); } catch {} window.__shareCalls = []; navigator.share = async (d) => { window.__shareCalls.push({ files: (d.files || []).map(f => ({ name: f.name, size: f.size, type: f.type })), title: d.title }); }; navigator.canShare = () => true; });
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(900); }
await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 400 }).catch(() => {});
ok(await page.evaluate(() => navigator.standalone === true), 'ホーム画面アプリ(navigator.standalone)として動いている');
// 印刷用の表示を開く(連絡帳と同じ「まっすぐ印刷画面へ」の経路)
const html = '<div class="p-page" data-page-break style="width:210mm;height:297mm;padding:20mm;font-size:16px;"><h1>検査用の用紙</h1><p>架空の内容です。</p></div>';
await page.evaluate((html) => window.dispatchEvent(new CustomEvent('setPrintHtml', { detail: { title: '検査用', pageSize: 'A4', html, autoPrint: true } })), html);
await page.waitForSelector('#tsumugi-ios-print', { timeout: 5000 }); await page.waitForTimeout(100);
const btn = page.locator('#tsumugi-ios-print [data-act="pdf"]');
const t0 = Date.now();
const prep = await btn.innerText().catch(() => '');
ok(/準備中|印刷する/.test(prep), `表示を開いた直後からボタンが「印刷の準備中…」(${prep.replace(/\s+/g, ' ')})`);
await page.waitForSelector('#tsumugi-ios-print [data-act="pdf"][data-ready="1"]', { timeout: 20000 });
const dt = Date.now() - t0;
ok(true, `押さなくても PDF が用意された (${dt}ms)`);
ok((await btn.innerText()).includes('印刷する'), `ボタンの名前は「印刷する（プリント／"ファイル"に保存）」: ${await btn.innerText()}`);
const msg = await page.locator('#tsumugi-ios-print [data-act="msg"]').innerText();
ok(/押すと共有メニュー/.test(msg), `案内文: ${msg}`);
const pdf = await page.evaluate(() => window.__tsumugiLastPdf ? { size: window.__tsumugiLastPdf.size, name: window.__tsumugiLastPdf.name } : null);
ok(pdf && pdf.size > 2000 && /\.pdf$/.test(pdf.name), `PDF の中身がある ${JSON.stringify(pdf)}`);
await page.screenshot({ path: `${OUT}/ready.png` });
await btn.click(); await page.waitForTimeout(300);
const calls = await page.evaluate(() => window.__shareCalls);
ok(calls.length === 1 && calls[0].files.length === 1 && calls[0].files[0].type === 'application/pdf', `1回押すと共有メニュー(navigator.share)が PDF 付きで開く ${JSON.stringify(calls)}`);
await btn.click(); await page.waitForTimeout(300);
ok((await page.evaluate(() => window.__shareCalls.length)) === 2, '2回目も同じ PDF で共有メニュー(作り直さない)');
ok(!/準備中/.test(await btn.innerText()), 'ボタンは準備中に戻らない');
await page.locator('#tsumugi-ios-print [data-act="close"]').click(); await page.waitForTimeout(200);
ok((await page.locator('#tsumugi-ios-print').count()) === 0, '閉じると元の画面に戻る');
// 準備中に押した場合: できたら共有を試み、開けなければ「もう一度押してください」
await page.evaluate((html) => window.dispatchEvent(new CustomEvent('setPrintHtml', { detail: { title: '検査用2', pageSize: 'A4', html: html + html + html, autoPrint: true } })), html);
await page.waitForSelector('#tsumugi-ios-print [data-act="pdf"]', { timeout: 5000 });
await page.evaluate(() => { navigator.share = async () => { const e = new Error('not allowed'); e.name = 'NotAllowedError'; throw e; }; });
await page.locator('#tsumugi-ios-print [data-act="pdf"]').click({ timeout: 2000 }).catch(() => {});
const m2 = await page.locator('#tsumugi-ios-print [data-act="msg"]').innerText();
ok(/準備中|もう一度/.test(m2), `準備中に押すと案内が出る: ${m2}`);
await page.waitForSelector('#tsumugi-ios-print [data-act="pdf"][data-ready="1"]', { timeout: 20000 }); await page.waitForTimeout(300);
const m3 = await page.locator('#tsumugi-ios-print [data-act="msg"]').innerText();
ok(/もう一度「印刷する」を押してください/.test(m3), `共有メニューを開けなかったときは「もう一度押してください」: ${m3}`);
await page.screenshot({ path: `${OUT}/again.png` });
await ctx.close(); await b.close();
console.log(fails ? `FAILS ${fails}` : 'ALL PASS'); process.exit(fails ? 1 : 0);
