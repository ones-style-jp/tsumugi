// 2026-10-29 ユーザー「27インチだと200%まで、タブレットだと180%とか」「iPad で倍率を上げると名前・血圧の文字が小さいまま」
//   ①大きい画面(1920×1080)は＋を押し続けると200%で止まる ②ノートパソコン(1366×768)は180%で止まる
//   ③前に覚えた200%は、小さい画面では180%で出る ④iPad(WebKit・iPad の名乗り)では表に text-size-adjust: none(文字も一緒に拡大する対策)・パソコンでは付かない
//   実行: node scripts/chk_1029fszoommax.mjs [--port 4175]
import { chromium, webkit } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4175'; })();
const r = {};
const open = async (eng, vp, opts = {}, preZoom = null) => {
  const b = await eng.launch(); const ctx = await b.newContext({ viewport: vp, screen: vp, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', ...opts }); const page = await ctx.newPage(); page.on('dialog', d => d.accept());
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  await page.evaluate((z) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const t = new Date(); const dow = t.getDay(); d.systemSettings = d.systemSettings || {}; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [] }; d.holidays = [];
    d.patients.filter(p => p.status === '利用中' && !p.endDate).forEach((p, i) => { p.scheduleAmPm = ['', '', '', '', '', '', '']; if (i < 10) p.scheduleAmPm[dow] = 'AM'; p.pauseHistory = []; p.scheduleChangeHistory = []; });
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); if (z) localStorage.setItem('tsumugiFsZoom', z); else localStorage.removeItem('tsumugiFsZoom');
    sessionStorage.setItem('tsumugiActiveRecorder', JSON.stringify({ id: 'demo_rec', name: '見本 職員', roleLabel: '介護職員' })); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'record', pid: null, ampm: 'AM', t: Date.now() })); }, preZoom);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
  await page.getByTestId('rec-act-fullscreen').click(); await page.waitForTimeout(1200); return { b, page }; };
const pushMax = async (page) => { for (let k = 0; k < 40 && !(await page.getByTestId('fs-zoom-plus').isDisabled()); k++) { await page.getByTestId('fs-zoom-plus').click(); await page.waitForTimeout(60); } return (await page.getByTestId('fs-zoom-val').innerText()).trim(); };
{ const { b, page } = await open(chromium, { width: 1920, height: 1080 }); const v = await pushMax(page); console.log('1920×1080', v); r.big200 = v === '200%';
  r.pcNoAdjust = await page.evaluate(() => { const t = document.getElementById('record-table'); const cs = getComputedStyle(t); return (cs.webkitTextSizeAdjust || cs.textSizeAdjust || '') !== 'none'; }); await b.close(); }
{ const { b, page } = await open(chromium, { width: 1366, height: 768 }); const v = await pushMax(page); console.log('1366×768', v); r.laptop180 = v === '180%'; await b.close(); }
{ const { b, page } = await open(chromium, { width: 1366, height: 768 }, {}, '2'); const v = (await page.getByTestId('fs-zoom-val').innerText()).trim(); console.log('覚えた200%を小さい画面で', v); r.rememberedClamped = v === '180%'; await b.close(); }
{ const UA = 'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
  const { b, page } = await open(webkit, { width: 1080, height: 810 }, { userAgent: UA, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const adj = await page.evaluate(() => { const t = document.getElementById('record-table'); const cs = getComputedStyle(t); const rule = [...document.styleSheets].some(ss => { try { return [...ss.cssRules].some(r => /html\.tsu-ios #record-table/.test(r.selectorText || '')); } catch { return false; } });
    return { ios: document.documentElement.classList.contains('tsu-ios'), adj: cs.webkitTextSizeAdjust || cs.getPropertyValue('-webkit-text-size-adjust'), rule }; });
  const v = await pushMax(page); console.log('iPad', JSON.stringify(adj), v); 
  // パソコンの WebKit は iPad だけの設定(text-size-adjust)を読み捨てるので、決まり(html.tsu-ios #record-table)があるかで見る(中身はビルドの CSS で確かめた)
  r.ipadAdjustNone = adj.ios && (adj.adj === 'none' || adj.rule); r.ipad180 = v === '180%'; await b.close(); }
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
