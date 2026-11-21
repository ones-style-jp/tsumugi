// trial601: スマホの日誌のカレンダーを左右スワイプで月送り
import { chromium } from 'playwright';
const PORT = process.argv[2] || '4175'; let fails = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
await page.evaluate(() => { localStorage.setItem('tsumugiSidebarOpen', '0'); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'diary', t: Date.now() })); });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(3000); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
const root = page.locator('[data-testid="diary-cal-root"]').first(); ok(await root.count() > 0, 'カレンダーの外枠がある');
const sum = root.locator('summary').first(); await sum.click().catch(() => {}); await page.waitForTimeout(500);
const label = async () => (await root.innerText()).match(/(\d{4})年(\d{1,2})月/);
const before = await label(); ok(!!before, `月の表示 ${before && before[0]}`);
// 小窓(details の中身)は画面に固定して出るので、指は小窓の上に置く(外枠の矩形ではなく)
const swipe = async (dir) => { await page.evaluate(([dir]) => { const el = document.querySelector('[data-testid="diary-cal-root"]'); const panel = el.querySelector('details > div') || el; const r = panel.getBoundingClientRect(); const y = r.top + Math.min(r.height - 10, 120); const x0 = dir < 0 ? r.left + 40 : r.right - 40, x1 = dir < 0 ? r.right - 40 : r.left + 40;
  const mk = (x) => new Touch({ identifier: 1, target: panel, clientX: x, clientY: y, pageX: x, pageY: y }); panel.dispatchEvent(new TouchEvent('touchstart', { touches: [mk(x0)], changedTouches: [mk(x0)], bubbles: true, cancelable: true }));
  return new Promise(res => setTimeout(() => { panel.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [mk(x1)], bubbles: true, cancelable: true })); res(); }, 80)); }, [dir]); await page.waitForTimeout(600); };
await swipe(+1); const after = await label(); ok(after && (Number(after[2]) === (Number(before[2]) % 12) + 1), `左へスワイプ → 次の月 (${before && before[0]} → ${after && after[0]})`);
await swipe(-1); const back = await label(); ok(back && back[0] === before[0], `右へスワイプ → 前の月に戻る (${back && back[0]})`);
await b.close(); console.log(fails ? `FAIL ${fails}` : 'ALL PASS'); process.exit(fails ? 1 : 0);
