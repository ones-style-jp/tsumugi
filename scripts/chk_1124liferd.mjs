// 2026-11-24 trial634: 管理局 外部サービス設定「LIFE 提出の準備状況（全店）」(api/life-readiness の返事を見本で差し替えて画面を確かめる)
//   ① カードとボタン・提出年月の欄がある ② 押すと合言葉と提出年月を送り、店舗ごとの行(テスト店舗は最後・薄く)と 3か月以内／古い／なしの数が出る ③ 未設定の項目は赤字 ④ 合言葉違いはエラー表示
//   node chk/chk_1124liferd.mjs [port]   (VITE_E2E_DEMO=1 のビルド・#hqservices)
import { chromium } from 'playwright';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
const SERVICES = { services: [{ id: 'aws_backup', name: 'AWS S3（写真の控え）', vendor: 'Amazon', status: 'active', configured: true, required: false, test: 'aws', desc: '控え', fields: [] }] };
const RD = { ok: true, at: new Date().toISOString(), ym: '2026-12', stores: [
  { key: 'store_test', name: 'テスト店', isTest: true, addons: { kagaku: true, adl: true, kinou2: true }, office: { officeNumber: '1399999999', serviceCode: '78', officeNumber2: '', serviceCode2: '', insurerNo: '131086', defaultJob: '050', trinity: 1 }, patients: { total: 20, active: 18, insuredOk: 18, insuredShort: 0, insurerOk: 18, basic4: 18, levelOk: 17 }, forms: { adl: { recent: 16, old: 1, none: 1 }, seikatsu: { recent: 16, old: 0, none: 2 }, kinou: { recent: 17, old: 0, none: 1 } } },
  { key: 'store_a', name: '甲店', isTest: false, addons: { kagaku: true, adl: false, kinou2: true }, office: { officeNumber: '1390000001', serviceCode: '78', officeNumber2: '13A0000002', serviceCode2: 'A7', insurerNo: '', defaultJob: '', trinity: null }, patients: { total: 50, active: 42, insuredOk: 20, insuredShort: 12, insurerOk: 5, basic4: 4, levelOk: 30 }, forms: { adl: { recent: 2, old: 10, none: 30 }, seikatsu: { recent: 0, old: 0, none: 42 }, kinou: { recent: 40, old: 2, none: 0 } } },
  { key: 'store_b', name: '乙店', isTest: false, addons: { kagaku: false, adl: false, kinou2: false }, office: { officeNumber: '', serviceCode: '', officeNumber2: '', serviceCode2: '', insurerNo: '', defaultJob: '', trinity: null }, patients: { total: 30, active: 28, insuredOk: 0, insuredShort: 0, insurerOk: 0, basic4: 0, levelOk: 0 }, forms: { adl: { recent: 0, old: 0, none: 28 }, seikatsu: { recent: 0, old: 0, none: 28 }, kinou: { recent: 0, old: 0, none: 28 } } },
] };
const b = await chromium.launch();
const run = async (wrongSecret) => {
  const ctx = await b.newContext({ viewport: { width: 1200, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); const calls = [];
  page.on('pageerror', e => { console.log('PAGEERROR', e.message.slice(0, 200)); fails++; });
  await page.route('**/api/admin-secrets', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SERVICES) }); });
  await page.route('**/api/usage-summary', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, unavailable: [] }) }); });
  await page.route('**/api/life-readiness', async (route) => { const body = JSON.parse(route.request().postData() || '{}'); calls.push(body); if (wrongSecret) return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: '合言葉が違います' }) }); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RD) }); });
  await page.goto(`http://localhost:${PORT}/#hqservices`, { waitUntil: 'networkidle' }); await page.waitForTimeout(600);
  await page.getByText('外部サービス設定（全店共通').first().click().catch(() => {}); await page.waitForTimeout(400);
  const pw = page.getByTestId('hq-secret'); await pw.fill('e2e-secret'); await pw.press('Enter'); await page.waitForTimeout(800);
  return { page, ctx, calls };
};
// ① ② ③
{ const { page, ctx, calls } = await run(false);
  ok((await page.getByTestId('life-ready-card').count()) === 1 && (await page.getByTestId('life-ready-btn').count()) === 1 && (await page.getByTestId('life-ready-ym').count()) === 1, 'カード・ボタン・提出年月の欄がある');
  await page.getByTestId('life-ready-ym').fill('2026-12'); await page.getByTestId('life-ready-btn').click(); await page.waitForTimeout(800);
  ok(calls.length === 1 && calls[0].secret === 'e2e-secret' && calls[0].ym === '2026-12', `合言葉と提出年月を送る (${JSON.stringify(calls[0])})`);
  ok((await page.getByTestId('life-ready-table').count()) === 1, '表が出る');
  const rows = page.locator('[data-testid^="life-ready-row-"]'); const n = await rows.count();
  ok(n === 3 && (await rows.nth(2).getAttribute('data-testid')) === 'life-ready-row-store_test', `店舗の行 3・テスト店舗は最後 (${n})`);
  const t = await page.getByTestId('life-ready-table').innerText();
  ok(/甲店/.test(t) && /16／1／1/.test(t) && /40／2／0/.test(t), '3か月以内／古い／なしの数が出る');
  ok(/未設定/.test(t) && /未入力/.test(t) && /桁不足 12/.test(t), '未設定・未入力・桁不足が出る');
  ok(/2026-12/.test(await page.getByTestId('life-ready-box').innerText()), '提出年月の説明が出る');
  await ctx.close(); }
// ④
{ const { page, ctx } = await run(true);
  await page.getByTestId('life-ready-btn').click(); await page.waitForTimeout(800);
  ok((await page.getByTestId('life-ready-err').count()) === 1 && /合言葉/.test(await page.getByTestId('life-ready-err').innerText()), '合言葉違いはエラー表示');
  await ctx.close(); }
await b.close(); console.log(fails ? `FAIL ${fails}` : 'ALL PASS'); process.exit(fails ? 1 : 0);
