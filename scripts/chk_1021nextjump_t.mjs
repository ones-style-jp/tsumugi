// 2026-10-21 連絡帳「次回の日付」(送迎表を使う店舗): 各種入力 → 次回の日付 → 一覧に次回の日付 → 「月間スケジュール」で利用者マスタのその方の月間スケジュールへ
//   送迎表を使わない店舗はカードを出さない(今までどおり「次回予定」で日付・時間を入れる)
import { chromium } from 'playwright';
const OUT = '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad';
const b = await chromium.launch(); const r = {};
async function open(opt) { const page = await (await b.newContext({ locale: 'ja-JP', timezoneId: 'Asia/Tokyo', ...opt })).newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.goto('http://localhost:4185/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  return page; }
const go = async (page, view) => { await page.evaluate((v) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: null, t: Date.now() })), view); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); };
for (const vw of [{ width: 1366, height: 900 }, { width: 390, height: 844, isMobile: true, hasTouch: true }]) {
  const k = vw.width > 800 ? 'pc' : 'phone';
  const page = await open({ viewport: { width: vw.width, height: vw.height }, isMobile: vw.isMobile, hasTouch: vw.hasTouch });
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.systemSettings = d.systemSettings || {}; d.systemSettings.transportEnabled = true; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); });
  await go(page, 'print');
  await page.evaluate(() => { const bt = [...document.querySelectorAll('button')].find(b => b.textContent.trim().startsWith('各種入力')); if (bt) bt.click(); }); await page.waitForTimeout(600);
  r[k + '_card'] = (await page.getByTestId('cb-hub-nextdate').count()) === 1;
  await page.getByTestId('cb-hub-nextdate').click(); await page.waitForTimeout(600);
  const row = page.locator('[data-testid^="cb-nextjump-row-"]').first(); r[k + '_row'] = (await row.count()) === 1 && /\d+月\d+日/.test(await row.innerText());
  const pid = (await row.getAttribute('data-testid')).replace('cb-nextjump-row-', '');
  const name = (await row.innerText()).split('\n')[0].trim();
  if (k === 'pc') await page.screenshot({ path: `${OUT}/nextjump_modal.png` });
  await page.getByTestId(`cb-nextjump-go-${pid}`).click(); await page.waitForTimeout(2500);
  const txt = await page.locator('body').innerText();
  r[k + '_jumped'] = /利用者マスタ/.test(txt) && txt.includes(name) && /月間スケジュール/.test(txt);
  if (k === 'pc') await page.screenshot({ path: `${OUT}/nextjump_master.png` });
  await page.context().close();
}
{ const page = await open({ viewport: { width: 1366, height: 900 } });
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.systemSettings = d.systemSettings || {}; d.systemSettings.transportEnabled = false; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); });
  await go(page, 'print'); await page.locator('button:visible', { hasText: /^各種入力/ }).first().click(); await page.waitForTimeout(600);
  r.offNoCard = (await page.getByTestId('cb-hub-nextdate').count()) === 0 && (await page.getByTestId('cb-hub-next').count()) === 1;
  await page.context().close(); }
console.log(r, Object.values(r).every(v => v === true) ? 'PASS' : 'FAIL'); await b.close();
