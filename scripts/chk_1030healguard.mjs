// 2026-10-30 ユーザー報告「アプリを立ち上げたらエラー(画面の表示中にエラーが発生しました)。再読み込みするとログイン画面になる」
//   原因: 開いたときの自動修復(日付・休止・被保険者番号)がログイン前に動き、保存の処理が staffSession.storeId を読んで落ちた
//   ①ログインしていない状態で、店舗の印(_sbStoreId)と直す必要のある利用者(被保険者番号3桁)が端末に残っていても落ちない(本番はログイン後まで修復を待つ・見本は修復が走るが落ちない)
//   実行: node scripts/chk_1030healguard.mjs [--port 4175]
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4175'; })();
const r = {}; const errs = [];
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1180, height: 820 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
page.on('dialog', d => d.accept()); page.on('pageerror', e => errs.push(e.message.slice(0, 160)));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const S = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const p = d.patients.find(x => x.status === '利用中'); p.insuranceNo = '123'; p.startDate = 'S60.4.1'; d._sbStoreId = 'store_chk_x'; // 本番と同じく店舗の印がある(ログイン前に保存の処理へ行くと staffSession.storeId で落ちていた)
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); sessionStorage.removeItem('tsumugiStaffSession'); sessionStorage.removeItem('tsumugiActiveRecorder'); sessionStorage.removeItem('tsumugi_resume_view'); return { id: p.id, keys: Object.keys(sessionStorage) }; });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(3000);
const body = await page.evaluate(() => document.body.innerText);
const after = await page.evaluate((id) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const p = d.patients.find(x => x.id === id); return { ins: p && p.insuranceNo, sd: p && p.startDate, session: !!sessionStorage.getItem('tsumugiStaffSession') }; }, S.id);
console.log('ログインなしで開く: エラー画面', /画面の表示中にエラー/.test(body), 'ページエラー', errs, 'ログインの文字', /ログイン|パスワード|ID/.test(body), '値', JSON.stringify(after));
r.noCrash = !/画面の表示中にエラー/.test(body) && errs.length === 0;
r.loginShown = /ログイン|パスワード/.test(body) || !after.session;
r.healedSafely = after.ins === '0000000123' && after.sd === '1985-04-01'; // 見本はログインなしでも動く作りなので修復は走る(落ちないことが要点)
await b.close();
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
