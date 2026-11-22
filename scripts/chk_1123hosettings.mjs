// 2026-11-23 trial617(ユーザー「各種設定からも(管理者の交代を)申請できるように」): 各種設定 → ログイン・管理者 に「管理者の交代」の札。
//   申請する → 小窓(新しい管理者・前の管理者の役職・申請者)→ 申請 → 「申請中」の表示と取り下げ → 取り下げると元に戻る。見本ビルド(:4175)
//   実行: node chk/chk_1123hosettings.mjs [port]
import { chromium } from 'playwright';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
let reports = 0; await page.route('**/api/report', route => { reports++; route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
page.on('dialog', d => d.accept()); page.on('pageerror', e => { console.log('PAGEERROR', e.message.slice(0, 200)); fails++; });
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.systemSettings = d.systemSettings || {}; d.systemSettings.adminAuth = { ...(d.systemSettings.adminAuth || {}), handover: null }; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'settings', pid: null, t: Date.now() })); });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
await page.getByTestId('settings-vtab-login').click(); await page.waitForTimeout(800);
const body0 = await page.locator('body').innerText();
ok(/管理者の交代/.test(body0), '1 各種設定 → ログイン・管理者 に「管理者の交代」の札がある');
const open = page.getByTestId('handover-open'); ok((await open.count()) === 1 && /申請する/.test(await open.innerText()), '2 「管理者の交代を本部に申請する」のボタン');
await open.click(); await page.waitForTimeout(500);
ok((await page.getByTestId('handover-modal').count()) === 1, '3 申請の小窓が開く');
const opts = await page.locator('[data-testid="handover-new"] option').evaluateAll(els => els.map(e => e.value).filter(Boolean));
ok(opts.length >= 1, `4 新しい管理者の候補(管理者以外の職員)が並ぶ(${opts.length}名)`);
await page.getByTestId('handover-new').selectOption(opts[0]); await page.getByTestId('handover-by').fill('検査 太郎'); await page.getByTestId('handover-submit').click(); await page.waitForTimeout(1500);
const body1 = await page.locator('body').innerText();
ok(/管理者の交代を本部に申請中/.test(body1) && (await page.getByTestId('handover-open').count()) === 0, '5 申請すると「申請中」の表示になり、ボタンは消える');
ok(reports === 1, `6 本部への知らせ(/api/report)が 1 回送られる(${reports})`);
const saved = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const h = d.systemSettings?.adminAuth?.handover; return !!(h && h.status === 'pending' && h.by === '検査 太郎'); });
ok(saved, '7 申請は店舗の設定(adminAuth.handover)に控えられる');
await page.locator('button:visible', { hasText: /取り下げ/ }).first().click(); await page.waitForTimeout(1200);
ok((await page.getByTestId('handover-open').count()) === 1, '8 取り下げると申請のボタンに戻る');
await b.close(); console.log(fails ? `FAIL ${fails}` : 'ALL PASS'); process.exit(fails ? 1 : 0);
