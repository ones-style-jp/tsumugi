// 提供記録の並び順: ふりがなの書き方がばらばら(カタカナ・空白・未登録)でも、利用者の一覧の並びが変わっても、毎回同じあいうえお順。
// 保存した並び順は「保存した並び順を消す」で消せて、あいうえお順に戻る
import { chromium } from 'playwright';
const PORT = process.env.PORT || 4173;
const b = await chromium.launch(); const r = {};
const page = await (await b.newContext({ viewport: { width: 1180, height: 820 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const go = async () => { await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'record', pid: null, t: Date.now() }))); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); };
const order = () => page.locator('#record-table tr[data-rv-pid][data-rv-status="出席"]').evaluateAll(els => els.map(e => e.getAttribute('data-rv-pid')));
// ふりがなをばらばらにする(カタカナ・空白なし・半角カナ・未登録)
await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const hk = (s) => s.replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60));
  d.patients.forEach((p, i) => { if (!p.kana) return; if (i % 4 === 0) p.kana = hk(p.kana); else if (i % 4 === 1) p.kana = p.kana.replace(/\s/g, ''); else if (i % 4 === 2) p.kana = p.kana.replace(' ', '　'); });
  if (d.patients[3]) d.patients[3].kana = ''; if (d.systemSettings) d.systemSettings.recordOrder = [];
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); });
for (const sl of ['AM', 'PM']) {
  await page.evaluate((sl) => { try { sessionStorage.setItem('tsumugi_shared_ampm', sl); } catch {} }, sl);
  await go(); const btn = page.locator('button', { hasText: new RegExp('^' + sl + '$') }).first(); if (await btn.count()) { await btn.click(); await page.waitForTimeout(600); }
  const o1 = await order();
  const expect = await page.evaluate((ids) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const key = (p) => String(p.kana || p.name || '').normalize('NFKC').replace(/[\s　]/g, '').replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60)); const ps = ids.map(id => d.patients.find(p => String(p.id) === id)); return [...ps].sort((a, b) => key(a).localeCompare(key(b), 'ja') || String(a.name).localeCompare(String(b.name), 'ja') || String(a.id).localeCompare(String(b.id))).map(p => String(p.id)); }, o1);
  r[`kanaOrder_${sl}`] = o1.length >= 3 && JSON.stringify(o1) === JSON.stringify(expect); if (!r[`kanaOrder_${sl}`]) console.log(sl, o1.join(','), '|', expect.join(','));
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.patients.reverse(); localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); });
  await go(); if (await btn.count()) { await btn.click(); await page.waitForTimeout(600); }
  const o2 = await order(); r[`sameAfterShuffle_${sl}`] = JSON.stringify(o1) === JSON.stringify(o2);
}
// クラス(曜日×午前/午後)ごとの並び順: 今日の午前で保存 → 午前だけ紫・午後と次の日は紫にならない → 午前だけ消せる
const purple = async () => /indigo/.test(await page.getByTestId('rec-order-btn').first().getAttribute('class'));
const slot = async (sl) => { await page.locator('button', { hasText: new RegExp('^' + sl + '$') }).first().click(); await page.waitForTimeout(700); };
await go(); await slot('AM'); const amBefore = await order();
await page.getByTestId('rec-order-btn').first().click(); await page.waitForTimeout(400);
r.classLabel = /曜・午前/.test(await page.getByTestId('rec-order-class').innerText());
// 一番下の方を一番上へ(「上へ」を繰り返す)
// 一番下の「出席」の方(欠席・休止の札が無い行)を一番上へ(「上へ」を繰り返す)。欠席・休止の方は表では下にまとまるので動かしても順が変わらない
const lastIdx = await page.getByTestId('rec-order-row').evaluateAll(rows => { for (let i = rows.length - 1; i >= 0; i--) { if (!/欠席|休止|休業/.test(rows[i].innerText)) return i; } return -1; });
for (let k = lastIdx; k > 0; k--) { await page.getByTestId('rec-order-row').nth(k).locator('button', { hasText: '上へ' }).click(); await page.waitForTimeout(40); }
await page.getByTestId('rec-order-save').click(); await page.waitForTimeout(1000);
const amAfter = await order(); r.amSaved = amAfter[0] === amBefore[amBefore.length - 1] && (await purple());
await slot('PM'); r.pmNotPurple = !(await purple());
const ro = await page.evaluate(() => (JSON.parse(localStorage.getItem('daycareAppData_v3')).systemSettings || {}).recordOrders || {}); r.savedPerClass = Object.keys(ro).length === 1 && /_AM$/.test(Object.keys(ro)[0]);
await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 1); sessionStorage.setItem('__nextIso', `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`); });
const nextIso = await page.evaluate(() => sessionStorage.getItem('__nextIso')); await page.locator('input[type="date"]:visible').first().fill(nextIso); await page.waitForTimeout(1200); await slot('AM');
r.nextDayNotPurple = !(await purple());
await go(); await slot('AM');
await page.getByTestId('rec-order-btn').first().click(); await page.waitForTimeout(400);
r.resetShown = (await page.getByTestId('rec-order-reset').count()) === 1;
if (r.resetShown) { await page.getByTestId('rec-order-reset').click(); await page.waitForTimeout(1200); }
const ro2 = await page.evaluate(() => (JSON.parse(localStorage.getItem('daycareAppData_v3')).systemSettings || {}).recordOrders || {});
r.resetWorks = Object.values(ro2).every(v => Array.isArray(v) && v.length === 0) && JSON.stringify(await order()) === JSON.stringify(amBefore) && !(await purple());
await page.getByTestId('rec-order-btn').first().click(); await page.waitForTimeout(400); r.resetHiddenWhenNone = (await page.getByTestId('rec-order-reset').count()) === 0;
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
