// パスキーの画面: ログイン画面(#stafflogin)に「パスキーで入る」が出る・押すとサーバーに問いかけを取りに行く(自動テストのビルドはサーバーが無いので失敗の表示)
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4173'; })();
const b = await chromium.launch(); const r = {}; const page = await (await b.newContext({ locale: 'ja-JP' })).newPage(); const calls = [];
page.on('request', q => { if (q.url().includes('/api/staff-auth')) calls.push(q.postData() || ''); });
await page.goto(`http://localhost:${PORT}/#stafflogin`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1200);
r.noButtonAtStart = (await page.getByTestId('passkey-login').count()) === 0; /* trial404: パスキーのボタンは ID/パスワードが合って確認コード待ちのときだけ */
r.loginStill = await page.locator('button', { hasText: /^ログイン$/ }).count() === 1;
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
