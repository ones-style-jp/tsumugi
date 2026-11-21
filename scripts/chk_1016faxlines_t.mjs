import { chromium, devices } from 'playwright';
const OUT = '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad';
const b = await chromium.launch();
for (const [label, dev] of [['pc', { viewport: { width: 1366, height: 800 } }], ['phone', devices['iPhone 13']], ['ipad', { ...devices['iPad (gen 7) landscape'] }]]) {
  const ctx = await b.newContext({ ...dev, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage();
  page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 160)));
  await page.goto('http://localhost:4185/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  // 各種連絡: 改行を打ち続ける
  await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'general_fax', pid: null, t: Date.now() })));
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
  const ta = page.locator('#print-content-general-fax textarea').first(); await ta.scrollIntoViewIfNeeded(); await ta.click(); await ta.fill('あ'); 
  for (let i = 0; i < 30; i++) { await page.keyboard.press('Enter'); await page.keyboard.type('あ'); }
  await page.waitForTimeout(400);
  const v = await ta.inputValue(); console.log(label, 'general: lines after 30 enters', v.split('\n').length, 'fs', await ta.evaluate(el => el.style.fontSize), 'pop', await page.evaluate(() => { const el = document.getElementById('tsu-pop-notice'); return el ? (el.style.display !== 'none') + ':' + el.textContent.slice(0, 12) : 'none'; }), 'count below', await page.locator('#print-content-general-fax .no-print').filter({ hasText: /\/ 400/ }).count(), 'count in bar', await page.locator('.tsu-abs-bar, [class*=bar]').filter({ hasText: /\/ 400/ }).count());
  // 文字(改行なし)は上限まで入る
  await ta.fill(''); await page.keyboard.type('い'.repeat(60)); const v2 = await ta.inputValue(); console.log(label, 'general: 60 chars typed ->', v2.length);
  // 休み連絡
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const p = (d.patients || []).find(x => x.status === '利用中'); const t = new Date(); const dd = `${t.getMonth()+1}月${t.getDate()}日`;
    d.ticketRecords = (d.ticketRecords || []).concat([{ id: 'absX', patientId: p.id, date: dd, year: t.getFullYear(), status: '欠席', tokki: '' }]); d.faxDataStore = {};
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'absence_fax', pid: null, t: Date.now() })); });
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
  await page.locator('button', { hasText: /例示|架空|仮名/ }).first().click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(800);
  const ta2 = page.locator('#print-content-fax textarea').first(); if (await ta2.count()) { await ta2.scrollIntoViewIfNeeded(); await ta2.click(); await page.keyboard.press('End');
  for (let i = 0; i < 20; i++) { await page.keyboard.press('Enter'); await page.keyboard.type('あ'); }
  await page.waitForTimeout(400);
  console.log(label, 'absence: lines after 20 enters', (await ta2.inputValue()).split('\n').length, 'fs', await ta2.evaluate(el => el.style.fontSize), 'border', await ta2.evaluate(el => getComputedStyle(el).borderStyle), 'pop', await page.evaluate(() => { const el = document.getElementById('tsu-pop-notice'); return el ? (el.style.display !== 'none') + ':' + el.textContent.slice(0, 12) : 'none'; }));
  if (label === 'pc') { await page.locator('#print-content-fax').screenshot({ path: `${OUT}/absline_pc.png` }).catch(() => {}); } } else console.log(label, 'absence: sheet not opened (phone calendar)');
  // 連絡帳: 日付は黒・時刻だけ色
  await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'print', pid: null, t: Date.now() })));
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
  if (label === 'phone') { const op = page.locator('button', { hasText: /操作/ }).first(); if (await op.count()) { await op.click(); await page.waitForTimeout(300); } }
  await page.locator('button', { hasText: /^印刷設定$/ }).first().click(); await page.waitForTimeout(300); await page.getByTestId('cb-timecolor-red').click(); await page.waitForTimeout(400);
  console.log(label, 'cb', JSON.stringify(await page.evaluate(() => { const sp = Array.from(document.querySelectorAll('span')).find(s => s.textContent === '時' && s.style.fontSize === '24px'); const month = Array.from(document.querySelectorAll('span')).find(s => s.textContent === ' 月 '); return { time: sp && sp.style.color, month: month && (month.style.color || 'default'), monthW: month && month.style.fontWeight }; })));
  await page.getByTestId('cb-timecolor-black').click(); await page.waitForTimeout(200);
  await ctx.close();
}
await b.close();
