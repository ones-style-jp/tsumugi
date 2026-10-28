// 2026-10-28 夜(試験版 trial449) 各種設定の作り直し・家族関係者閲覧 管理の投稿欄
//   iPad(1180)・PC(1440): ①左に縦の項目(保存はその上)・上の横の項目は出ない ②縦の項目を押すと中身が変わる ③「この中の項目」が検索欄より上・下にスクロールしても上に固定
//   ④「この中の項目」を押すとその見出しが固定の帯のすぐ下に来る ⑤検索で選ぶとその見出しへ ⑥中身の幅は 4xl(896px)まで・入力欄の上下が詰まっている
//   スマホ: ⑦上に横の項目(今までどおり)・縦の項目は出ない
//   家族関係者閲覧 管理: ⑧送付先のボタンに ☑/☐ がない ⑨「イベント/クラス」の欄がない(タイトル・表示日・本文) ⑪どのタブでも帯の位置・大きさが同じ
//   ⑩ケアマネ事業所・担当者(項目が1つ)は縦の項目なし・上の帯のまま
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
  const sv = await page.getByTestId('settings-save').boundingBox().catch(() => null); r[`${k}_vtabs`] = nv >= 8 && !hz && !!sv && sv.x > vp.width / 2 && sv.y < 120; // 保存は右上
  await page.getByTestId('settings-vtab-diary').click(); await page.waitForTimeout(700);
  r[`${k}_switch`] = /送迎車両|日誌/.test(await page.getByTestId('settings-content').innerText());
  await page.getByTestId('settings-vtab-facility').click(); await page.waitForTimeout(700);
  // ③(trial451〜) この中の項目は左の選んでいる項目のすぐ下・上の帯は 検索(短く)＋保存 の1行・「○○に戻る」はない
  const tb = page.getByTestId('settings-topbar'); const srch = await page.getByTestId('settings-search').boundingBox(); const sv2 = await page.getByTestId('settings-save').boundingBox();
  const act = await page.getByTestId('settings-vtab-facility').boundingBox(); const sn = await page.getByTestId('settings-secnav-facility').boundingBox().catch(() => null);
  r[`${k}_secnavUnderTab`] = !!sn && Math.abs(sn.y - (act.y + act.height)) < 3 && (await page.getByTestId('sec-jump').isVisible().catch(() => false)) === false;
  r[`${k}_oneRow`] = Math.abs((srch.y + srch.height / 2) - (sv2.y + sv2.height / 2)) < 6 && srch.width <= 400 && (await page.getByTestId('sec-back').count()) === 0;
  const top0 = (await tb.boundingBox()).y; await page.getByTestId('settings-content').evaluate(e => { e.scrollTop = 700; }); await page.waitForTimeout(400); const top1 = (await tb.boundingBox()).y;
  r[`${k}_sticky`] = Math.abs(top1 - top0) < 2; console.log(k, 'vtabs', nv, '帯の位置', top0, '->', top1);
  // ④ 左の「この中の項目」の最後の見出しへ
  const chips = page.locator('[data-testid="settings-secnav-facility"] button'); const nc = await chips.count(); const lastTitle = (await chips.nth(nc - 1).innerText()).trim();
  await chips.nth(nc - 1).click(); await page.waitForTimeout(900);
  const pos = await page.evaluate((t) => { const el = [...document.querySelectorAll('[data-sec-title]')].find(x => x.getAttribute('data-sec-title') === t); const bar = document.querySelector('[data-testid="settings-topbar"]'); const sc = document.querySelector('[data-testid="settings-content"]'); return el ? { card: Math.round(el.getBoundingClientRect().top), bar: Math.round(bar.getBoundingClientRect().bottom), atEnd: sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2 } : null; }, lastTitle);
  console.log(k, '項目', lastTitle, pos); r[`${k}_chipJump`] = !!pos && pos.card >= pos.bar - 2 && (pos.card < pos.bar + 60 || pos.atEnd); // 最後の見出しは下まで行ったら止まる
  // ⑤ 検索
  await page.getByTestId('settings-search-input').fill('端末名'); await page.waitForTimeout(300); await page.getByTestId('settings-search-hit-0').dispatchEvent('mousedown'); await page.waitForTimeout(1000);
  const cur = await page.locator('[data-testid^="settings-vtab-"][aria-current="page"]').innerText().catch(() => ''); console.log(k, '検索で移った先', cur); r[`${k}_search`] = /システム/.test(cur);
  // (trial452〜) 開いた項目は、ほかを選んでも開いたまま・選んでいる項目をもう一度押すと閉じる・この端末に覚える
  const sysOpen = (await page.getByTestId('settings-secnav-system').count()) === 1; const facStill = (await page.getByTestId('settings-secnav-facility').count()) === 1;
  await page.getByTestId('settings-vtab-system').click(); await page.waitForTimeout(300); const sysClosed = (await page.getByTestId('settings-secnav-system').count()) === 0;
  await page.getByTestId('settings-vtab-system').click(); await page.waitForTimeout(300); const sysReopen = (await page.getByTestId('settings-secnav-system').count()) === 1;
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('tsumugiSettingsOpenTabs') || '[]'));
  console.log(k, '開いたまま', { sysOpen, facStill, sysClosed, sysReopen, stored }); r[`${k}_keepOpen`] = sysOpen && facStill && sysClosed && sysReopen && stored.includes('facility') && stored.includes('system');
  // 選んでいない項目の見出しを押すと、その項目に切り替えてその見出しへ
  await page.getByTestId('settings-sec-facility-2').click(); await page.waitForTimeout(1200);
  const cur2 = await page.locator('[data-testid^="settings-vtab-"][aria-current="page"]').innerText().catch(() => ''); const pos2 = await page.evaluate(() => { const el = [...document.querySelectorAll('[data-sec-title]')].find(x => x.getAttribute('data-sec-title') === '施設休業日の設定'); const bar = document.querySelector('[data-testid="settings-topbar"]'); const sc = document.querySelector('[data-testid="settings-content"]'); return el ? { card: Math.round(el.getBoundingClientRect().top), bar: Math.round(bar.getBoundingClientRect().bottom), atEnd: sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2 } : null; });
  console.log(k, 'ほかの項目の見出しへ', cur2, pos2); r[`${k}_pickOther`] = /事業所情報/.test(cur2) && !!pos2 && pos2.card >= pos2.bar - 2 && (pos2.card < pos2.bar + 60 || pos2.atEnd);
  // ⑥ 幅と入力欄
  const w = await page.evaluate(() => { const c = document.querySelector('[data-testid="settings-content"] > div'); const inp = document.querySelector('[data-testid="settings-content"] input.py-2\\.5'); return { w: Math.round(c.getBoundingClientRect().width), pad: inp ? getComputedStyle(inp).paddingTop : '' }; });
  console.log(k, '中身の幅', w); r[`${k}_compact`] = w.w <= 897 && (w.pad === '' || w.pad === '6px');
  await ctx.close();
}
{ const { ctx, page } = await open({ width: 393, height: 820 }, 'settings');
  r.phoneTabs = await page.getByTestId('settings-tabs').isVisible() && (await page.locator('[data-testid^="settings-vtab-"]:visible').count()) === 0 && await page.getByTestId('sec-jump').isVisible();
  await ctx.close(); }
{ const { ctx, page } = await open({ width: 1180, height: 820 }, 'family_admin');
  const txt = await page.locator('body').innerText();
  r.noCheckIcons = !/[☑☐]\s*(ご家族|ケアマネ|その他関係者)/.test(txt) && /ご家族/.test(txt);
  r.noEventClass = !txt.includes('イベント/クラス') && txt.includes('表示日'); console.log('家族関係者閲覧', r.noCheckIcons, r.noEventClass);
  // ⑪ どのタブでも帯の位置・大きさが同じ(2026-10-28 夜 trial450)
  const pos = []; for (const lb of ['投稿', 'プレビュー', '過去履歴']) { await page.locator('[data-testid="fa-tabs"] button', { hasText: lb }).first().click(); await page.waitForTimeout(700); const bb = await page.getByTestId('fa-tabs').boundingBox(); pos.push([bb.x, bb.y, bb.width, bb.height].map(Math.round).join(',')); }
  console.log('家族関係者閲覧の帯', pos); r.faTabsSame = pos.every(x => x === pos[0]);
  await ctx.close(); }
// ⑩ ケアマネ事業所・担当者(項目が1つ)は縦の項目を出さず今までどおり(2026-10-28 夜 trial450)
{ const { ctx, page } = await open({ width: 1180, height: 820 }, 'cmmaster');
  // (trial454〜) ケアマネ事業所・担当者は 縦の項目・検索・保存・この中の項目・戻る を出さない(追加・編集・削除・名刺はその場で保存)
  r.cmNoVnav = (await page.getByTestId('settings-vtabs').count()) === 0 && (await page.getByTestId('settings-topbar').count()) === 0 && !(await page.getByTestId('settings-save').isVisible().catch(() => false)); r.cmNoChips = !(await page.getByTestId('sec-jump').isVisible().catch(() => false)) && (await page.getByTestId('sec-back').count()) === 0 && !(await page.locator('text=この中の項目').isVisible().catch(() => false)); console.log('ケアマネ', r.cmNoVnav, r.cmNoChips);
  // 名刺の写真を足すと、その場で保存される(保存ボタンを押さなくても店舗のデータに入る)
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const fi = page.locator('label', { hasText: '名刺' }).locator('input[type="file"]').first();
  if (await fi.count()) { const before = await page.evaluate(() => (JSON.parse(localStorage.getItem('daycareAppData_v3')).systemSettings.careManagers || []).reduce((a, c) => a + ((c.businessCard || []).length), 0));
    await fi.setInputFiles({ name: 'card.png', mimeType: 'image/png', buffer: png }); await page.waitForTimeout(2000);
    const after = await page.evaluate(() => (JSON.parse(localStorage.getItem('daycareAppData_v3')).systemSettings.careManagers || []).reduce((a, c) => a + ((c.businessCard || []).length), 0));
    console.log('名刺', before, '->', after); r.cmCardSavedNow = after === before + 1; } else { console.log('名刺の欄なし'); r.cmCardSavedNow = 'skip'; }
  await ctx.close(); }
await b.close();
const ok = Object.values(r).every(v => v === true || v === 'skip'); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
