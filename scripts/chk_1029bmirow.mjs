// 2026-10-29 ユーザー報告(スマホの画面): 「スマホ版の体力測定で、右側の BMI の判定が見切れる・左の BMI の下の説明文が2行・3行になる」
//   ①スマホ(390×844): BMI の行の中身が画面の右からはみ出さない・判定の札は1行(短い名前)・左の「自動計算」は1行
//   ②表の6つの欄の左端が見出しの行・ほかの行とそろっている・身長などの行の値が隣の欄に重ならない・見出しの(日付)は1行・ページが横にはみ出さない ③パソコン(1366): 判定の札は今までの名前(普通体重 など)
//   実行: node scripts/chk_1029bmirow.mjs [--port 4175] [--shot <png>]
import { webkit, chromium } from 'playwright';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const PORT = arg('--port', '4175'), SHOT = arg('--shot', '');
const IPH = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
const r = {};
const open = async (eng, vp, opts) => {
  const b = await eng.launch(); const ctx = await b.newContext({ viewport: vp, screen: vp, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', ...opts }); const page = await ctx.newPage(); page.on('dialog', d => d.accept());
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  // 体力測定の記録があり、身長・体重の入っている見本の方(年齢65歳以上だと「目標より低め」の長い名前が出やすい)
  const pid = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const recs = d.fitnessRecords || [];
    const has = (p) => recs.some(x => x.patientId === p.id && x.values && x.values.height && x.values.weight);
    const P = d.patients.find(p => p.status === '利用中' && has(p)) || d.patients.find(p => p.status === '利用中');
    // 長い名前が出るよう、65歳以上で BMI 20 前後の記録を1件足す
    P.birthDate = P.birthDate || '1935-04-01'; recs.push({ id: 'fit_chk_1029', patientId: P.id, date: '2026-10-01', values: { height: '139', weight: '37' } }); d.fitnessRecords = recs;
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0');
    sessionStorage.setItem('tsumugiActiveRecorder', JSON.stringify({ id: 'demo_rec', name: '見本 職員', roleLabel: '介護職員' })); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'fitness', pid: P.id, t: Date.now() })); return P.id; });
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 500 }).catch(() => {});
  return { b, page }; };
const measure = (page) => page.evaluate(() => { const row = document.querySelector('[data-testid="bmi-row"]'); if (!row) return null; const vw = document.documentElement.clientWidth;
  const rr = row.getBoundingClientRect(); let maxRight = 0; row.querySelectorAll('*').forEach(el => { const x = el.getBoundingClientRect(); if (x.width) maxRight = Math.max(maxRight, x.right); });
  const badges = [...row.querySelectorAll('[data-testid="bmi-badge"] > span:last-child')].filter(x => x.getClientRects().length); const lh = (el) => { const cs = getComputedStyle(el); return parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3; };
  const badgeLines = badges.map(x => Math.round(x.getBoundingClientRect().height / lh(x))); const badgeText = badges.map(x => x.innerText.trim());
  const lab = row.firstElementChild.querySelector('span'); const labLines = lab ? Math.round(lab.getBoundingClientRect().height / lh(lab)) : null;
  const head = row.parentElement.querySelector('.grid.bg-slate-50'); const hl = head ? [...head.children].map(c => Math.round(c.getBoundingClientRect().left)) : []; const bl = [...row.children].map(c => Math.round(c.getBoundingClientRect().left));
  return { vw, rowRight: Math.round(rr.right), maxRight: Math.round(maxRight), badgeLines, badgeText, labLines, labText: lab ? lab.innerText : '', hl, bl }; });
{ const { b, page } = await open(webkit, { width: 390, height: 844 }, { userAgent: IPH, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await page.keyboard.press('Escape').catch(() => {}); const bk = page.locator('div.fixed.inset-0').first(); if (await bk.isVisible().catch(() => false)) await bk.click({ position: { x: 370, y: 400 } }).catch(() => {}); await page.waitForTimeout(400);
  await page.locator('[data-testid="bmi-row"]').scrollIntoViewIfNeeded().catch(() => {}); await page.waitForTimeout(400);
  const ov = await page.evaluate(() => { const bad = []; document.querySelectorAll('[data-testid^="fit-row-"]').forEach(row => { const cs = [...row.children].filter(c => c.getClientRects().length && getComputedStyle(c).display !== 'contents'); cs.forEach((c, i) => { const n = cs[i + 1]; if (!n) return; let mr = 0; c.querySelectorAll('*').forEach(el => { const x = el.getBoundingClientRect(); if (x.width) mr = Math.max(mr, x.right); }); if (mr > n.getBoundingClientRect().left + 1) bad.push(row.dataset.testid + '#' + i); }); }); return bad; });
  console.log('隣の欄に重なる値', JSON.stringify(ov)); r.phoneNoOverlap = ov.length === 0;
  // 行ごとに欄の左端がそろっている(入力の枠の位置がずれない)・見出しの(日付)は1行・ページが横にはみ出さない
  const al = await page.evaluate(() => { const rows = [...document.querySelectorAll('[data-testid^="fit-row-"], [data-testid="bmi-row"]')].filter(x => !/fit-row-.*-(note|btn)/.test(x.dataset.testid || ''));
    const lefts = rows.map(row => [...row.children].filter(c => c.getClientRects().length && getComputedStyle(c).display !== 'contents').slice(0, 4).map(c => Math.round(c.getBoundingClientRect().left)).join(','));
    const head = document.querySelector('[data-testid="bmi-row"]').parentElement.querySelector('.grid.bg-slate-50'); const hd = head ? [...head.children].slice(4).map(c => { const sp = c.querySelector('span'); return sp ? Math.round(sp.getBoundingClientRect().height) : 0; }) : [];
    return { kinds: [...new Set(lefts)], hd, docW: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth }; });
  console.log('行の欄の左端', JSON.stringify(al)); r.phoneRowsAligned = al.kinds.length === 1; r.phoneHeadDate1 = al.hd.length === 2 && al.hd.every(h => h > 0 && h < 18); r.phoneNoPageScroll = al.docW <= al.vw + 1;
  const m = await measure(page); console.log('スマホ', JSON.stringify(m));
  if (SHOT) { const bx = await page.locator('[data-testid="bmi-row"]').boundingBox(); await page.screenshot({ path: SHOT, clip: { x: 0, y: Math.max(0, bx.y - 260), width: 390, height: 520 } }); }
  r.phoneRow = !!m; r.phoneNoOverflow = m && m.maxRight <= m.vw + 1; r.phoneBadge1 = m && m.badgeLines.length >= 2 && m.badgeLines.every(n => n <= 1); r.phoneShort = m && m.badgeText.every(t => t.length <= 3);
  r.phoneLab1 = m && m.labLines === 1; r.phoneAligned = m && m.hl.length === 6 && m.hl.every((x, i) => Math.abs(x - m.bl[i]) <= 3); // 行ごとに幅が決まるので数pxのずれは許す
  await b.close(); }
{ const { b, page } = await open(chromium, { width: 1366, height: 900 }, {});
  const m = await measure(page); console.log('パソコン', JSON.stringify(m)); r.pcLong = m && m.badgeText.some(t => /体重|肥満/.test(t)); r.pcAligned = m && m.hl.every((x, i) => Math.abs(x - m.bl[i]) <= 3); await b.close(); }
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
