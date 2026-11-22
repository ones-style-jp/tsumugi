// 2026-11-22 1122e/trial614(ユーザー「ホームでお知らせを全部既読にしたのに 50 が消えない」):
//   更新内容は日ごとに 1 件(id=upd-day-<日付>)にまとまる。「全て既読」のあと、下のバー(ホーム)の新着バッジが一覧の「新着 N件」ぶん減り、再読み込みしても戻らないこと。
//   node chk/chk_1122badge.mjs --port 4175
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4173'; })();
const b = await chromium.launch(); const r = {};
const notes = { version: 'upd-test', updatedAt: '2026-11-20', prompt: 'all', notes: [
  { id: 'nb3', type: 'update', title: '三つ目', date: '2026-11-20', body: '本文3', items: [{ kind: 'bug', where: '日誌', change: '直した' }] },
  { id: 'nb2', type: 'update', title: '二つ目', date: '2026-11-20', body: '本文2' },
  { id: 'nb1', type: 'info', title: '一つ目', date: '2026-11-19', body: '本文1' } ] };
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', hasTouch: true }); const page = await ctx.newPage(); page.on('dialog', d => d.accept());
page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.route('**/update-notes.json*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(notes) }));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
await page.evaluate(() => { localStorage.setItem('tsumugiSidebarOpen', '0'); const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.noticeReads = {}; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'dashboard', pid: null, t: Date.now() })); });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
const badge = async () => { const el = page.getByTestId('tsu-tab-dashboard-badge'); return (await el.count()) ? parseInt((await el.innerText()).replace('+', ''), 10) : 0; };
const head = page.locator('button', { hasText: /つむぎ運営からのお知らせ/ }).first();
const headTxt = await head.innerText(); const m = headTxt.match(/新着 (\d+)件/); const listUnread = m ? parseInt(m[1], 10) : 0;
const before = await badge(); console.log('一覧の新着:', listUnread, '/ バッジ:', before);
r.hasUnread = listUnread >= 2; // 日ごとのまとめ 2 件(11/20・11/19)+組み込みのお知らせ
r.badgeCountsGroups = before >= listUnread; // バッジは一覧と同じ数え方(日ごと)なので、一覧より少なくはならない
await head.click(); await page.waitForTimeout(500);
if (!(await page.getByTestId('home-dev-row-upd-day-2026-11-20').count())) { await head.click(); await page.waitForTimeout(500); }
r.dayRow = (await page.getByTestId('home-dev-row-upd-day-2026-11-20').count()) === 1;
await page.locator('button:visible', { hasText: /^全て既読$/ }).first().click(); await page.waitForTimeout(1200);
const after = await badge(); console.log('全て既読のあとのバッジ:', after);
r.badgeDrops = after === before - listUnread; // ★ 直す前: 項目ごとの id(nb1〜nb3)を数え続けて減らなかった
r.noUnreadLeft = !/新着 \d+件/.test(await page.locator('button', { hasText: /つむぎ運営からのお知らせ/ }).first().innerText());
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
const again = await badge(); r.staysAfterReload = again === after; if (!r.staysAfterReload) console.log('再読み込み後:', again);
// 古い既読(項目ごとの id)しか無い端末: 中の全部が既読なら、まとめも既読として数えない
await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const k = Object.keys(d.noticeReads || {})[0] || '_'; d.noticeReads = { [k]: (d.noticeReads?.[k] || []).filter(x => !/^upd-day-/.test(x)).concat(['nb1', 'nb2', 'nb3']) }; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
const legacy = await badge(); r.legacyIdsCount = legacy === after; if (!r.legacyIdsCount) console.log('項目ごとの既読だけのとき:', legacy, '期待', after);
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close(); process.exit(Object.values(r).every(Boolean) ? 0 : 1);
