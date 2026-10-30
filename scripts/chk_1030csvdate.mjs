// 2026-10-30 扇橋店の報告「CSV で利用者マスタを取り込んだら、提供記録入力に一人しか残らない・年齢が出ない」
//   原因: 取り込んだ日付の文字が YYYY-MM-DD でない(和暦・Excel の通し番号など)と、利用開始日より前と判定されて提供記録に出ず、年齢も計算できない
//   ①取込: 「昭和15年5月15日」「45444」「R6.6.1」「1945/6/1」「令和6年6月1日」が YYYY-MM-DD で入る・読めない「不明」は入れずに完了の知らせに出る
//     「認定終了日」の列を利用終了日に取らない(取ると全員が退所済みになる)
//   ②取り込んだ方が提供記録入力(今日)に出る・名前を押すと年齢が出る
//   ③すでに文字のまま入ってしまった方(扇橋店の状態): 開き直すと自動で YYYY-MM-DD にそろい、提供記録入力に出る・読めない文字の方も「日付なし」として出る
//   実行: node scripts/chk_1030csvdate.mjs [--port 4175]
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4175'; })();
const r = {}; const dialogs = [];
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
page.on('dialog', d => { dialogs.push(d.message()); d.accept(); }); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
const go = async (view, extra) => { await page.evaluate(([v, x]) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: null, t: Date.now(), ...(x || {}) })), [view, extra]); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2200); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 400 }).catch(() => {}); };
const data = () => page.evaluate(() => JSON.parse(localStorage.getItem('daycareAppData_v3')));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const DOW = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [] }; d.holidays = []; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); return '日月火水木金土'[new Date().getDay()]; });
// ① 取込
const CSV = ['氏名,フリガナ,性別,生年月日,利用開始日,状態,基本利用曜日（午前）,基本利用曜日（午後）,認定終了日',
  `テスト 日付一,てすと ひづけいち,男性,昭和15年5月15日,45444,利用中,${DOW},,2026-03-31`,
  `テスト 日付二,てすと ひづけに,男性,不明,R6.6.1,利用中,${DOW},,`,
  `テスト 日付三,てすと ひづけさん,女性,1945/6/1,令和6年6月1日,利用中,,${DOW},`].join('\n');
await go('master');
await page.getByTestId('csv-open').click(); await page.waitForTimeout(300); await page.getByTestId('csv-mode-import').click(); await page.waitForTimeout(300);
await page.getByTestId('csv-import-text').fill(CSV); await page.getByTestId('csv-import-go').click(); await page.waitForTimeout(1500);
let D = await data(); const P = (nm) => (D.patients || []).find(p => p.name === nm) || {};
const [p1, p2, p3] = ['テスト 日付一', 'テスト 日付二', 'テスト 日付三'].map(P);
const done = dialogs.find(m => /取り込み完了/.test(m)) || '';
console.log('① 一', JSON.stringify({ b: p1.birthDate, s: p1.startDate, e: p1.endDate || null, cl: p1.careLevelTo }), '二', JSON.stringify({ b: p2.birthDate || null, s: p2.startDate }), '三', JSON.stringify({ b: p3.birthDate, s: p3.startDate }));
console.log('① 知らせ', JSON.stringify(done.split('\n').slice(0, 3)));
r.import = p1.birthDate === '1940-05-15' && p1.startDate === '2024-06-01' && !p1.endDate && p1.careLevelTo === '2026-03-31' && p2.birthDate === undefined && p2.startDate === '2024-06-01' && p3.birthDate === '1945-06-01' && p3.startDate === '2024-06-01';
r.importMsg = /新規 3 件/.test(done) && /日付が読めず入れていません/.test(done) && /テスト 日付二（生年月日: 不明）/.test(done) && !/日付一/.test(done.split('日付が読めず')[1] || '');
// ② 提供記録入力に出る・年齢
await go('record', { ampm: 'AM' });
const shown = {}; for (const p of [p1, p2]) shown[p.name] = (await page.getByTestId(`rv-name-${p.id}`).count()) === 1;
await go('master', { pid: p1.id }); await page.waitForTimeout(500); // 年齢は利用者マスタの基本情報(生年月日の横)で
const modalTxt = await page.evaluate(() => { const i = document.body.innerText.indexOf('生年月日'); return i >= 0 ? document.body.innerText.slice(i, i + 80).replace(/\n/g, ' ') : ''; });
const age1 = (() => { const n = new Date(); let a = n.getFullYear() - 1940; if (n.getMonth() < 4 || (n.getMonth() === 4 && n.getDate() < 15)) a--; return a; })();
console.log('② 出ている', JSON.stringify(shown), '年齢の文字', JSON.stringify(modalTxt.slice(0, 120)), '期待', age1);
r.recordShows = shown[p1.name] && shown[p2.name]; r.age = new RegExp(`${age1}歳`).test(modalTxt);
// ③ すでに文字のまま入っている方(扇橋店の状態)
const X = await page.evaluate((DOW) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const dow = '日月火水木金土'.indexOf(DOW);
  const act = d.patients.filter(p => p.status === '利用中' && !p.endDate && /^テスト 日付/.test(p.name) === false).slice(0, 3); const ids = act.map(p => p.id);
  act[0].birthDate = 'S15.5.15'; act[0].startDate = '45444'; act[0].scheduleAmPm = ['', '', '', '', '', '', '']; act[0].scheduleAmPm[dow] = 'AM';
  act[1].birthDate = '昭和20年6月1日'; act[1].startDate = '2024/6/1'; act[1].careLevelTo = '令和9年3月31日'; act[1].scheduleAmPm = ['', '', '', '', '', '', '']; act[1].scheduleAmPm[dow] = 'AM';
  act[2].birthDate = '不明'; act[2].startDate = 'XX'; act[2].scheduleAmPm = ['', '', '', '', '', '', '']; act[2].scheduleAmPm[dow] = 'AM'; // 読めない文字(残るが「日付なし」として出る)
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); return ids; }, DOW);
await go('record', { ampm: 'AM' }); await page.waitForTimeout(1500);
D = await data(); const H = X.map(id => (D.patients || []).find(p => p.id === id));
const shown3 = []; for (const id of X) shown3.push((await page.getByTestId(`rv-name-${id}`).count()) === 1);
console.log('③ 直した後', JSON.stringify(H.map(p => ({ b: p.birthDate, s: p.startDate, cl: p.careLevelTo || null, ts: !!(p._fieldTs && p._fieldTs.startDate) }))), '出ている', JSON.stringify(shown3));
r.heal = H[0].birthDate === '1940-05-15' && H[0].startDate === '2024-06-01' && H[1].birthDate === '1945-06-01' && H[1].startDate === '2024-06-01' && H[1].careLevelTo === '2027-03-31' && H[2].birthDate === '不明' && H[2].startDate === 'XX';
r.healStamp = !!(H[0]._fieldTs && H[0]._fieldTs.startDate && H[0]._fieldTs.birthDate) && !!(H[0]._savedAt);
r.healShows = shown3.every(Boolean);
await b.close();
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
