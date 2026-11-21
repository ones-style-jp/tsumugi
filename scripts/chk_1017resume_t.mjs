import { chromium, devices } from 'playwright';
const b = await chromium.launch();
for (const [label, dev] of [['pc', { viewport: { width: 1280, height: 800 } }], ['phone', devices['iPhone 13']]]) {
  const ctx = await b.newContext({ ...dev, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage();
  page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.goto('http://localhost:4185/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  await page.evaluate(() => { sessionStorage.clear(); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'record', pid: null, t: Date.now() })); });
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
  // 提供記録: 日付を 3日前に・PM に
  const dateIn = page.locator('input[type=date]').first(); const d = new Date(); d.setDate(d.getDate() - 3); const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  await dateIn.fill(iso); await page.waitForTimeout(300); await page.locator('button', { hasText: /^PM$/ }).first().click(); await page.waitForTimeout(400);
  const st = await page.evaluate(() => JSON.parse(sessionStorage.getItem('tsumugi_resume_view') || '{}')); console.log(label, 'stored', st.view, st.date === iso, st.ampm);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
  console.log(label, 'after reload: date', (await page.locator('input[type=date]').first().inputValue()) === iso, 'PM btn class', await page.locator('button', { hasText: /^PM$/ }).first().evaluate(el => el.className.split(' ').filter(c => /bg-|text-white/.test(c)).join(' ')), 'AM btn class', await page.locator('button', { hasText: /^AM$/ }).first().evaluate(el => el.className.split(' ').filter(c => /bg-|text-white/.test(c)).join(' ')));
  // 利用者マスタ → 個人ファイル → 支援経過表タブ → 再読み込み
  await page.evaluate(() => { const d2 = JSON.parse(localStorage.getItem('daycareAppData_v3')); const p = d2.patients.find(x => x.status === '利用中'); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'master', pid: p.id, t: Date.now() })); sessionStorage.removeItem('tsumugiReopenPF'); });
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
  if (label === 'phone') { const r = page.locator('button', { hasText: /例示|架空|仮名|標本|見本/ }).first(); if (await r.count()) { await r.click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(600); } }
  await page.locator('button', { hasText: '個人ファイル' }).first().click({ timeout: 5000 }); await page.waitForTimeout(900);
  await page.locator('[data-testid="personal-file-modal"] button', { hasText: /支援経過表/ }).first().click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(500);
  console.log(label, 'pf stored', await page.evaluate(() => (sessionStorage.getItem('tsumugiReopenPF') || '').slice(0, 80)));
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
  const pf = await page.evaluate(() => { const m = document.querySelector('[data-testid="personal-file-modal"]'); if (!m) return 'closed'; const act = [...m.querySelectorAll('button')].find(b => /支援経過表/.test(b.innerText) && /bg-blue|border-blue|text-blue|bg-slate-800|bg-indigo/.test(b.className)); return 'open, 支援経過表 tab active: ' + !!act + ', has sp table: ' + !!m.querySelector('.tsu-sp-table, [class*=sp]'); });
  console.log(label, 'pf after reload', pf);
  // 閉じて再読み込み → 開かない
  await page.evaluate(() => { const m = document.querySelector('[data-testid="personal-file-modal"]'); const b = [...m.querySelectorAll('button')].find(x => x.querySelector('svg.lucide-x') || /^×$|^閉じる$/.test(x.innerText.trim())); if (b) b.click(); }); await page.waitForTimeout(500);
  console.log(label, 'pf closed → stored', await page.evaluate(() => sessionStorage.getItem('tsumugiReopenPF')), 'modal', await page.locator('[data-testid="personal-file-modal"]').count());
  await ctx.close();
}
await b.close();
