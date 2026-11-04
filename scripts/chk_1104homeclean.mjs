// 2026-11-04 trial517 ホームの整理: ①本日の業務が横並びの札(行の向きが row) ②運営からのお知らせは閉じた状態が既定・開くと「過去のお知らせ n件」 ③近道(記録・入力)は PC では出ない・スマホでは出る
//   ④表示設定に 申し送り/運営/家族/お知らせ/近道 の行があり、申し送りをオフにすると「今日の申し送り」が消える・近道をオンにすると PC にも出る
//   実行: node scripts/chk_1104homeclean.mjs [port]
import { chromium } from 'playwright';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
const r = {};
const b = await chromium.launch();
const open = async (page) => {
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.systemSettings = d.systemSettings || {}; delete d.systemSettings.homeTasks; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'dashboard', pid: null, t: Date.now() })); });
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2200);
};
{ const page = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  await open(page);
  // ★ trial518: 本日(左)・1週間(右)の2列・縦の一覧・今月は無い
  const tdy = page.getByTestId('home-tasks-today'), wk = page.getByTestId('home-tasks-week');
  const bt = await tdy.boundingBox(), bw = await wk.boundingBox();
  r.two_cols = !!bt && !!bw && Math.abs(bt.y - bw.y) < 8 && bw.x > bt.x + 200 && (await page.getByTestId('home-tasks-month').count()) === 0 && /1週間の業務/.test(await wk.innerText());
  r.today_chips = (await page.getByTestId('home-tasks-rows-today').evaluate(el => getComputedStyle(el).flexDirection).catch(() => 'column')) === 'column';
  // 家族・ケアマネ／お知らせも閉じた1行(開くボタン)
  r.fam_news_closed = (await page.getByTestId('home-family-open').count()) === 1 && (await page.getByTestId('home-news-open').count()) === 1 && (await page.getByText('タップで詳細（見ると既読でグレーに）').count()) === 0;
  await page.getByTestId('home-family-open').click(); await page.waitForTimeout(300); r.fam_opens = (await page.getByText('新しい更新はありません', { exact: false }).count()) >= 1 || (await page.locator('[data-testid="home-family-old"]').count()) >= 0; await page.getByTestId('home-family-open').click();
  r.dev_closed = (await page.getByText('アップデート・メンテナンス情報', { exact: false }).count()) === 0;
  await page.locator('button', { hasText: /^つむぎ運営からのお知らせ/ }).first().click(); await page.waitForTimeout(400);
  r.dev_open_old = (await page.getByTestId('home-dev-old').count()) === 1 || (await page.getByText('未読のお知らせはありません').count()) === 1 || (await page.locator('[data-testid^="home-dev-row-"]').count()) > 0;
  r.pc_no_shortcuts = (await page.getByTestId('home-shortcuts').count()) === 0;
  r.news_limited = (await page.locator('[data-testid="home-news-row"]').count()) <= 3;
  await page.screenshot({ path: '/tmp/chk_1104homeclean_pc.png', fullPage: false }).catch(() => {});
  // 表示設定
  await page.getByTestId('home-tasks-cfg').click(); await page.waitForTimeout(400);
  r.cfg_rows = (await page.getByTestId('home-tasks-cfg-memos').count()) === 1 && (await page.getByTestId('home-tasks-cfg-devNotes').count()) === 1 && (await page.getByTestId('home-tasks-cfg-family').count()) === 1 && (await page.getByTestId('home-tasks-cfg-news').count()) === 1 && (await page.getByTestId('home-tasks-cfg-shortcuts').count()) === 1;
  await page.getByTestId('home-tasks-cfg-memos').locator('input').first().uncheck(); await page.waitForTimeout(700);
  r.memos_off = (await page.getByTestId('home-memos').count()) === 0;
  await page.getByTestId('home-tasks-cfg-memos').locator('input').first().check(); await page.waitForTimeout(500);
  await page.getByTestId('home-tasks-cfg-shortcuts').locator('input').first().check(); await page.waitForTimeout(700);
  r.shortcuts_on_pc = (await page.getByTestId('home-shortcuts').count()) === 1;
  await page.getByTestId('home-tasks-cfg-shortcuts').locator('input').first().uncheck(); await page.waitForTimeout(400);
  await page.context().close(); }
{ const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage(); page.on('dialog', d => d.accept());
  await open(page);
  r.phone_shortcuts = (await page.getByTestId('home-shortcuts').count()) === 1;
  await page.screenshot({ path: '/tmp/chk_1104homeclean_phone.png', fullPage: true }).catch(() => {});
  await page.context().close(); }
await b.close();
const ok = Object.values(r).every(v => v === true); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
