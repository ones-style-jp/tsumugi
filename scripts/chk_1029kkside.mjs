// 2026-10-29(試験版 trial455) ユーザー「計画書関係もサイドバー方式にした方がいいかも」→「今すぐ作る」
//   ①iPad(1180)・PC(1440): 計画書の9つの画面で、左に縦の並び(kk-side)が出る・上の横のボタン(kk-tabs)は見えない・今の画面に印(aria-current)
//   ②左の並びを押すと、その画面へ移る(選んでいた利用者のまま)・3-1 は押した組(通所/機能訓練)の方に印
//   ③編集を開くと左の並びは消え(書類を広く使う)、閉じると戻る
//   ④利用者ごとで PDF を作る(見えない書類の画面)あいだも、左の並びの印は利用者ごとのまま
//   ⑤スマホ(393): 左の並びは出ず、今までどおり上の横のボタン
//   実行: node scripts/chk_1029kkside.mjs [--port 4175]
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4175'; })();
const b = await chromium.launch(); const r = {};
const VIEWS = ['keikaku_yotei', 'tsusho_keikaku', 'kinou_yotei', 'kinou_patient', 'kinou_keikaku', 'seikatsu_kinou', 'kyomi_kanshin', 'life_hub', 'life_submit'];
const open = async (vp) => { const ctx = await b.newContext({ viewport: vp, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', ...(vp.width < 768 ? { hasTouch: true, isMobile: true } : {}) }); const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => d.accept());
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  const pid = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.systemSettings = d.systemSettings || {};
    d.systemSettings.addons = { ...(d.systemSettings.addons || {}), tsusho_keikaku: true, kinou_keikaku: true, kasan_kagaku: true, kasan_adl: true };
    const p = (d.patients || []).find(x => x.status === '利用中' && String(x.careLevel || '').includes('要介護')) || (d.patients || [])[0]; if (p && !String(p.careLevel || '').includes('要介護')) p.careLevel = '要介護2';
    d.kyomiKanshinRecords = [...(d.kyomiKanshinRecords || []).filter(x => x.id !== 'chk_kk1'), { id: 'chk_kk1', patientId: p.id, recordDate: '令和8年10月1日', items: {} }]; // PDF を作る書類(見えない画面で開く)
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); return p.id; });
  return { ctx, page, pid }; };
const go = async (page, view, pid) => { await page.evaluate(([v, id]) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: id, t: Date.now() })), [view, pid]);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500); await page.locator('button', { hasText: /^あとで$/ }).click({ timeout: 300 }).catch(() => {}); };
const cur = (page) => page.locator('[data-testid="kk-side"] [aria-current="page"]').evaluateAll(els => els.map(e => e.getAttribute('data-testid')));
for (const [k, vp] of [['ipad', { width: 1180, height: 820 }], ['pc', { width: 1440, height: 900 }]]) {
  const { ctx, page, pid } = await open(vp);
  // ① 9つの画面すべてで左の並び・横のボタンなし・印が1つ
  const bad = [];
  for (const v of VIEWS) { await go(page, v, pid); const side = await page.getByTestId('kk-side').isVisible().catch(() => false); const tabs = await page.locator('[data-testid="kk-tabs"]:visible').count(); const c = await cur(page);
    if (!side || tabs !== 0 || c.length !== 1 || !c[0].endsWith(`-${v}`)) bad.push(`${v}:${side}/${tabs}/${c.join(',')}`); }
  console.log(k, '9画面', bad.length ? bad : 'OK'); r[`${k}_allViews`] = bad.length === 0;
  // ② 押して移る・利用者はそのまま・3-1 は押した組に印
  await go(page, 'tsusho_keikaku', pid); const nm0 = (await page.getByTestId('kk-patient').innerText()).trim();
  await page.getByTestId('kk-side-tsusho-kyomi_kanshin').click(); await page.waitForTimeout(1000);
  const c1 = await cur(page); const nm1 = (await page.getByTestId('kk-patient').innerText()).trim();
  await page.getByTestId('kk-side-kinou-kyomi_kanshin').click(); await page.waitForTimeout(1000); const c2 = await cur(page);
  await page.getByTestId('kk-side-kinou-kinou_patient').click(); await page.waitForTimeout(1000); const c3 = await cur(page); const nm3 = (await page.getByTestId('kk-patient').innerText()).trim();
  console.log(k, '押す', c1, c2, c3, nm0 === nm1 && nm1 === nm3);
  r[`${k}_nav`] = c1[0] === 'kk-side-tsusho-kyomi_kanshin' && c2[0] === 'kk-side-kinou-kyomi_kanshin' && c3[0] === 'kk-side-kinou-kinou_patient' && nm0 === nm1 && nm1 === nm3 && !!nm0;
  // ④ 利用者ごとの PDF(見えない書類の画面)のあいだも印はそのまま・並びは1つ
  const dlBtn = page.locator('[data-testid="kk-patient-view"] button', { hasText: /ダウンロード/ }).first();
  if (await dlBtn.count()) { await dlBtn.click().catch(() => {}); const seen = []; for (let i = 0; i < 12; i++) { await page.waitForTimeout(150); seen.push((await cur(page)).join(',') + '/' + (await page.getByTestId('kk-side').count())); }
    console.log(k, 'PDFのあいだ', [...new Set(seen)]); r[`${k}_dlKeeps`] = seen.every(x => x === 'kk-side-kinou-kinou_patient/1');
    await page.keyboard.press('Escape').catch(() => {}); await page.locator('button', { hasText: /^閉じる$/ }).first().click({ timeout: 800 }).catch(() => {}); }
  else { console.log(k, 'PDFのボタンがない'); r[`${k}_dlKeeps`] = false; }
  // ③ 編集を開くと左の並びは消え、閉じると戻る
  await go(page, 'tsusho_keikaku', pid);
  const nb = page.locator('button', { hasText: '＋ 新規作成' }).first();
  if (await nb.count()) { await nb.click(); await page.waitForTimeout(800); const inEdit = await page.getByTestId('kk-side').count(); const ew = await page.getByTestId('kk-frame').evaluate(e => e.lastElementChild.getBoundingClientRect().width);
    await page.getByTestId('kk-close').click(); await page.waitForTimeout(800); const after = await page.getByTestId('kk-side').isVisible();
    console.log(k, '編集中', inEdit, '幅', Math.round(ew), '閉じたあと', after); r[`${k}_editHides`] = inEdit === 0 && after; }
  else { r[`${k}_editHides`] = false; console.log(k, '新規作成ボタンがない'); }
  // 中身が左の並びの右に収まる(横にはみ出さない)
  const ov = await page.evaluate(() => { const sc = document.getElementById('tsuContentScroller'); return sc ? sc.scrollWidth - sc.clientWidth : -1; }); console.log(k, '横のはみ出し', ov); r[`${k}_noHScroll`] = ov <= 1;
  await ctx.close();
}
{ const { ctx, page, pid } = await open({ width: 393, height: 820 });
  await go(page, 'tsusho_keikaku', pid); const side = await page.getByTestId('kk-side').isVisible().catch(() => false); const tabs = await page.locator('[data-testid="kk-tabs"]:visible').count();
  await go(page, 'kinou_patient', pid); const tabs2 = await page.locator('[data-testid="kk-tabs"]:visible').count(); const side2 = await page.getByTestId('kk-side').isVisible().catch(() => false);
  console.log('スマホ 左の並び', side, side2, '横のボタン', tabs, tabs2); r.phone = !side && !side2 && tabs === 1 && tabs2 === 1;
  await ctx.close(); }
await b.close();
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
