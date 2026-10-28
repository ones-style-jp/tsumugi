// 2026-10-28 夜(試験版 trial449) 各種設定の作り直し・家族関係者閲覧 管理の投稿欄
//   iPad(1180)・PC(1440): ①左に縦の項目(保存はその上)・上の横の項目は出ない ②縦の項目を押すと中身が変わる ③「この中の項目」が検索欄より上・下にスクロールしても上に固定
//   ④「この中の項目」を押すとその見出しが固定の帯のすぐ下に来る ⑤検索で選ぶとその見出しへ ⑥中身の幅は 4xl(896px)まで・入力欄の上下が詰まっている
//   スマホ: ⑦上に横の項目(今までどおり)・縦の項目は出ない
//   家族関係者閲覧 管理: ⑧送付先のボタンに ☑/☐ がない ⑨「イベント/クラス」の欄がない(タイトル・表示日・本文)
//   実行: node scripts/chk_1028settings2.mjs [--port 4175]
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4175'; })();
const b = await chromium.launch(); const r = {};
const open = async (vp, view) => { const ctx = await b.newContext({ viewport: vp, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', ...(vp.width < 768 ? { hasTouch: true, isMobile: true } : {}) }); const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => d.accept());
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  await page.evaluate((v) => { localStorage.setItem('tsumugiSidebarOpen', '0'); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: null, t: Date.now() })); }, view);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
  return { ctx, page }; };
for (const [k, vp] of [['ipad', { width: 1180, height: 820 }], ['pc', { width: 1440, height: 900 }]]) {
  const { ctx, page } = await open(vp, 'settings');
  const nv = await page.locator('[data-testid^="settings-vtab-"]:visible').count(); const hz = await page.getByTestId('settings-tabs').isVisible().catch(() => false);
  r[`${k}_vtabs`] = nv >= 8 && !hz && await page.getByTestId('settings-save').isVisible();
  await page.getByTestId('settings-vtab-diary').click(); await page.waitForTimeout(700);
  r[`${k}_switch`] = /送迎車両|日誌/.test(await page.getByTestId('settings-content').innerText());
  await page.getByTestId('settings-vtab-facility').click(); await page.waitForTimeout(700);
  const tb = page.getByTestId('settings-topbar'); const jump = await page.getByTestId('sec-jump').boundingBox().catch(() => null); const srch = await page.getByTestId('settings-search').boundingBox();
  r[`${k}_chipsAbove`] = !!jump && jump.y < srch.y;
  const top0 = (await tb.boundingBox()).y; await page.getByTestId('settings-content').evaluate(e => { e.scrollTop = 700; }); await page.waitForTimeout(400); const top1 = (await tb.boundingBox()).y;
  r[`${k}_sticky`] = Math.abs(top1 - top0) < 2; console.log(k, 'vtabs', nv, '帯の位置', top0, '->', top1);
  // ④「この中の項目」の最後の見出しへ
  const chips = page.locator('[data-testid="sec-jump"] button'); const nc = await chips.count(); const lastTitle = (await chips.nth(nc - 1).innerText()).trim();
  await chips.nth(nc - 1).click(); await page.waitForTimeout(900);
  const pos = await page.evaluate((t) => { const el = [...document.querySelectorAll('[data-sec-title]')].find(x => x.getAttribute('data-sec-title') === t); const bar = document.querySelector('[data-testid="settings-topbar"]'); const sc = document.querySelector('[data-testid="settings-content"]'); return el ? { card: Math.round(el.getBoundingClientRect().top), bar: Math.round(bar.getBoundingClientRect().bottom), atEnd: sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2 } : null; }, lastTitle);
  console.log(k, '項目', lastTitle, pos); r[`${k}_chipJump`] = !!pos && pos.card >= pos.bar - 2 && (pos.card < pos.bar + 60 || pos.atEnd); // 最後の見出しは下まで行ったら止まる
  // ⑤ 検索
  await page.getByTestId('settings-search-input').fill('端末名'); await page.waitForTimeout(300); await page.getByTestId('settings-search-hit-0').dispatchEvent('mousedown'); await page.waitForTimeout(1000);
  const cur = await page.locator('[data-testid^="settings-vtab-"][aria-current="page"]').innerText().catch(() => ''); console.log(k, '検索で移った先', cur); r[`${k}_search`] = /システム/.test(cur);
  // ⑥ 幅と入力欄
  const w = await page.evaluate(() => { const c = document.querySelector('[data-testid="settings-content"] > div'); const inp = document.querySelector('[data-testid="settings-content"] input.py-2\\.5'); return { w: Math.round(c.getBoundingClientRect().width), pad: inp ? getComputedStyle(inp).paddingTop : '' }; });
  console.log(k, '中身の幅', w); r[`${k}_compact`] = w.w <= 897 && (w.pad === '' || w.pad === '6px');
  await ctx.close();
}
{ const { ctx, page } = await open({ width: 393, height: 820 }, 'settings');
  r.phoneTabs = await page.getByTestId('settings-tabs').isVisible() && (await page.locator('[data-testid^="settings-vtab-"]:visible').count()) === 0;
  await ctx.close(); }
{ const { ctx, page } = await open({ width: 1180, height: 820 }, 'family_admin');
  const txt = await page.locator('body').innerText();
  r.noCheckIcons = !/[☑☐]\s*(ご家族|ケアマネ|その他関係者)/.test(txt) && /ご家族/.test(txt);
  r.noEventClass = !txt.includes('イベント/クラス') && txt.includes('表示日'); console.log('家族関係者閲覧', r.noCheckIcons, r.noEventClass);
  await ctx.close(); }
await b.close();
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
