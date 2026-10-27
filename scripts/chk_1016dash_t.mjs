import { chromium } from 'playwright';
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
const today = new Date(); const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
await page.goto('http://localhost:4185/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const id = await page.evaluate((iso) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.diarySettings.cars = [{ id: 'cK', name: 'タント', type: '', cap: '3' }];
  const act = d.patients.filter(p => p.status === '利用中').slice(0, 2); const dow = new Date(iso).getDay(); act.forEach(p => { const s = ['', '', '', '', '', '', '']; s[dow] = 'AM'; p.scheduleAmPm = s; });
  d.transportPlans = { [`${iso}_AM`]: { cars: { cK: [{ pid: act[0].id, t: '8:35' }, { pid: act[1].id, t: '8時　分' }] }, walkers: [], others: [], un: [], driver: {}, _savedAt: Date.now() } };
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, t: Date.now() })); return act[1].id; }, iso);
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 400 }).catch(() => {});
const t4 = page.locator(`[data-tpdrop="cK"][data-tpiso="${iso}"][data-tpslot="AM"]`).getByTestId(`tp-time-${id}`);
console.log('before', await t4.inputValue()); await t4.focus(); await page.waitForTimeout(200);
console.log('focus', JSON.stringify(await t4.inputValue()), 'placeholder', await t4.getAttribute('placeholder'));
await t4.blur(); await page.waitForTimeout(300); console.log('blur →', await t4.inputValue());
await t4.focus(); await page.keyboard.type('845'); await t4.blur(); await page.waitForTimeout(1000); console.log('typed →', await t4.inputValue());
await b.close();
