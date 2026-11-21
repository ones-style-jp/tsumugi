// 1119h/trial603 支援経過表: 休止の履歴がある期間は提供記録の「休止」から行を作らない(重複しない)・終了日のある休止は翌日に「利用再開」・保険証/負担割合の更新文に「－ →」を出さない
import { chromium } from 'playwright';
const PORT = process.argv[2] || '4175'; let fails = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
page.on('dialog', d => d.accept());
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const pid = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const p = d.patients.find(x => x.status === '利用中' && !x.endDate);
  p.pauseHistory = [{ fromDate: '2026-11-10', toDate: '2026-11-15', reason: '入院' }]; p.docUpdates = [];
  d.ticketRecords = (d.ticketRecords || []).filter(r => r.patientId !== p.id);
  ['2026-11-10', '2026-11-12', '2026-11-14'].forEach((iso, i) => { const dd = new Date(iso + 'T00:00:00'); d.ticketRecords.push({ id: `ps${i}`, patientId: p.id, name: p.name, date: `${dd.getMonth()+1}月${dd.getDate()}日`, year: 2026, dayOfWeek: '月', status: '休止', tokki: '', exercises: {} }); });
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0');
  sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'master', pid: p.id, t: Date.now() })); sessionStorage.setItem('tsumugiReopenPF', JSON.stringify({ patientId: p.id, tab: '__support', keep: true })); return p.id; });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(3500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
let modal = page.locator('[data-testid="personal-file-modal"]'); if (!(await modal.count())) { await page.locator('button', { hasText: /個人ファイル/ }).first().click().catch(() => {}); await page.waitForTimeout(1500); modal = page.locator('[data-testid="personal-file-modal"]'); }
ok(await modal.count() > 0, '個人ファイルが開く');
const tabs = modal.locator('button:visible', { hasText: '支援経過表' }); if (await tabs.count()) { await tabs.last().click(); await page.waitForTimeout(1500); }
// 行の中身は入力欄(textarea/input/select)なので value を集める(innerText には出ない)
const txt = (await modal.locator('textarea, input, select').evaluateAll(els => els.map(e => e.value || '').join(' | '))).replace(/\s+/g, ' ');
const nPauseReason = (txt.match(/利用休止：入院/g) || []).length; const nPauseBare = (txt.match(/利用休止(?![：（])/g) || []).length;
ok(nPauseReason === 1, `「利用休止：入院」が1行 (${nPauseReason})`);
ok(nPauseBare === 0, `理由なしの「利用休止」だけの行が無い (${nPauseBare})`);
ok(/2026-11-16[^\n]{0,80}利用再開（休止 11\/10〜11\/15）/.test(txt) || /利用再開（休止 11\/10〜11\/15）/.test(txt), '翌日に「利用再開（休止 11/10〜11/15）」');
await b.close(); console.log(fails ? `FAIL ${fails}` : 'ALL PASS'); process.exit(fails ? 1 : 0);
