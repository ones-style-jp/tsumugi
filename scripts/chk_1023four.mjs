// 2026-10-23 試験版 trial386: ①一言の欄が切れない ②全画面の見せ方(大きく/全員を1画面に) ③気分の通所時/帰宅時 ④運動トレンドの「まとめ」
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4173'; })();
const b = await chromium.launch(); const r = {};
async function open(view, prep) {
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, locale: 'ja-JP' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  const pid = await page.evaluate(([view, prep]) => { localStorage.setItem('tsumugiSidebarOpen', '0'); const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.systemSettings = d.systemSettings || {}; (new Function('d', 'localStorage', prep))(d, localStorage); localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); const p = (d.patients || []).find(x => x.status === '利用中'); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view, pid: view === 'dash_personal' ? p.id : null, date: (() => { const d = new Date(); if (d.getDay() === 0) d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })(), t: Date.now() })); return p.id; }, [view, prep || '']);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2200); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 600 }).catch(() => {}); return { page, pid }; }
// ① 一言
{ const { page } = await open('record', "d.systemSettings.tokkiPresets = d.systemSettings.tokkiPresets || ['体調不良'];");
  const sel = page.locator('[data-testid^="rv-tokki-pick-"]').first(); const m = await sel.evaluate(e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { w: Math.round(r.width), pr: cs.paddingRight, overflow: e.scrollWidth > e.clientWidth + 1 }; }); console.log('tokki', JSON.stringify(m));
  r.tokkiWide = m.w >= 50 && !m.overflow; await page.context().close(); }
// ② 全画面: fit=全員が入る(行の高さ×人数 ≦ 画面)・zoom=1.2倍
{ const dow = (() => { const d = new Date(); if (d.getDay() === 0) d.setDate(d.getDate() + 1); return d.getDay(); })(); const { page } = await open('record', `localStorage.setItem('tsumugiFullscreenMode','fit'); const ps = (d.patients || []).filter(p => p.status === '利用中'); ps.forEach((p, i) => { p.scheduleAmPm = p.scheduleAmPm || ['','','','','','','']; p.scheduleAmPm[${dow}] = i < 11 ? '1日' : ''; /* 午後に回しても出るように 1日 */ p.scheduleChangeHistory = []; });`);
  await page.getByTestId('rec-act-fullscreen').click(); await page.waitForTimeout(400); r.pickShown = await page.getByTestId('fs-pick').count() === 1; await page.getByTestId('fs-pick-fit').click(); await page.waitForTimeout(2200);
  const m = await page.evaluate(() => { const t = document.getElementById('record-table'); const rows = [...t.querySelectorAll('tbody tr[data-rv-pid]')]; const z = parseFloat(getComputedStyle(t).zoom || '1') || 1; return { n: rows.length, zoom: z, total: Math.round(t.getBoundingClientRect().height), vh: innerHeight }; });
  await page.getByTestId('fs-mode-switch').click(); await page.waitForTimeout(600); r.switchInFs = (await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('record-table')).zoom || '1'))) === 1.2;
  console.log('fs fit 11', JSON.stringify(m)); r.fit11 = m.n > 0 && m.zoom > 0.5 && m.total <= m.vh - 40 && m.total >= (m.vh - 40) * 0.8; /* 表の高さが画面(上の帯の下から)の8割以上・はみ出さない */ await page.screenshot({ path: '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad/fit11.jpg', type: 'jpeg', quality: 50 }); await page.context().close(); }
for (const mode of ['zoom', 'fit']) { const { page } = await open('record', `localStorage.setItem('tsumugiFullscreenMode','${mode}');`);
  await page.getByTestId('rec-act-fullscreen').click(); await page.waitForTimeout(400); await page.getByTestId(`fs-pick-${mode}`).click(); await page.waitForTimeout(2200);
  const m = await page.evaluate(() => { const t = document.getElementById('record-table'); const rows = [...t.querySelectorAll('tbody tr[data-rv-pid]')]; const z = parseFloat(getComputedStyle(t).zoom || '1') || 1; const hs = rows.map(x => x.getBoundingClientRect().height); return { n: rows.length, zoom: z, rowH: Math.round(hs[0] || 0), total: Math.round(hs.reduce((a, b) => a + b, 0)), vh: innerHeight }; });
  console.log('fs', mode, JSON.stringify(m)); if (mode === 'fit') { r.fitAll = m.n > 0 && m.total <= m.vh - 40 && m.total >= (m.vh - 40) * 0.6 && m.zoom <= 1.2; } else r.zoomBig = m.zoom === 1.2;
  await page.context().close(); }
{ const { page } = await open('settings'); await page.evaluate(() => { const bs = [...document.querySelectorAll('button')].filter(x => x.textContent.trim() === 'システム' && [...x.parentElement.querySelectorAll('button')].some(y => y.textContent.trim() === '体力測定')); if (bs[0]) bs[0].click(); }); await page.waitForTimeout(800); r.fsSettingRemoved = await page.getByTestId('fs-mode-setting').count() === 0; await page.context().close(); }
// ③ 気分
for (const [k, exp] of [['arrival', 1], ['departure', 1], ['both', 2]]) { const { page } = await open('record', `d.systemSettings.kibunTimings='${k}'; delete d.systemSettings.kibunDisabled;`);
  const n = await page.locator('#record-table tbody tr[data-rv-pid]').first().locator('button', { hasText: /^(通所|帰宅)/ }).count(); const th = await page.locator('#record-table thead th', { hasText: /^体調/ }).innerText();
  console.log('kibun', k, n, JSON.stringify(th)); r[`kibun_${k}`] = n === exp && (k === 'both' ? /通所\/帰宅/.test(th) : (k === 'arrival' ? /通所/.test(th) && !/帰宅/.test(th) : /帰宅/.test(th) && !/通所/.test(th)));
  await page.context().close(); }
{ const { page } = await open('settings', "delete d.systemSettings.kibunDisabled;"); await page.evaluate(() => { const bs = [...document.querySelectorAll('button')].filter(x => x.textContent.trim() === 'サービス提供内容' && [...x.parentElement.querySelectorAll('button')].some(y => y.textContent.trim() === '体力測定')); if (bs[0]) bs[0].click(); }); await page.waitForTimeout(800); r.kibunSetting = await page.getByTestId('kibun-timings').count() === 1; await page.context().close(); }
// ④ 運動トレンドのまとめ
{ const { page } = await open('dash_personal', `const p = (d.patients || []).find(x => x.status === '利用中'); const dn = ['日','月','火','水','木','金','土']; const now = new Date(); d.ticketRecords = (d.ticketRecords || []).filter(t => t.patientId !== p.id);
    for (let k = 0; k < 2; k++) { const y = now.getFullYear(), m = now.getMonth() + 1 - k; const mm = m <= 0 ? m + 12 : m; const yy = m <= 0 ? y - 1 : y; for (const day of [2, 5, 9, 12]) { const dt = new Date(yy, mm - 1, day); if (dt > now) continue; d.ticketRecords.push({ id: 'tst_ex_' + mm + '_' + day, patientId: p.id, name: p.name, date: mm + '月' + day + '日', year: yy, dayOfWeek: dn[dt.getDay()], status: '出席', exercises: { u1: (10 + k) + '分', u2: '3kg', heikobo: '○', fumidai: '×' }, _savedAt: dt.getTime() }); } }`);
  await page.locator('.tsu-period-sel, select[aria-label="期間"]').first().selectOption('3').catch(() => {}); await page.waitForTimeout(600);
  await page.getByTestId('ex-summary-btn').scrollIntoViewIfNeeded(); await page.getByTestId('ex-summary-btn').click(); await page.waitForTimeout(600);
  const m = await page.evaluate(() => { const t = document.querySelector('[data-testid="ex-summary"] table'); if (!t) return null; return { rows: t.querySelectorAll('tbody tr').length, cols: t.querySelectorAll('thead th').length, filled: [...t.querySelectorAll('tbody td div')].filter(d => /\d/.test(d.textContent)).length }; }); console.log('summary', JSON.stringify(m));
  r.summaryShown = !!m && m.rows >= 3 && m.cols >= 2; /* trial390: 3ヶ月は日ごと(月の列なし) */
  // ★ trial390: まとめの月ごと/日ごとは上の「月平均/毎日」に従う(まとめ内の切替はない)。3ヶ月=日ごと・半年=月ごと・毎日を押すと日ごと。折れ線の点に合わせると値
  r.noInnerToggle = await page.getByTestId('ex-sum-day').count() === 0 && await page.getByTestId('ex-sum-month').count() === 0;
  r.summaryDayLine = (await page.getByTestId('ex-summary').getAttribute('data-sum-mode')) === 'day' && await page.locator('[data-testid="ex-summary"] svg path').count() > 0;
  await page.locator('[data-testid="ex-sum-dot"]').first().hover(); await page.waitForTimeout(300); const tip = await page.getByTestId('ex-sum-tip').innerText().catch(() => ''); console.log('tip', JSON.stringify(tip)); r.dotTip = /\d/.test(tip);
  await page.locator('.tsu-period-tabs button', { hasText: '半年' }).first().click().catch(() => {}); await page.waitForTimeout(800);
  r.summaryMonthLine = (await page.getByTestId('ex-summary').getAttribute('data-sum-mode')) === 'month' && (await page.evaluate(() => [...document.querySelectorAll('[data-testid="ex-summary"] tbody td div')].filter(d => /\d/.test(d.textContent)).length)) > 0 && await page.locator('[data-testid="ex-summary"] svg path').count() > 0;
  await page.screenshot({ path: '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad/exsummary_month.jpg', type: 'jpeg', quality: 55 });
  await page.locator('.tsu-o-dm button', { hasText: '毎日' }).first().click(); await page.waitForTimeout(500); r.followsDaily = (await page.getByTestId('ex-summary').getAttribute('data-sum-mode')) === 'day';
  await page.locator('.tsu-o-dm button', { hasText: '月平均' }).first().click(); await page.waitForTimeout(400);
  await page.locator('[data-testid="ex-summary"] tbody button').first().click(); await page.waitForTimeout(500); r.summaryJump = await page.getByTestId('ex-summary').count() === 0;
  await page.screenshot({ path: '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad/exsummary.jpg', type: 'jpeg', quality: 55 }); await page.context().close(); }
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
