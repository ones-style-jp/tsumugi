// 2026-10-21 LIFE: フェイスシート(個人ファイル = personalFile.faceSheet)に自立度を入れた方が「自立度(フェイスシート)が未設定」にならない(安定版へ移した不具合修正の確認)
//   node scripts/chk_1021lifefs.mjs [port] [view]   安定版=4175 life_hub / 試験版=4173 life_submit
import { chromium } from 'playwright';
const PORT = process.argv[2] || '4185'; const VIEW = process.argv[3] || 'life_submit';
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const names = await page.evaluate((VIEW) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3'));
  d.systemSettings.addons = { ...(d.systemSettings.addons || {}), kasan_kagaku: true, kasan_adl: true };
  d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), officeNumber: '1300000001', serviceCode: '78', insurerNo: '131000' };
  const act = d.patients.filter(p => p.status === '利用中').slice(0, 3);
  act.forEach((p, i) => { p.insuranceNo = String(1000000001 + i); p.careLevel = '要介護2'; p.gender = p.gender || '女'; p.birthDate = p.birthDate || '1940-01-01';
    delete p.faceSheet; p.personalFile = { ...(p.personalFile || {}), faceSheet: { ...(((p.personalFile || {}).faceSheet) || {}), adlLevel: 'A1', dementiaLevel: 'Ⅱa' } }; });
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: VIEW, t: Date.now() })); return act.map(p => p.name); }, VIEW);
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
// LIFE提出の画面へ(安定版は LIFE・加算 の中のタブ)
for (const t of ['LIFE提出', 'LIFE提出（CSV）', 'CSV出力', 'LIFE']) { const x = page.locator('button:visible', { hasText: new RegExp('^' + t + '$') }).first(); if (await x.count()) { await x.click().catch(() => {}); await page.waitForTimeout(600); break; } }
const sel = page.locator('select').filter({ has: page.locator('option', { hasText: /科学的介護/ }) }).first();
if (await sel.count()) { const v = await sel.locator('option', { hasText: /科学的介護/ }).first().getAttribute('value'); await sel.selectOption(v); await page.waitForTimeout(800); }
const rows = await page.evaluate((names) => [...document.querySelectorAll('tr')].map(tr => tr.innerText.replace(/\s+/g, ' ')).filter(t => names.some(n => t.includes(n))), names);
console.log('rows', rows.length, JSON.stringify(rows.map(t => t.slice(0, 120)).slice(0, 3)));
const bad = rows.filter(t => /自立度[^。]*未設定/.test(t));
const r = { seeded: names.length === 3, rowsShown: rows.length >= 3, noIndepError: rows.length >= 3 && bad.length === 0 };
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL', 'bad', bad.length); await b.close();
