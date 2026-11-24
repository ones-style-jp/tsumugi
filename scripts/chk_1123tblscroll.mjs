// 2026-11-23 trial619 ユーザー「スマホで支援経過表など表の中を指で動かしてもスクロールしない(外側の余白でしか動かない)」「文字の欄のキーボードの閉じ方はおすすめで」
//   ①820px 幅(横向きのスマホ・小さなタブレット)の個人ファイル → 支援経過表: 表の中を指で上に動かすと中身の枠(pf-content)がスクロールする(修正前は余白でしか動かなかった)
//   ②393px 幅(スマホ)の支援経過表の一覧の中を指で動かしてもスクロールする
//   ③スマホ幅で文章の欄(textarea)に触れると「キーボードを閉じる」が出て、押すと欄から離れる(キーボードが閉じる)・ボタンは消える
//   ④iPad 幅(1180)では「キーボードを閉じる」は出ない(iPad には閉じるキーがある)
//   指の動きは CDP の Input.dispatchTouchEvent(実際のスクロール連鎖・touch-action・overscroll-behavior が効く)
//   実行: node scripts/chk_1123tblscroll.mjs [--port 4175]
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); if (i >= 0) return process.argv[i + 1]; const a = process.argv[2]; return a && /^\d+$/.test(a) ? a : '4175'; })();
const b = await chromium.launch(); const r = {};
const open = async (vp, view) => { const ctx = await b.newContext({ viewport: vp, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', hasTouch: true, isMobile: vp.width < 1000 }); const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => d.accept());
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  await page.evaluate((v) => { localStorage.setItem('tsumugiSidebarOpen', '0'); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: null, t: Date.now() })); }, view);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
  return { ctx, page }; };
const openSp = async (page) => { await page.locator('[data-testid="pin-master-list"] button, button', { hasText: /^要(介護|支援)/ }).first().click().catch(() => {}); await page.waitForTimeout(400);
  await page.evaluate(() => { const el = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && /^要(介護|支援)\d$/.test((e.textContent || '').trim())); if (el) el.click(); });
  await page.locator('button:visible', { hasText: /個人ファイル/ }).first().click(); await page.waitForTimeout(1200);
  const tab = page.locator('.pf-tabs-scroll button, [data-testid^="pf-vtab-"]', { hasText: /支援経過/ }).first(); await tab.evaluate(el => el.click()); await page.waitForTimeout(800);
  for (let i = 0; i < 12; i++) { const add = page.locator('button:visible', { hasText: /行を追加/ }).first(); if (!(await add.count())) break; await add.click().catch(() => {}); await page.waitForTimeout(120); const close = page.locator('button:visible', { hasText: /^閉じる$/ }).last(); if (await close.count()) await close.click().catch(() => {}); }
  await page.waitForTimeout(500); return page.getByTestId('personal-file-modal').count(); };
const drag = async (page, x, y0, y1, steps = 12) => { const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
  for (let i = 1; i <= steps; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + (y1 - y0) * i / steps }] }); await page.waitForTimeout(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(500); await cdp.detach(); };
const pfTop = (page) => page.evaluate(() => { const pf = document.querySelector('[data-testid="pf-content"]'); return pf ? pf.scrollTop : -1; });
const setPf = (page, v) => page.evaluate((v) => { const pf = document.querySelector('[data-testid="pf-content"]'); if (pf) pf.scrollTop = v; }, v);
// ① 820px: 表の中
{ const vp = { width: 820, height: 393 }; const { ctx, page } = await open(vp, 'master'); const n = await openSp(page);
  const box = await page.locator('.tsu-sp-table').first().boundingBox(); await setPf(page, 150); await page.waitForTimeout(200); const t0 = await pfTop(page);
  const b2 = await page.locator('.tsu-sp-table').first().boundingBox(); const y0 = Math.min(vp.height - 30, Math.max(b2.y + 20, 120));
  await drag(page, b2.x + b2.width / 2, y0, y0 - 200); const t1 = await pfTop(page);
  const noy = await page.locator('.tsu-sp-table').first().evaluate(el => { const w = el.parentElement; return w.getAttribute('data-tsu-noy') + '|' + getComputedStyle(w).overscrollBehaviorY; });
  console.log('820 表', n, '表の位置', box && Math.round(box.y), '前', t0, '後', t1, 'noy', noy); r.tableScroll820 = n === 1 && t1 > t0 + 40; await ctx.close(); }
// ② 393px: 一覧の中
{ const vp = { width: 393, height: 820 }; const { ctx, page } = await open(vp, 'master'); const n = await openSp(page);
  await setPf(page, 100); await page.waitForTimeout(200); const t0 = await pfTop(page); const bx = await page.locator('[data-testid="sp-phone-list"]').first().boundingBox();
  const y0 = Math.min(vp.height - 60, Math.max(bx.y + 40, 150)); await drag(page, bx.x + bx.width / 2, y0, y0 - 200); const t1 = await pfTop(page);
  console.log('393 一覧', n, '前', t0, '後', t1); r.listScroll393 = n === 1 && t1 > t0 + 40;
  // ③ キーボードを閉じる: 一覧の行を押すと textarea が出る
  await page.locator('[data-testid="sp-phone-list"] button').first().evaluate(el => el.click()); await page.waitForTimeout(400);
  const ta = page.locator('[data-testid="sp-phone-list"] textarea').first(); await ta.tap(); await page.waitForTimeout(400);
  const focused = await page.evaluate(() => document.activeElement && document.activeElement.tagName); const btn = page.getByTestId('tsu-kb-close'); const vis = await btn.isVisible().catch(() => false);
  const top = vis ? await btn.evaluate(el => parseInt(el.style.top, 10)) : -1;
  if (vis) await btn.tap(); await page.waitForTimeout(300);
  const after = await page.evaluate(() => document.activeElement && document.activeElement.tagName); const vis2 = await btn.isVisible().catch(() => false);
  console.log('キーボードを閉じる', '焦点', focused, 'ボタン', vis, 'top', top, '→ 焦点', after, 'ボタン', vis2);
  r.kbClose = focused === 'TEXTAREA' && vis && top > 600 && top < vp.height && after !== 'TEXTAREA' && !vis2; await ctx.close(); }
// ④ iPad 幅では出ない
{ const vp = { width: 1180, height: 820 }; const { ctx, page } = await open(vp, 'master'); const n = await openSp(page);
  const ta = page.locator('[data-testid="pf-content"] textarea, [data-testid="pf-content"] input[type="text"]').first(); let vis = false;
  if (await ta.count()) { await ta.tap().catch(() => {}); await page.waitForTimeout(400); vis = await page.getByTestId('tsu-kb-close').isVisible().catch(() => false); }
  else { await page.locator('button:visible', { hasText: /行を追加/ }).first().click().catch(() => {}); await page.waitForTimeout(400); const ta2 = page.locator('[data-testid="pf-content"] textarea').first(); if (await ta2.count()) { await ta2.tap().catch(() => {}); await page.waitForTimeout(400); vis = await page.getByTestId('tsu-kb-close').isVisible().catch(() => false); } }
  console.log('1180 ボタン', vis, n); r.noBtnIpad = n === 1 && !vis; await ctx.close(); }
await b.close();
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'ALL PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
