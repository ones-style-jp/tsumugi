// trial604: 送付状の担当は 日誌の職員(重複なし・ヘルプ除く)+「その他(名前と職種を入力)」
import { chromium } from 'playwright';
const PORT = process.argv[2] || '4175'; let fails = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.diarySettings = d.diarySettings || {}; d.diarySettings.staff = [{ id: 'a1', name: '見本 太郎', role: '管理者', ampm: 'both' }, { id: 'ds_sync_a1', name: '見本 太郎', role: '管理者', ampm: 'both' }, { id: 'a2', name: '見本 花子', role: '介護職員', ampm: 'both' }, { id: 'h1', name: '見本 ヘルプ', role: '介護職員', ampm: 'both', _tempHelp: true, _helpDate: '2026-11-01' }, { id: 'r1', name: '見本 退職', role: '介護職員', ampm: 'both', _to: '2026-10-31' }]; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'general_fax', t: Date.now() })); });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(3000); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
const sel = page.locator('select').filter({ has: page.locator('option', { hasText: /その他（名前と職種を入力）/ }) }).first(); ok(await sel.count() > 0, '担当のプルダウンに「その他」がある');
const opts = await sel.locator('option').allInnerTexts(); console.log('options:', opts.join(' | '));
ok(opts.filter(t => /見本 太郎/.test(t)).length === 1, '同じ名前+役職は1つ'); ok(!opts.some(t => /ヘルプ/.test(t)), '「この日だけ」の職員は出ない'); ok(!opts.some(t => /退職/.test(t)), '退職した職員は出ない'); ok(opts[opts.length - 1].includes('その他'), '「その他」がいちばん下');
await sel.selectOption('__other'); await page.waitForTimeout(400); const other = page.locator('[data-testid="fax-mgr-other"]'); ok(await other.count() > 0, 'その他を選ぶと氏名と職種の入力欄');
await other.locator('input').nth(0).fill('見本 自由'); await other.locator('input').nth(1).fill('事務'); await page.waitForTimeout(300);
const v = await other.locator('input').evaluateAll(els => els.map(e => e.value)); ok(v[0] === '見本 自由' && v[1] === '事務', `入力できる (${v.join('/')})`);
await b.close(); console.log(fails ? `FAIL ${fails}` : 'ALL PASS'); process.exit(fails ? 1 : 0);
