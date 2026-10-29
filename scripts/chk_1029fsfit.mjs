// 2026-10-29 ユーザー報告(iPad 無印 第8世代): 「全画面が150%で開くが、欠席・休止の方まで全員見えるのは135%。パソコンは全員が見える」
//   iPad の Safari は zoom をかけた表の getBoundingClientRect に倍率が入らないことがあり、表の高さを倍率で割りすぎて上限150%まで上げていた。
//   ①パソコン(Chromium)・iPad の名乗りの WebKit: 全員が入る倍率が直す前のビルドと同じ(--base のポート)で、表が枠に収まる
//   ②iPad のまね(表の中の getBoundingClientRect から倍率を外す): 全員が入る倍率が①と同じ(150%に張り付かない)・表が枠に収まる
//   実行: node scripts/chk_1029fsfit.mjs [--port 4175] [--base 4173]
import { chromium, webkit } from 'playwright';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const PORT = arg('--port', '4175'), BASE = arg('--base', '');
const UA = 'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
const r = {};
const open = async (port, eng, vp, opts, n, fake) => {
  const b = await eng.launch(); const ctx = await b.newContext({ viewport: vp, screen: vp, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', ...opts }); const page = await ctx.newPage(); page.on('dialog', d => d.accept());
  if (fake) await page.addInitScript(() => {
    // 修正前の iPad のまね: 表(と中のもの)の見た目の大きさに倍率が入らない
    const orig = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () { const rc = orig.call(this);
      try { const t = this.closest && this.closest('#record-table'); const z = t ? (parseFloat(t.style.zoom) || 1) : 1; if (t && z !== 1) return new DOMRect(rc.x, rc.y, rc.width / z, rc.height / z); } catch {}
      return rc; };
  });
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  await page.evaluate((n) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const t = new Date(); const dow = t.getDay(); d.systemSettings = d.systemSettings || {}; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [] }; d.holidays = [];
    d.patients.filter(p => p.status === '利用中' && !p.endDate).forEach((p, i) => { p.scheduleAmPm = ['', '', '', '', '', '', '']; if (i < n) p.scheduleAmPm[dow] = 'AM'; p.pauseHistory = []; p.scheduleChangeHistory = []; });
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); localStorage.removeItem('tsumugiFsZoom');
    sessionStorage.setItem('tsumugiActiveRecorder', JSON.stringify({ id: 'demo_rec', name: '見本 職員', roleLabel: '介護職員' })); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'record', pid: null, ampm: 'AM', t: Date.now() })); }, n);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
  await page.getByTestId('rec-act-fullscreen').click(); await page.waitForTimeout(2200);
  const v = (await page.getByTestId('fs-zoom-val').innerText()).trim();
  // 表が枠に収まっているか(下の行が見えているか)
  const fits = await page.evaluate(() => { const t = document.getElementById('record-table'); const sc = t.closest('.record-view-scroll'); return sc ? sc.scrollHeight - sc.clientHeight <= 2 : null; });
  const rows = await page.evaluate(() => document.querySelectorAll('#record-table tbody tr[data-rv-pid]').length);
  await b.close(); return { v, fits, rows }; };
const cases = [
  ['パソコン', chromium, { width: 1920, height: 1080 }, {}],
  ['ノートパソコン', chromium, { width: 1366, height: 768 }, {}],
  ['iPad', webkit, { width: 1080, height: 810 }, { userAgent: UA, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }],
];
for (const n of [10, 15]) for (const [lab, eng, vp, opts] of cases) {
  const now = await open(PORT, eng, vp, opts, n, false);
  let line = `${lab} ${n}人(行${now.rows}) 直した後 ${now.v} 収まる=${now.fits}`;
  r[`${lab}${n}_fits`] = now.fits === true;
  if (BASE) { const old = await open(BASE, eng, vp, opts, n, false); line += ` / 直す前 ${old.v}`; r[`${lab}${n}_same`] = old.v === now.v; }
  if (lab === 'iPad') { const fk = await open(PORT, eng, vp, opts, n, true); line += ` / iPad のまね ${fk.v} 収まる=${fk.fits}`; r[`${lab}${n}_fake`] = fk.v === now.v && fk.fits === true;
    if (BASE) { const fo = await open(BASE, eng, vp, opts, n, true); line += ` (直す前のまね ${fo.v})`; } }
  console.log(line);
}
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
