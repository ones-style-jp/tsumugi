// 2026-10-28(試験版) 提供記録の見出しと全画面
//   ①上の見出し: スマホ=日付だけ(「サービス提供記録 入力」を出さない)・iPad/PC=今までどおり
//   ②全画面の左上=「10月28日」だけ・戻るボタン=「通常画面」
//   ③表示中が10人以下: 「全画面」で見せ方を聞かずにそのまま全画面・中の切り替えも出さない
//   ④11人以上も見せ方を聞かない・帯に倍率(－ ○% ＋)(2026-10-28 trial447〜)
//   ⑤スマホ: 見せ方を聞かない・倍率は出さない
//   実行: node scripts/chk_1028recfs.mjs [--port 4175]
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4175'; })();
const b = await chromium.launch(); const r = {};
const now = new Date(); const MD = `${now.getMonth() + 1}月${now.getDate()}日`; const FULL = `${now.getFullYear()}年${MD}`;
const open = async (vp, n) => { const ctx = await b.newContext({ viewport: vp, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', ...(vp.width < 768 ? { hasTouch: true, isMobile: true } : {}) }); const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => d.accept());
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  const got = await page.evaluate((n) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const dow = new Date().getDay();
    d.systemSettings = d.systemSettings || {}; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [] }; d.holidays = [];
    const act = d.patients.filter(p => p.status === '利用中' && !p.endDate); act.forEach((p, i) => { p.scheduleAmPm = ['', '', '', '', '', '', '']; if (i < n) p.scheduleAmPm[dow] = 'AM'; p.pauseHistory = []; p.scheduleChangeHistory = []; });
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); localStorage.removeItem('tsumugiFullscreenMode');
    sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'record', pid: null, ampm: 'AM', t: Date.now() })); return Math.min(n, act.length); }, n);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
  return { ctx, page, got }; };
// ① iPad 横・8人
{ const { ctx, page, got } = await open({ width: 1180, height: 820 }, 8); console.log('ipad n', got);
  const h = (await page.getByTestId('hdr-record-title').innerText()).trim(); console.log('ipad header', JSON.stringify(h)); r.hdrWide = h.includes('サービス提供記録') && h.includes(FULL);
  await page.getByTestId('rec-act-fullscreen').click(); await page.waitForTimeout(800);
  r.fewNoPick = (await page.getByTestId('fs-pick').count()) === 0 && (await page.getByTestId('rec-fs-bar').count()) === 1;
  const t = (await page.getByTestId('rec-fs-title').innerText()).trim(); console.log('fs title', JSON.stringify(t)); r.fsTitle = t === MD;
  r.fsClose = (await page.getByTestId('rec-fs-close').innerText()).trim() === '通常画面'; r.fewNoSwitch = (await page.getByTestId('fs-mode-switch').count()) === 0;
  await ctx.close(); }
// ④ iPad 横・14人(2026-10-28 trial447〜: 見せ方は聞かない・帯に倍率(－ ○% ＋))
{ const { ctx, page, got } = await open({ width: 1180, height: 820 }, 14); console.log('ipad n', got);
  await page.getByTestId('rec-act-fullscreen').click(); await page.waitForTimeout(800);
  r.manyNoPick = (await page.getByTestId('fs-pick').count()) === 0 && (await page.getByTestId('rec-fs-bar').count()) === 1;
  r.zoomCtl = await page.getByTestId('fs-zoom').isVisible().catch(() => false); r.noSwitch = (await page.getByTestId('fs-mode-switch').count()) === 0;
  await ctx.close(); }
// ①⑤ スマホ・14人
{ const { ctx, page } = await open({ width: 393, height: 820 }, 14);
  const h = (await page.getByTestId('hdr-record-title').innerText()).trim(); console.log('phone header', JSON.stringify(h)); r.hdrPhone = h === FULL;
  const fsBtn = page.getByTestId('rec-act-fullscreen');
  await page.getByTestId('fold-btn-record').click().catch(() => {}); await page.waitForTimeout(500); // スマホは「操作」の中
  await fsBtn.click(); await page.waitForTimeout(800);
  r.phoneNoPick = (await page.getByTestId('fs-pick').count()) === 0 && (await page.getByTestId('rec-fs-bar').count()) === 1; r.phoneNoZoom = !(await page.getByTestId('fs-zoom').isVisible().catch(() => false));
  await ctx.close(); }
await b.close();
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
