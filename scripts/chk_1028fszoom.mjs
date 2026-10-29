// 2026-10-28 提供記録の全画面(ユーザー「1画面にするとぐらつく」「下に1人分空いている」「戻るときホワイトアウトして間がある」「保存・連絡帳のアイコンを外す」
//   「全画面は10人も15人も全員を1画面に。＋－で倍率を調整」)
//   iPad 横(1180×820)で 10人・15人:
//   ①「全画面」で見せ方を聞かずにすぐ全画面 ②最初のコマから倍率が決まっている(あとで大きさが変わらない) ③最後の方の下が画面の下まで(空きが行の半分より小さい)
//   ④－/＋ で5%ずつ変わり、この端末に覚える(開き直しても同じ)・＋は200%まで(10/29)・「全員」で全員が入る倍率に戻る ⑤保存・連絡帳にアイコンがない ⑥「通常画面」で 150ms 以内に戻る
//   --stable: 安定版(見せ方の選択あり)では「1画面表示(全員を1画面に)」を選んで ②③⑥(戻る時間は見ない)だけ
//   実行: node scripts/chk_1028fszoom.mjs [--port 4175] [--stable]
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4175'; })(); const ST = process.argv.includes('--stable');
const b = await chromium.launch(); const r = {};
for (const n of [10, 15]) {
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', hasTouch: true, isMobile: true, deviceScaleFactor: 2 }); const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  await page.evaluate((n) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const dow = new Date().getDay(); d.systemSettings = d.systemSettings || {}; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [] }; d.holidays = [];
    d.patients.forEach((p, i) => { p.scheduleAmPm = ['', '', '', '', '', '', '']; p.scheduleChangeHistory = []; }); d.patients.filter(p => p.status === '利用中' && !p.endDate).slice(0, n).forEach(p => { p.scheduleAmPm[dow] = 'AM'; p.pauseHistory = []; });
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); localStorage.removeItem('tsumugiFsZoom'); localStorage.setItem('tsumugiFullscreenMode', 'fit');
    sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'record', pid: null, ampm: 'AM', t: Date.now() })); }, n);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
  const rows = await page.locator('#record-table tbody tr').count();
  await page.evaluate(() => { window.__z = []; const t0 = performance.now(); const tick = () => { const bar = document.querySelector('[data-testid="rec-fs-bar"]'); const t = document.getElementById('record-table'); if (bar && t) { const z = getComputedStyle(t).zoom; const L = window.__z; if (!L.length || L[L.length - 1].z !== z) L.push({ t: Math.round(performance.now() - t0), z }); } if (performance.now() - t0 < 4000) requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
  await page.getByTestId('rec-act-fullscreen').click(); await page.waitForTimeout(400);
  const picked = (await page.getByTestId('fs-pick').count()) > 0; if (ST) { if (picked) await page.getByTestId('fs-pick-fit').click(); } else r[`n${n}_noPick`] = !picked;
  await page.waitForTimeout(3800);
  const z = await page.evaluate(() => window.__z); console.log(n, '人 行', rows, '倍率の移り変わり', JSON.stringify(z));
  r[`n${n}_noJump`] = z.length === 1;
  const gap = await page.evaluate(() => { const t = document.getElementById('record-table'); const trs = [...t.querySelectorAll('tbody tr')]; const last = trs[trs.length - 1].getBoundingClientRect(); const sc = t.closest('.record-view-scroll'); const sr = sc.getBoundingClientRect(); return { gap: Math.round(sr.top + sc.clientTop + sc.clientHeight - last.bottom), rowH: Math.round(last.height), scroll: sc.scrollHeight - sc.clientHeight }; });
  console.log('  下の空き', JSON.stringify(gap)); r[`n${n}_noGap`] = gap.gap >= 0 && gap.gap < gap.rowH / 2 && gap.scroll <= 2;
  if (!ST) {
    const val = async () => (await page.getByTestId('fs-zoom-val').innerText()).trim();
    const v0 = await val(); await page.getByTestId('fs-zoom-plus').click(); await page.waitForTimeout(300); const v1 = await val();
    await page.getByTestId('fs-zoom-plus').click(); await page.waitForTimeout(300); const v2 = await val(); await page.getByTestId('fs-zoom-minus').click(); await page.waitForTimeout(300); const v3 = await val();
    console.log('  倍率', v0, '→＋', v1, '→＋', v2, '→－', v3); const p = (x) => parseInt(x, 10);
    r[`n${n}_zoomBtns`] = p(v1) - p(v0) >= 1 && p(v1) - p(v0) <= 7 && p(v1) % 5 === 0 && p(v2) - p(v1) === 5 && p(v3) === p(v1) && (await page.getByTestId('fs-zoom-fit').count()) === 1; // ＋/－は5%のきりのいい数へ
    r[`n${n}_remember`] = await page.evaluate(() => !!localStorage.getItem('tsumugiFsZoom'));
    // ★ 2026-10-29: ＋は200%まで(押し続けて200%で止まる)
    for (let k = 0; k < 40 && !(await page.getByTestId('fs-zoom-plus').isDisabled()); k++) { await page.getByTestId('fs-zoom-plus').click(); await page.waitForTimeout(80); }
    const vmax = await val(); console.log('  いちばん大きく', vmax); r[`n${n}_max200`] = vmax === '200%' && await page.getByTestId('fs-zoom-plus').isDisabled();
    await page.getByTestId('fs-zoom-fit').click(); await page.waitForTimeout(500); const vb = await val(); console.log('  全員に戻す', vb); r[`n${n}_fitBack`] = Math.abs(p(vb) - p(v0)) <= 1 && (await page.getByTestId('fs-zoom-fit').count()) === 0 && (await page.evaluate(() => { const sc = document.querySelector('.record-view-scroll'); return sc.scrollHeight - sc.clientHeight <= 2; }));
    const icons = await page.evaluate(() => { const bar = document.querySelector('[data-testid="rec-fs-bar"]'); return [...bar.querySelectorAll('button')].filter(x => /^(連絡帳|保存)$/.test((x.textContent || '').trim())).map(x => x.querySelectorAll('svg').length); });
    r[`n${n}_noIcons`] = icons.length === 2 && icons.every(c => c === 0);
    const t0 = Date.now(); await page.getByTestId('rec-fs-close').click(); await page.waitForFunction(() => !document.querySelector('[data-testid="rec-fs-bar"]') && !!document.querySelector('[data-testid="rec-toolbar"]'), null, { timeout: 5000 }).catch(() => {}); const ms = Date.now() - t0;
    console.log('  通常画面に戻る', ms, 'ms'); r[`n${n}_fastClose`] = ms < 300; // 前は薄くする0.32秒＋描き直し
  }
  await ctx.close();
}
await b.close();
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
