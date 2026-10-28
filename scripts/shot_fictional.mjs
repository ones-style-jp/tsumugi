// 2026-10-29 マニュアルの写真を撮るときの「見本データの架空化」(撮影用の台本の前に読み込む)
//   アプリの見本データ(ログイン前の初期データ)には、実在の店舗名・電話番号・住所・職員の名前が入っている。
//   これを読み込んだまま撮ると、写真に実在のものが写る(10/29 に連絡帳・日誌・各種連絡などの写真で見つかった)。
//   この台本を先に読み込むと、撮影用のブラウザが受け取るアプリの JS の中の、それらの文字を架空のものに置き換えてから動かす
//   (アプリのソースは変えない。撮影のブラウザの中だけ)。サービスワーカーは止める(置き換え前の JS を出さないように)。
//   使い方: node --import ./scripts/shot_fictional.mjs scripts/manual_shots.mjs --base http://localhost:4173 --out <出力先>
import { chromium } from 'playwright';
export const FICTION = [
  ['ひかりデイサービス扇橋店', '（見本）つむぎデイサービス'],
  ['ひかりデイサービス', 'つむぎデイサービス'],
  ['東京都江東区扇橋1-1-1', '東京都新宿区西新宿2-8-1'],
  ['江東区扇橋', '新宿区西新宿'], ['扇橋', '西新宿'],
  ['03-6458-7415', '03-0000-0000'], ['03-6458-7416', '03-0000-0001'], ['03-6458-', '03-0000-'],
  ['佐藤 健一', '見本 管理者'],
  ['"高橋"', '"見本A"'], ['"岩岡"', '"見本B"'], ['"田中"', '"見本C"'], ['"長谷川"', '"見本D"'],
];
export const fictionalize = (t) => FICTION.reduce((s, [a, b]) => s.split(a).join(b), t);
const _launch = chromium.launch.bind(chromium);
chromium.launch = async (...args) => {
  const browser = await _launch(...args);
  const _newContext = browser.newContext.bind(browser);
  browser.newContext = async (opts = {}) => {
    const ctx = await _newContext({ ...opts, serviceWorkers: 'block' });
    await ctx.route(/\/assets\/[^?]*\.js(\?.*)?$/, async (route) => {
      try { const resp = await route.fetch(); const body = fictionalize(await resp.text()); await route.fulfill({ response: resp, body }); }
      catch { await route.continue(); }
    });
    return ctx;
  };
  browser.newPage = async (opts = {}) => (await browser.newContext(opts)).newPage();
  return browser;
};
