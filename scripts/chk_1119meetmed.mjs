// trial605: 担当者会議の記録の既往歴・留意点 → 保存でフェイスシート(利用者)に反映・変更履歴に残る
import { chromium } from 'playwright';
const PORT = process.argv[2] || '4175'; let fails = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage(); page.on('dialog', d => d.accept());
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const pid = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const p = d.patients.find(x => x.status === '利用中' && !x.endDate); p.kiou = '高血圧'; p.ryui = '見守り'; p.changeLog = []; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'master', pid: p.id, t: Date.now() })); sessionStorage.setItem('tsumugiReopenPF', JSON.stringify({ patientId: p.id, tab: 'cat_3', keep: true })); return p.id; });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(3500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
const modal = page.locator('[data-testid="personal-file-modal"]'); ok(await modal.count() > 0, '個人ファイルが開く');
const cat = modal.locator('button:visible', { hasText: 'ケアプラン・担当者会議' }); if (await cat.count()) { await cat.last().click(); await page.waitForTimeout(800); }
const nb = page.locator('[data-testid="meet-new"], [data-testid="meet-new-float"]').first(); ok(await nb.count() > 0, '新規作成のボタンがある'); await nb.click(); await page.waitForTimeout(1200);
const k = page.locator('[data-testid="meet-kiou"]').first(); ok(await k.count() > 0, '記録に既往歴の欄がある');
ok((await k.inputValue()) === '高血圧', `今の既往歴が入っている (${await k.inputValue()})`);
await page.locator('[data-testid="meet-when-date"] input[type=date]').first().fill('2026-11-19'); await k.fill('高血圧、2026年11月 右大腿骨骨折（手術）'); await page.waitForTimeout(300);
ok(await page.locator('[data-testid="meet-kiou-changed"]').count() > 0, '「保存するとフェイスシートに反映」の印');
const save = page.locator('button:visible', { hasText: /^保存$/ }).last(); await save.click(); await page.waitForTimeout(1500);
const r = await page.evaluate((pid) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const p = d.patients.find(x => x.id === pid); return { kiou: p.kiou, ryui: p.ryui, log: (p.changeLog || []).map(c => `${c.label}:${c.oldValue}→${c.newValue}:${c.note || ''}`) }; }, pid);
ok(r.kiou === '高血圧、2026年11月 右大腿骨骨折（手術）', `フェイスシートの既往歴に反映 (${r.kiou})`); ok(r.ryui === '見守り', '触っていない留意点は変わらない');
ok(r.log.some(l => l.startsWith('既往歴:高血圧→高血圧、2026年11月 右大腿骨骨折（手術）:担当者会議の記録から')), `変更履歴に残る (${r.log.join(' / ')})`);
await b.close(); console.log(fails ? `FAIL ${fails}` : 'ALL PASS'); process.exit(fails ? 1 : 0);
