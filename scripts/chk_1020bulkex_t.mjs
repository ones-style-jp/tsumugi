// 提供記録: 運動を一括で○ → 項目を選ぶ → 出席者×項目(基準値ーは運動なし・数値なしは付けない・入力済みは触らない・欠席は出ない) → ×に切替 → 記録に入れる → 保存で残る
import { chromium } from 'playwright';
const OUT = '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad';
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
const dialogs = []; page.on('dialog', d => { dialogs.push(d.message().slice(0, 60)); d.accept(); }); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.goto('http://localhost:4185/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const ids = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const t = new Date(); const y = t.getFullYear(), m = t.getMonth() + 1, dd = t.getDate(); const dow = t.getDay();
  const ps = d.patients.filter(p => p.status === '利用中').slice(0, 4);
  d.patients.forEach(p => { if (!ps.includes(p)) p.scheduleAmPm = ['', '', '', '', '', '', '']; });
  ps.forEach(p => { p.scheduleAmPm = ['', '', '', '', '', '', '']; p.scheduleAmPm[dow] = 'AM'; p.plannedExercisesHistory = []; });
  ps[0].plannedExercises = { u1: '10分', u2: '20回' }; ps[1].plannedExercises = { u1: 'ー', u2: '20回' }; ps[2].plannedExercises = { u1: '10分', u2: '' }; ps[3].plannedExercises = { u1: '10分', u2: '20回' };
  d.ticketRecords = (d.ticketRecords || []).filter(r => !ps.some(p => p.id === r.patientId));
  ps.forEach((p, i) => d.ticketRecords.push({ id: `tr_${p.id}_${y}_${m}_${dd}`, patientId: p.id, year: y, date: `${m}月${dd}日`, status: i === 3 ? '欠席' : '出席', exercises: i === 2 ? { u1: '15分' } : {} }));
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'record', pid: null, ampm: 'AM', t: Date.now() })); return ps.map(p => p.id); });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
const r = {};
await page.getByTestId('rec-act-bulkex').click(); await page.waitForTimeout(300);
const modal = page.getByTestId('bulk-ex-modal'); r.caution = /減算.{0,2}返還/.test(await page.getByTestId('bulk-ex-caution').innerText());
await modal.locator('label', { hasText: /ﾊﾞｲｸ|バイク/ }).first().locator('input').check(); await modal.locator('label', { hasText: /ﾚｯｸﾞP|レッグP/ }).first().locator('input').check();
await page.getByTestId('bulk-ex-next').click(); await page.waitForTimeout(300);
const tbl = await page.getByTestId('bulk-ex-table').innerText();
r.absentHidden = (await page.getByTestId('bulk-ex-table').locator('tbody tr').count()) === 3;
r.p0both = (await page.getByTestId(`bulk-ex-cell-${ids[0]}-u1`).count()) === 1 && (await page.getByTestId(`bulk-ex-cell-${ids[0]}-u2`).count()) === 1;
r.p1noneSkip = (await page.getByTestId(`bulk-ex-cell-${ids[1]}-u1`).count()) === 0 && (await page.getByTestId(`bulk-ex-cell-${ids[1]}-u2`).count()) === 1;
r.p2filledAndNobase = (await page.getByTestId(`bulk-ex-cell-${ids[2]}-u1`).count()) === 0 && (await page.getByTestId(`bulk-ex-cell-${ids[2]}-u2`).count()) === 0 && /15分（入力済）/.test(tbl) && /基準値なし/.test(tbl);
await page.getByTestId(`bulk-ex-cell-${ids[0]}-u2`).click(); // × に
await page.screenshot({ path: `${OUT}/bulkex.png` });
r.counts = /○ 2件・× 1件/.test(await modal.innerText());
await page.getByTestId('bulk-ex-apply').click(); await page.waitForTimeout(500);
await page.locator('button', { hasText: /^保存$/ }).first().click().catch(() => {}); await page.waitForTimeout(1500);
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
const ex = await page.evaluate((ids) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const t = new Date(); const k = `${t.getMonth() + 1}月${t.getDate()}日`; const g = (pid) => ((d.ticketRecords || []).find(r => r.patientId === pid && r.date === k) || {}).exercises || {}; return ids.map(g); }, ids);
r.saved = ex[0].u1 === '○' && ex[0].u2 === '×' && !ex[1].u1 && ex[1].u2 === '○' && ex[2].u1 === '15分' && !ex[2].u2 && !ex[3].u1;
console.log(JSON.stringify(ex)); console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
