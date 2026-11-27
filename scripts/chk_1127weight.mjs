// 2026-11-27 trial656: 「今すぐ更新」の段階の文・読み込み直しのあいだの画面・かかった時間の記録
//   A 帯の「今すぐ更新」: 押すと段階の文(update-stage)・読み込み直しのあいだは「新しい版を読み込んでいます…」の画面(白い画面にしない)・印は 1 回で消える・見ていた画面へ戻る
//   B 開いたときの記録(boot-perf)と、まとめ(tsumugiPerfSum)が数字だけで残る
//   C 部品の文: 段階なし=今までどおり「更新中…（そのままお待ちください）」
//   使い方: node chk/chk_1127weight.mjs 4175
import { chromium } from 'playwright';
const PORT = process.argv[2] || '4175'; const BASE = `http://localhost:${PORT}`;
const b = await chromium.launch(); const R = []; const ok = (n, c, d) => { R.push([n, !!c]); console.log((c ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? ' ' + JSON.stringify(d) : '')); };
const PC = { viewport: { width: 1180, height: 820 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' };
const ctx = await b.newContext(PC); const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
// 新しい版があるように見せる(index.html の確認だけ別の名前を返す)
await page.route('**/index.html?_v=*', async (route) => { const r = await route.fetch(); const t = await r.text(); await route.fulfill({ response: r, body: t.replace(/\/assets\/index-/g, '/assets/indexNEW-') }); });
await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
await page.evaluate(() => { sessionStorage.setItem('tsumugiActiveRecorder', JSON.stringify({ id: 'demo_rec', name: '見本 職員', roleLabel: '介護職員' })); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'schedule', pid: null, t: Date.now() })); });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});

// ===== B 開いたときの記録 =====
{ const r = await page.evaluate(() => ({ log: JSON.parse(localStorage.getItem('tsumugiSyncLog') || '[]').filter(x => x.ev === 'boot-perf').slice(-1)[0] || null, sum: JSON.parse(localStorage.getItem('tsumugiPerfSum') || 'null') }));
  ok('B1 開いたときの記録 boot-perf が残る(js・kb・up は数字)', r.log && typeof r.log.d.js === 'number' && typeof r.log.d.kb === 'number' && r.log.d.up > 0, r.log && r.log.d);
  ok('B2 まとめ tsumugiPerfSum に日付・boot・回数', r.sum && /^\d+\/\d+$/.test(r.sum.day) && r.sum.boot && r.sum.boots >= 1, r.sum);
  const flat = JSON.stringify(r.sum || {}); ok('B3 まとめは数字と決まった見出しだけ(日本語の文字なし)', !/[぀-ヿ一-鿿]/.test(flat)); }

// ===== A 帯の「今すぐ更新」 =====
await page.getByTestId('update-banner-go').waitFor({ timeout: 15000 });
ok('A1 新しい版の帯が出る', await page.getByTestId('update-banner-go').isVisible());
ok('A2 押す前のボタンは「今すぐ更新」', (await page.getByTestId('update-banner-go').textContent()) === '今すぐ更新');
// 読み込み直しのプログラムの受信を 2.5 秒遅らせて、その間の画面を見る
let delayed = 0; await page.route('**/assets/index-*.js', async (route) => { delayed++; await new Promise(r => setTimeout(r, 2500)); await route.continue(); });
const seen = []; await page.exposeFunction('__seen', (s) => { seen.push(s); });
await page.evaluate(() => { const el = document.querySelector('[data-testid="update-banner-go"]'); const mo = new MutationObserver(() => { try { window.__seen(el.textContent); } catch {} }); mo.observe(el, { childList: true, subtree: true, characterData: true }); });
await page.getByTestId('update-banner-go').click();
await page.waitForFunction(() => !!document.querySelector('[data-tsu-splash="1"]'), null, { timeout: 15000 });
const sp = await page.evaluate(() => { const e = document.querySelector('[data-tsu-splash="1"]'); const r = e.getBoundingClientRect(); return { t: e.textContent, w: r.width, h: r.height, flag: sessionStorage.getItem('tsumugiUpdateSplash') }; });
ok('A3 押した直後は「更新中…（そのままお待ちください）」(今までと同じ文)', seen.some(s => s === '更新中…（そのままお待ちください）'), seen);
ok('A4 読み込み直しの前に「新しい版を読み込んでいます…」に変わる', seen.some(s => /^新しい版を読み込んでいます…（.*そのままお待ちください）$/.test(s)), seen);
ok('A5 読み込み直しのあいだ「新しい版を読み込んでいます…」の画面が出る(白い画面にしない)', /新しい版を読み込んでいます…/.test(sp.t) && /30 秒ほど/.test(sp.t) && !/ログインしています/.test(sp.t) && sp.w > 1000 && sp.h > 700, sp);
ok('A6 印(tsumugiUpdateSplash)は 1 回で消える', sp.flag === null);
ok('A7 プログラムの受信は実際に待たせた', delayed >= 1, delayed);
await page.waitForFunction(() => !document.querySelector('[data-tsu-splash="1"]'), null, { timeout: 20000 }); await page.waitForTimeout(1500);
ok('A8 立ち上がったら案内の画面は消え、見ていた画面(カレンダー)へ戻る', await page.locator('button:visible', { hasText: /^予定を追加$/ }).count() > 0);
{ const r = await page.evaluate(() => JSON.parse(localStorage.getItem('tsumugiPerfSum') || 'null'));
  ok('A9 読み込み直しの受信時間が記録に入る(js が 2 秒以上)', r && r.boot && r.boot.js >= 2000 && r.boots >= 2, r && { boot: r.boot, boots: r.boots }); }
// ふつうの読み込み直し(印なし)では案内の画面を出さない
await page.unroute('**/assets/index-*.js'); let splashOnPlain = false;
await page.route('**/assets/index-*.js', async (route) => { await new Promise(r => setTimeout(r, 1200)); await route.continue(); });
const p2 = page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(700); splashOnPlain = await page.evaluate(() => !!document.querySelector('[data-tsu-splash="1"]')).catch(() => false); await p2;
ok('A10 ふつうの読み込み直しでは案内の画面を出さない', splashOnPlain === false);

// ===== C 部品の文(秒) =====
{ await page.unroute('**/assets/index-*.js'); await page.getByTestId('update-banner-go').waitFor({ timeout: 15000 });
  // 読み込み直しを止めて(index の受信を返さない)、5 秒を過ぎたら秒が出ることを見る
  await page.route('**/*', async (route) => { if (route.request().isNavigationRequest()) { await new Promise(r => setTimeout(r, 7000)); await route.continue(); } else await route.continue(); });
  // (読み込み直しの途中は外から画面を読めないので、画面の中で文の移り変わりを集める)
  seen.length = 0;
  await page.evaluate(() => { const el = document.querySelector('[data-testid="update-banner-go"]'); const mo = new MutationObserver(() => { try { window.__seen(el.textContent); } catch {} }); mo.observe(el, { childList: true, subtree: true, characterData: true }); });
  await page.getByTestId('update-banner-go').click(); await page.waitForTimeout(9000);
  ok('C1 5 秒を過ぎると秒が出る(新しい版を読み込んでいます…（N秒・そのままお待ちください）)', seen.some(t => /^新しい版を読み込んでいます…（[5-7]秒・そのままお待ちください）$/.test(t)) && !seen.some(t => /（[1-4]秒・/.test(t)), seen); }
await b.close();
const ng = R.filter(r => !r[1]); console.log(`\n${R.length - ng.length}/${R.length} PASS`); if (ng.length) { console.log('NG:', ng.map(r => r[0]).join(' / ')); process.exit(1); }
