// 2026-11-25 追加の2枚: 担当者会議記録の入力画面(iPad)・「キーボードを閉じる」(スマホ・個人ファイル→支援経過表)
import { chromium, devices } from 'playwright';
import path from 'node:path';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://localhost:4175'); const OUT = arg('--out', 'public/manual/img');
const b = await chromium.launch();
const guard = async (page) => { const t = await page.locator('body').innerText(); if (/扇橋|6458|ひかり|佐藤\s?健一|岩岡|長谷川/.test(t)) { console.log('NG: 実在の名前'); process.exit(1); } };
const facility = (d) => { const nm = '（見本）つむぎデイサービス', ph = '03-0000-0000'; d.facilityName = nm; d.facilityPhone = ph; d.contactBookConfig = { ...(d.contactBookConfig || {}), facilityName: nm, facilityPhone: ph }; d.systemSettings = d.systemSettings || {}; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), name: nm, phone: ph, fax: '03-0000-0001', address: '東京都新宿区西新宿2-8-1' }; };
const boot = async (ctx) => { const page = await ctx.newPage(); page.on('dialog', d => d.accept());
  await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  const pid = await page.evaluate((src) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); (new Function('d', src))(d); const p = d.patients.find(x => x.status === '利用中' && !x.endDate); p.personalFile = { ...(p.personalFile || {}), meetings: [] }; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); return p.id; }, `(${facility.toString()})(d)`);
  const shot = async (name) => { await page.screenshot({ path: path.join(OUT, name + '.jpg'), type: 'jpeg', quality: 82 }); console.log('shot', name); };
  return { page, pid, shot }; };
{ const ctx = await b.newContext({ viewport: { width: 1180, height: 760 }, deviceScaleFactor: 1.5, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const { page, pid, shot } = await boot(ctx);
  await page.evaluate((pid) => { sessionStorage.setItem('tsumugiReopenPF', JSON.stringify({ patientId: pid, tab: 'cat_3' })); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'master', pid, t: Date.now() })); }, pid);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await guard(page);
  await page.locator('[data-testid="personal-file-modal"] button:visible', { hasText: /ケアプラン・担当者会議/ }).first().click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(600);
  await page.getByTestId('meet-new').click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(1000);
  if (await page.getByTestId('meeting-float').count()) { await shot('nov_meeting'); } else console.log('no meeting-float');
  await ctx.close(); }
{ const ctx = await b.newContext({ viewport: { width: 1180, height: 760 }, deviceScaleFactor: 1.5, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const { page, shot } = await boot(ctx);
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), officeNumber: '1300000000', serviceCode: '78', insurerNo: '130000', lifeDefaultJob: '050' }; d.systemSettings.addons = { ...(d.systemSettings.addons || {}), kasan_kagaku: true, kasan_adl: true, kasan_kinou2: true };
    const ps = d.patients.filter(p => p.status === '利用中' && !p.endDate && String(p.careLevel || '').startsWith('要介護')).slice(0, 4); const items = {}; ['eat','transfer','groom','toilet','bath','walk','stairs','dress','stool','urine'].forEach(k => items[k] = 5);
    const t = new Date(); const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    ps.forEach((p, i) => { p.insuranceNo = String(1000000001 + i); p.birthDate = p.birthDate || '1940-01-01'; p.gender = p.gender || '女'; p.personalFile = { ...(p.personalFile || {}), faceSheet: { ...(((p.personalFile || {}).faceSheet) || {}), adlLevel: 'A2', dementiaLevel: 'IIa' } }; });
    d.adlRecords = ps.map((p, i) => ({ id: 'man-adl-' + i, patientId: p.id, evalDate: iso(new Date(t.getFullYear(), t.getMonth() - (i === 3 ? 5 : 0), 15)), evaluator: '見本 職員', items, total: 50, adlMonth: i === 0 ? 'first' : '', science: { height: '150', weight: '45', denture: 0, choke: 0, stains_on_teeth: 0, condition_of_gums: 0, dementia_diagnosis: 0, demScale: [0,0,0,0,0,0,0], vitality: [1,1,1,1,1] } }));
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'life_submit', pid: null, t: Date.now() })); });
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 300 }).catch(() => {}); await guard(page);
  const first = page.locator('input[data-testid^="life-sel-"]:not([data-testid="life-sel-all"])').first(); if (await first.count()) await first.check().catch(() => {}); await page.waitForTimeout(400);
  await shot('nov_life_sel'); await ctx.close(); }
{ const ctx = await b.newContext({ ...devices['iPhone 14'], locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const { page, shot } = await boot(ctx);
  await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'master', pid: null, t: Date.now() }))); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 300 }).catch(() => {}); await guard(page);
  await page.evaluate(() => { const el = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && /^要(介護|支援)\d$/.test((e.textContent || '').trim())); if (el) el.click(); }); await page.waitForTimeout(500);
  await page.locator('button:visible', { hasText: /個人ファイル/ }).first().click().catch(() => {}); await page.waitForTimeout(1200);
  const tab = page.locator('.pf-tabs-scroll button, [data-testid^="pf-vtab-"]', { hasText: /支援経過/ }).first(); if (await tab.count()) await tab.evaluate(el => el.click()); await page.waitForTimeout(800);
  const add = page.locator('button:visible', { hasText: /行を追加/ }).first(); if (await add.count()) { await add.click().catch(() => {}); await page.waitForTimeout(500); }
  const ta = page.locator('[data-testid="sp-phone-list"] textarea').first();
  if (await ta.count()) { await ta.tap().catch(() => {}); await page.waitForTimeout(700); if (await page.getByTestId('tsu-kb-close').isVisible().catch(() => false)) await shot('nov_sp_kbclose'); else console.log('no kb close'); } else console.log('no textarea', await page.getByTestId('sp-phone-list').count());
  await ctx.close(); }
await b.close();
