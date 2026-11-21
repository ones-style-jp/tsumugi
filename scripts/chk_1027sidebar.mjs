// 2026-10-27 サイドバーの重なり: タブレット縦・スマホ横でサイドバーを開くと、表の見出し(利用者名)が上に浮く/スマホ縦で利用者の一覧を開いたままサイドバーを開くと崩れる
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4173'; })();
const SHOT = process.argv.includes('--shot') ? process.argv[process.argv.indexOf('--shot') + 1] : '';
const b = await chromium.launch(); const r = {};
async function open(vp, view, mobile) {
  const ctx = await b.newContext({ viewport: vp, locale: 'ja-JP', hasTouch: !!mobile, isMobile: !!mobile });
  const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
  await page.evaluate((v) => { sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: null, t: Date.now() })); }, view);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2200); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
  return { ctx, page };
}
// サイドバーの中の点で、いちばん上に描かれているものがサイドバー(またはその中身)か
const topIsSidebar = (page) => page.evaluate(() => { const sb = document.querySelector('[data-testid="app-sidebar"]'); const rc = sb.getBoundingClientRect(); const out = [];
  for (let y = 70; y < Math.min(window.innerHeight - 10, 700); y += 23) for (const x of [20, 120, 230]) { const el = document.elementFromPoint(Math.min(x, rc.right - 4), y); if (el && !sb.contains(el)) out.push(`${x},${y}:${el.tagName}.${String(el.className).slice(0, 30)}:${(el.textContent || '').slice(0, 8)}`); }
  return out; });
// 開いたサイドバーの外(右側)が暗い幕で覆われているか(表の見出しが幕の上に浮かない)
const dimOk = (page) => page.evaluate(() => { const bad = []; for (let y = 70; y < Math.min(window.innerHeight - 10, 700); y += 23) for (const x of [300, 420, 600]) { if (x >= window.innerWidth) continue; const el = document.elementFromPoint(x, y); if (el && !/bg-black\/50/.test(String(el.className))) bad.push(`${x},${y}:${el.tagName}:${(el.textContent || '').slice(0, 8)}`); } return bad; });
const cases = [['tabletPortrait', { width: 768, height: 1024 }, true], ['phoneLandscape', { width: 844, height: 390 }, true]];
for (const [nm, vp, mob] of cases) for (const view of ['record', 'print', 'diary', 'monitoring']) {
  const { ctx, page } = await open(vp, view, mob);
  await page.evaluate(() => window.scrollTo(0, 0));
  // 表を少し下へ動かして見出しを貼り付いた状態にする
  await page.mouse.wheel(0, 260).catch(() => {}); await page.waitForTimeout(300);
  await page.locator('header button:has(svg.lucide-menu), button:has(svg.lucide-menu)').first().click(); await page.waitForTimeout(700);
  const a = await topIsSidebar(page); const d = await dimOk(page);
  r[`${nm}_${view}`] = a.length === 0 && d.length === 0; if (!r[`${nm}_${view}`]) console.log(nm, view, 'over-sidebar:', a.slice(0, 4), 'not-dimmed:', d.slice(0, 4));
  if (SHOT) await page.screenshot({ path: `${SHOT}_${nm}_${view}.png` });
  await ctx.close();
}
// スマホ縦: 利用者の一覧を開いたままメニューを開く → 一覧は閉じて、サイドバーが前に出る
{ const { ctx, page } = await open({ width: 390, height: 844 }, 'record', true);
  const j = page.getByTestId('rec-fold-jump');
  if (await j.count()) { await j.click(); await page.waitForTimeout(500); const opened = await page.getByTestId('rec-jump').count();
    await page.locator('button:has(svg.lucide-menu)').first().click({ force: true }).catch(() => {}); await page.waitForTimeout(700);
    const still = await page.getByTestId('rec-jump').count(); const a = await topIsSidebar(page);
    r.phonePickerClosed = opened === 1 && still === 0 && a.length === 0; if (!r.phonePickerClosed) console.log('picker', opened, still, a.slice(0, 4));
    if (SHOT) await page.screenshot({ path: `${SHOT}_phonePortrait_picker.png` });
  } else { r.phonePickerClosed = false; console.log('no rec-fold-jump'); }
  // サイドバーを閉じたら、もう一度一覧が開ける
  await page.mouse.click(370, 400); await page.waitForTimeout(600); await j.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(400); r.pickerReopens = (await page.getByTestId('rec-jump').count()) === 1;
  await ctx.close(); }
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
