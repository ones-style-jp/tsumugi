// 2026-10-29 柴又店のノートパソコン「ログインすると画面がバグっている(飾り=CSS が全部外れている)・再起動してもダメ」
//   本番は /assets/ の「見つからない(404)」にも「1年間そのまま使ってよい」を付けていて、取りそこねると覚えてしまう。index.html の取り直しで直るか。
//   ①ふつうに開く: 飾りが当たる・取り直しの読み込み(?r=)はしない ②飾りのファイルが最初だけ見つからない(覚えた404のまね): 取り直して飾りが当たる・案内は出ない
//   ③飾りのファイルがずっと見つからない: 1回だけ読み込み直したあと、案内(Ctrl+F5)が出る ④プログラム本体が最初だけ見つからない: 取り直して画面が出る
//   実行: node scripts/chk_1029assetheal.mjs [--port 4175]
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4175'; })();
const r = {};
const run = async (mode) => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP' }); const page = await ctx.newPage();
  const seen = []; let navs = 0; page.on('framenavigated', f => { if (f === page.mainFrame()) navs++; });
  await page.route(/\/assets\/index-[^/]*\.(css|js)(\?.*)?$/, async (route) => { const u = route.request().url(); seen.push(u.replace(/^.*\/assets\//, ''));
    const isCss = /\.css/.test(u), hasR = /\?r=/.test(u);
    const fail = (mode === 'cssOnce' && isCss && !hasR) || (mode === 'cssAlways' && isCss) || (mode === 'jsOnce' && !isCss && !hasR && /index-[^/]*\.js/.test(u));
    if (fail) return route.fulfill({ status: 404, headers: { 'cache-control': 'public, max-age=31536000, immutable', 'content-type': 'text/plain' }, body: 'NOT_FOUND' });
    return route.continue(); });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' }); await page.waitForTimeout(mode === 'cssAlways' ? 15000 : 4500);
  const st = await page.evaluate(() => { const p = document.createElement('div'); p.className = 'hidden'; document.body.appendChild(p); const ok = getComputedStyle(p).display === 'none'; p.remove();
    return { styled: ok, notice: !!document.getElementById('tsu-asset-notice'), root: (document.getElementById('root') || {}).childElementCount || 0 }; });
  await b.close(); return { ...st, req: seen, navs }; };
const a = await run('normal'); console.log('①ふつう', JSON.stringify(a)); r.normal = a.styled && !a.notice && !a.req.some(u => /\?r=/.test(u)) && a.navs === 1;
const c1 = await run('cssOnce'); console.log('②飾りが最初だけ404', JSON.stringify(c1)); r.cssOnce = c1.styled && !c1.notice && c1.req.some(u => /\.css\?r=/.test(u));
const c2 = await run('cssAlways'); console.log('③飾りがずっと404', JSON.stringify(c2)); r.cssAlways = !c2.styled && c2.notice && c2.navs === 2;
const j1 = await run('jsOnce'); console.log('④本体が最初だけ404', JSON.stringify(j1)); r.jsOnce = j1.root > 0 && j1.styled && j1.req.some(u => /\.js\?r=/.test(u));
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
