// Vercel Serverless Function: 印刷プレビューのHTMLからサーバー側でPDFを作る(2026-10-03)
//
// ★ 目的(ユーザー相談「他社SaaSはPDFダウンロードが主流」): ブラウザの印刷ダイアログに頼らず、
//   どの端末でも同じ見た目の「文字のPDF」(検索・拡大がきれい・ヘッダー/フッター無し)をファイルとして渡す。
//   画面側は印刷プレビューの「PDFをダウンロード」ボタンから、プレビューと同じHTMLをこの関数へ送る。
//
// 仕組み: @sparticuz/chromium(サーバーレス向けの Chrome) + puppeteer-core で HTML を開き page.pdf()。
//   日本語フォントは public/fonts の Noto Sans JP(Regular/Bold)をサイトから取得して登録(サーバーの Chrome には日本語フォントが無い)。
//   関数バンドルに同梱する方式は Vercel 上でパスが見つからず文字化けしたため、URL 取得(chromium.font(url)・一度取ったら実行環境内で再利用)+
//   HTML に @font-face も注入する二段構え。
//   CSS の @page(用紙サイズ・向き)を優先(preferCSSPageSize)。印刷メディア(@media print)で描画するので画面用の影などは入らない。
//
// POST /api/pdf  body: { html: "<!DOCTYPE html>…", pageSize?: "A4 portrait"|"297mm 210mm"|…, title?: "ファイル名" }
//   → application/pdf (Content-Disposition: attachment)。失敗時は { error } (JSON)。
// 制限: 本文 3MB まで・同一オリジン(つむぎのドメイン)からのみ。個人情報を含むHTMLはこの関数の中だけで使い、保存しない。
//
// ローカル確認: CHROME_PATH=/path/to/Chrome node -e "..."(scratchpad/pdf_local.mjs 参照)


export const config = { maxDuration: 60 };

const MAX_BODY = 3 * 1024 * 1024;
const ALLOWED_HOSTS = ['tsumugi-ones-style.vercel.app', 'tsumugi-git-trial-ones-style.vercel.app', 'localhost', '127.0.0.1'];

function parsePageSize(ps) {
  const s = String(ps || 'A4 portrait').trim();
  const mm = s.match(/^(\d+(?:\.\d+)?)mm\s+(\d+(?:\.\d+)?)mm$/);
  if (mm) return { width: `${mm[1]}mm`, height: `${mm[2]}mm` };
  const fmt = (s.match(/\b(A3|A4|A5|B4|B5|B6|Letter|Legal)\b/i) || [])[1];
  const landscape = /landscape|横/.test(s);
  // B5/B6 は puppeteer の format 名にある(B5=176×250? 実際はISO B5=176×250、JIS B5は182×257)。JIS 寸法を mm で渡す
  if (fmt && /^B5$/i.test(fmt)) return landscape ? { width: '257mm', height: '182mm' } : { width: '182mm', height: '257mm' };
  if (fmt && /^B6$/i.test(fmt)) return landscape ? { width: '182mm', height: '128mm' } : { width: '128mm', height: '182mm' };
  return { format: (fmt || 'A4').toUpperCase(), landscape };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    if (typeof req.body === 'string') { try { return resolve(JSON.parse(req.body)); } catch (e) { return reject(e); } }
    let data = ''; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(new Error('too large')); try { req.destroy(); } catch {} return; } data += c; });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

let _browserP = null; let _fontsLoadedFor = '';
async function ensureFonts(base) {
  if (process.env.CHROME_PATH) return; // ローカル(システムフォントあり)
  if (_fontsLoadedFor === base) return;
  try {
    const chromium = (await import('@sparticuz/chromium')).default;
    for (const f of ['NotoSansJP-Regular.otf', 'NotoSansJP-Bold.otf']) await chromium.font(`${base}/fonts/${f}`);
    _fontsLoadedFor = base;
  } catch (e) { console.warn('font register failed', e && e.message); }
}
async function getBrowser() {
  if (_browserP) { try { const b = await _browserP; if (b && b.connected) return b; } catch {} _browserP = null; }
  _browserP = (async () => {
    const puppeteer = (await import('puppeteer-core')).default;
    const local = process.env.CHROME_PATH;
    if (local) {
      return puppeteer.launch({ executablePath: local, headless: true, args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none'] });
    }
    const chromium = (await import('@sparticuz/chromium')).default;
    const exe = await chromium.executablePath();
    return puppeteer.launch({ executablePath: exe, headless: chromium.headless, args: [...chromium.args, '--font-render-hinting=none'], defaultViewport: { width: 1200, height: 1600 } });
  })();
  return _browserP;
}

export default async function handler(req, res) {
  // ★ ウォームアップ(GET ?warm=1): 画面がプレビューを開いた時などに呼び、Chrome の起動とフォント取得を先に済ませておく(初回の数秒待ちを減らす)
  if (req.method === 'GET') {
    try { const h = String(req.headers.host || ''); const base = h ? `https://${h}` : 'https://tsumugi-ones-style.vercel.app'; await ensureFonts(base); await getBrowser(); res.setHeader('Cache-Control', 'no-store'); return res.status(200).json({ ok: true, warm: true }); }
    catch (e) { return res.status(500).json({ ok: false, error: String(e && e.message || e) }); }
  }
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ error: 'POST only' }); }
  try {
    const origin = String(req.headers.origin || req.headers.referer || '');
    const host = (() => { try { return new URL(origin).hostname; } catch { return ''; } })();
    const okHost = !origin || ALLOWED_HOSTS.includes(host) || /\.vercel\.app$/.test(host);
    if (!okHost) return res.status(403).json({ error: 'forbidden origin' });
    const body = await readBody(req);
    const html = String(body.html || '');
    if (!html || html.length > MAX_BODY) return res.status(400).json({ error: html ? 'html too large' : 'html required' });
    const title = String(body.title || 'document').replace(/[\\/:*?"<>|\r\n]+/g, '_').slice(0, 120);
    const size = parsePageSize(body.pageSize);
    // ★ 用紙サイズは画面から渡された pageSize を最優先にする。アプリ全体のCSSに @page{size:A4} があり、preferCSSPageSize だとそれが勝って
    //   連絡帳(B5横など)がA4縦になった(2026-10-04 ユーザー報告)。後から書いた @page が勝つので、本文の最後に注入する
    const sizeCss = size.width ? `${size.width} ${size.height}` : `${size.format} ${size.landscape ? 'landscape' : 'portrait'}`;
    // ★ 2026-10-04(分析個人が1ページしか出ない): アプリ全体のCSS(html,body の overflow:hidden / height 固定)が2ページ目以降を切り捨てていた。
    //   印刷用に html/body/直下要素を必ず伸ばす(改ページが効くように)
    // 名前付きの @page(分析個人の縦横混在 p/l など)は、最後に注入する既定サイズに負けないよう後ろに再掲する
    const namedPages = (html.match(/@page\s+[A-Za-z_][\w-]*\s*\{[^}]*\}/g) || []).join('');
    const fixCss = `<style>@page{size:${sizeCss};margin:0;}${namedPages}html,body{height:auto!important;max-height:none!important;overflow:visible!important;}body>*{overflow:visible!important;max-height:none!important;}</style>`;
    const htmlSized = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${fixCss}</body>`) : html + fixCss;

    const base = (host && /^(localhost|127\.0\.0\.1)$/.test(host)) ? origin.replace(/\/$/, '') : (host ? `https://${host}` : 'https://tsumugi-ones-style.vercel.app');
    await ensureFonts(base);
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      await page.emulateMediaType('print');
      await page.setContent(htmlSized, { waitUntil: ['load', 'networkidle0'], timeout: 25000 });
      // Web フォントが指定されていても、無い文字は Noto Sans JP に落ちる。全体の既定も Noto に
      await page.addStyleTag({ content: `@font-face{font-family:"Noto Sans JP";font-weight:400;src:url("${base}/fonts/NotoSansJP-Regular.otf") format("opentype");}@font-face{font-family:"Noto Sans JP";font-weight:700;src:url("${base}/fonts/NotoSansJP-Bold.otf") format("opentype");}html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact;} body,body *{font-family:"Noto Sans JP","Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Meiryo",sans-serif!important;}` });
      try { await page.evaluateHandle('document.fonts && document.fonts.ready'); } catch {}
      const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 }, ...size, timeout: 30000 });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(title)}.pdf`);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).send(Buffer.from(pdf));
    } finally {
      try { await page.close(); } catch {}
    }
  } catch (e) {
    console.error('pdf failed', e);
    return res.status(500).json({ error: 'PDFの生成に失敗しました: ' + (e && e.message ? e.message : String(e)) });
  }
}
