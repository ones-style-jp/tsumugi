// 2026-10-31 ユーザー要望(各種設定 → LIFE連携)
//   ①事業所番号とサービス種類コードは「通所介護」で1行・「総合事業(要支援・事業対象者)」で1行に並ぶ(同じ高さに横並び・PC/iPad)
//   ②CSVバージョンは入力欄ではなく、つむぎが対応している版(0310)を表示するだけ。以前に設定へ打たれた値(例 0300)があっても LIFE提出の画面は 0310 を使う
//   実行: node scripts/chk_1031lifecfg.mjs [--port 4175]
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4175'; })();
const SHOT = process.argv.includes('--shot');
const b = await chromium.launch(); const r = {};
const open = async (vp, view) => { const ctx = await b.newContext({ viewport: vp, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => d.accept());
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  await page.evaluate((v) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), officeNumber: '1300000000', serviceCode: '78', officeNumber2: '13A0000000', serviceCode2: 'A7', insurerNo: '130000', lifeCsvVersion: '0300' }; // 番号は架空・版は古い値が残っていた想定
    d.systemSettings.addons = { ...(d.systemSettings.addons || {}), kasan_kagaku: true }; localStorage.setItem('daycareAppData_v3', JSON.stringify(d));
    localStorage.setItem('tsumugiSidebarOpen', '0'); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: null, t: Date.now() })); }, view);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
  return { ctx, page }; };
for (const [k, vp] of [['ipad', { width: 1180, height: 820 }], ['pc', { width: 1440, height: 900 }]]) {
  const { ctx, page } = await open(vp, 'settings');
  await page.getByTestId('settings-vtab-life').click(); await page.waitForTimeout(700);
  const box = async (tid) => page.getByTestId(tid).boundingBox();
  const k1 = page.getByTestId('life-cfg-row-kaigo'); const k2 = page.getByTestId('life-cfg-row-sougou');
  const t1 = await k1.innerText(); const t2 = await k2.innerText();
  const cells1 = await k1.locator('> div').evaluateAll(es => es.map(e => Math.round(e.getBoundingClientRect().top)));
  const cells2 = await k2.locator('> div').evaluateAll(es => es.map(e => Math.round(e.getBoundingClientRect().top)));
  console.log(k, '通所介護の行', JSON.stringify(t1.replace(/\s+/g, ' ')), cells1, '総合事業の行', JSON.stringify(t2.replace(/\s+/g, ' ')), cells2);
  r[`${k}_row1`] = /通所介護/.test(t1) && /1300000000/.test(t1) && /\b78\b/.test(t1) && cells1.length === 3 && Math.max(...cells1) - Math.min(...cells1) < 60; // 3つが同じ段(見出しは入力の高さに合わせて少し下)
  r[`${k}_row2`] = /総合事業/.test(t2) && /13A0000000/.test(t2) && /A7/.test(t2) && cells2.length === 3 && Math.max(...cells2) - Math.min(...cells2) < 60;
  const b1 = await box('life-cfg-row-kaigo'); const b2 = await box('life-cfg-row-sougou'); r[`${k}_order`] = !!b1 && !!b2 && b2.y > b1.y + 30; // 通所介護が上・総合事業が下
  const ver = await page.getByTestId('life-cfg-version').innerText(); const inputs = await page.locator('input[placeholder*="0310"]').count();
  console.log(k, 'CSVバージョンの表示', JSON.stringify(ver), '入力欄', inputs);
  r[`${k}_version`] = /^0310/.test(ver.trim()) && /3\.10/.test(ver) && inputs === 0;
  if (SHOT && k === 'pc') await page.screenshot({ path: process.env.SHOT_PATH || 'chk_1031lifecfg.png', fullPage: false });
  // ② LIFE提出の画面(事業所情報のまとめ)も 0310(設定に 0300 が残っていても)
  await page.evaluate(() => { sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'life_submit', pid: null, t: Date.now() })); });
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800);
  const hub = await page.evaluate(() => document.body.innerText); const m = hub.match(/CSVバージョン：\s*(\S+)/);
  console.log(k, 'LIFE提出のまとめ', m && m[1]); r[`${k}_hubver`] = !!m && m[1] === '0310';
  await ctx.close();
}
await b.close();
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
