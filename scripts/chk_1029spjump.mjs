// 2026-10-29 ユーザー要望:
//   ・提供記録入力で名前を押したときの行き先に「基本情報」「運動メニュー(利用者マスタのサービス提供内容)」「支援経過表」を足す。モニタリングは外す
//   ・支援経過表: 年に加えて月で絞り込む / 行を追加は表の下(上は古い記録) / ファイルの添付は表の下 / いちばん下へ飛ぶボタン
//   ①行き先が8つ(基本情報・月間スケジュール・運動メニュー・個人ファイル・支援経過表・サービス提供記録・体力測定・分析（個人）)・モニタリングなし
//   ②基本情報 → 利用者マスタの基本情報 ③運動メニュー → サービス提供内容の運動メニューが画面に見える ④支援経過表 → 個人ファイルの支援経過表
//   ⑤月で絞り込める(件数どおり) ⑥ファイルの添付は表の下 ⑦「いちばん下へ」で行を追加が画面に見える ⑧行を追加 → 足した行の内容の欄に入っている・上の帯に行を追加はない
//   実行: node scripts/chk_1029spjump.mjs [--port 4175]
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4175'; })();
const r = {};
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept());
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const pid = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const dow = new Date().getDay(); d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [] }; d.holidays = [];
  const ps = d.patients.filter(p => p.status === '利用中' && !p.endDate); ps.forEach((p, i) => { p.scheduleAmPm = ['', '', '', '', '', '', '']; if (i < 3) p.scheduleAmPm[dow] = 'AM'; p.pauseHistory = []; });
  const P = ps[0]; P.personalFile = P.personalFile || {}; const y = new Date().getFullYear();
  P.personalFile.supportProgress = [{ id: 'sp_t1', date: `${y}-03-05`, staff: '見本 職員', from: '', content: '3月の見本の記録' }, { id: 'sp_t2', date: `${y}-03-20`, staff: '見本 職員', from: '', content: '3月の見本の記録2' }, { id: 'sp_t3', date: `${y}-06-10`, staff: '見本 職員', from: '', content: '6月の見本の記録' }];
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0');
  sessionStorage.setItem('tsumugiActiveRecorder', JSON.stringify({ id: 'demo_rec', name: '見本 職員', roleLabel: '介護職員' })); return P.id; });
const toRecord = async () => { await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'record', pid: null, ampm: 'AM', t: Date.now() }))); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2200); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 400 }).catch(() => {}); };
const openNav = async () => { await page.getByTestId(`rv-name-${pid}`).first().click(); await page.waitForTimeout(500); };
await toRecord(); await openNav();
const labels = await page.locator('[data-testid="pt-nav"] button').allInnerTexts(); console.log('行き先', JSON.stringify(labels.map(x => x.trim())));
r.navs = JSON.stringify(labels.map(x => x.trim())) === JSON.stringify(['基本情報', '月間スケジュール', '運動メニュー', '個人ファイル', '支援経過表', 'サービス提供記録', '体力測定', '分析（個人）']);
// ② 基本情報
await page.getByTestId('pt-nav-basic').click(); await page.waitForTimeout(1500);
r.basic = await page.evaluate(() => { const t = [...document.querySelectorAll('button')].find(x => x.innerText.trim() === '基本情報' && /border-blue-600/.test(x.className)); return !!t; });
// ③ 運動メニュー
await toRecord(); await openNav(); await page.getByTestId('pt-nav-exercise').click(); await page.waitForTimeout(1800);
r.exercise = await page.evaluate(() => { const el = document.querySelector('[data-testid="pe-exmenu"]'); if (!el) return false; const rc = el.getBoundingClientRect(); return rc.top >= 0 && rc.top < window.innerHeight - 100; });
// ④ 支援経過表
await toRecord(); await openNav(); await page.getByTestId('pt-nav-support').click(); await page.waitForTimeout(2200);
r.support = await page.locator('[data-testid="sp-months"]').count() > 0;
// ⑤ 月で絞り込む(ボタンの件数と表の行数が合い、出た行はすべてその月。記録のない月は押せない)
const rowsN = () => page.evaluate(() => document.querySelectorAll('[data-sp-id]').length);
const monthsOk = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="sp-month-"]')].map(x => ({ m: +x.dataset.testid.replace('sp-month-', ''), n: +((x.innerText.match(/（(\d+)）/) || [])[1] || 0), dis: x.disabled })));
let monthOk = monthsOk.length === 12 && monthsOk.every(x => (x.n === 0) === x.dis);
for (const mm of monthsOk.filter(x => x.n > 0).slice(0, 3)) {
  await page.getByTestId(`sp-month-${mm.m}`).click(); await page.waitForTimeout(300);
  const got = await page.evaluate((m) => { const rows = [...document.querySelectorAll('[data-sp-id]')]; const ds = rows.map(r => { const i = r.querySelector('input[type="date"]'); return i ? i.value : ''; }); return { n: rows.length, allIn: ds.every(d => +d.slice(5, 7) === m) }; }, mm.m);
  console.log(`${mm.m}月 ボタン${mm.n}件 表${got.n}行 その月だけ`, got.allIn); if (got.n !== mm.n || !got.allIn) monthOk = false; }
await page.locator('[data-testid="sp-months"] button', { hasText: /^すべて/ }).click(); await page.waitForTimeout(300);
const all = await rowsN(); console.log('すべて', all); r.month = monthOk && all >= 3 && monthsOk.some(x => x.m === 3 && x.n >= 2);
// ⑥ ファイルの添付は表の下
const pos = await page.evaluate(() => { const f = document.querySelector('[data-testid="pf-files"]'); const a = document.querySelector('[data-testid="sp-add-bottom"]'); return f && a ? { files: Math.round(f.getBoundingClientRect().top), add: Math.round(a.getBoundingClientRect().top) } : null; });
console.log('位置', JSON.stringify(pos)); r.filesBelow = !!pos && pos.files > pos.add;
// ⑦ いちばん下へ
await page.getByTestId('sp-jump-bottom').click(); await page.waitForTimeout(900);
r.jump = await page.evaluate(() => { const a = document.querySelector('[data-testid="sp-add-bottom"]'); const rc = a.getBoundingClientRect(); return rc.top >= 0 && rc.bottom <= window.innerHeight; });
r.noTopAdd = await page.evaluate(() => [...document.querySelectorAll('button')].filter(x => /行を追加/.test(x.innerText)).length === 1);
// ⑧ 行を追加
const before = await rowsN(); await page.getByTestId('sp-add-bottom').click(); await page.waitForTimeout(900);
const after = await rowsN(); const foc = await page.evaluate(() => { const a = document.activeElement; return !!(a && a.tagName === 'TEXTAREA' && a.closest('[data-sp-id]')); });
const lastIsNew = await page.evaluate(() => { const rows = [...document.querySelectorAll('[data-sp-id]')]; const last = rows[rows.length - 1]; return !!last && /^sp_\d/.test(last.getAttribute('data-sp-id')) && last.getAttribute('data-sp-id') !== 'sp_t3'; });
console.log('行', before, '→', after, '内容の欄に入っている', foc, 'いちばん下が新しい行', lastIsNew); r.add = after === before + 1 && foc && lastIsNew;
await b.close();
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
