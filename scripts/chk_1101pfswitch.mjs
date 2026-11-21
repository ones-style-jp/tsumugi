// 2026-11-01 ユーザー要望「個人ファイルで別の人を見たいとき、×を押して利用者マスタから選び直すのが手間。個人ファイル内でも利用者名を検索できるように」
//   ①個人ファイルの見出しの名前を押すと小窓(検索欄＋かな行の一覧)が開く ②ふりがなの一部で絞り込める ③選ぶと同じ項目(タブ)のまま、その人の個人ファイルになる(閉じない)
//   ④退所・終了の方は末尾の「退所・終了」に ⑤小窓の外を押すと閉じる。iPad/PC/スマホ
//   実行: node scripts/chk_1101pfswitch.mjs [--port 4175]
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4175'; })();
const b = await chromium.launch(); const r = {};
const open = async (vp, view) => { const ctx = await b.newContext({ viewport: vp, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', ...(vp.width < 768 ? { hasTouch: true, isMobile: true } : {}) }); const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => d.accept());
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  const S = await page.evaluate((v) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const act = d.patients.filter(p => p.status === '利用中' && !p.endDate && p.kana);
    const gone = d.patients.find(p => p.status !== '利用中' || p.endDate) || null; localStorage.setItem('tsumugiSidebarOpen', '0'); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: null, t: Date.now() }));
    return { names: act.map(p => ({ id: p.id, name: p.name, kana: p.kana })), gone: gone && { id: gone.id, name: gone.name } }; }, view);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
  return { ctx, page, S }; };
const openPF = async (page) => { await page.evaluate(() => { const el = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && /^要(介護|支援)\d$/.test((e.textContent || '').trim())); if (el) el.click(); }); await page.waitForTimeout(1200);
  await page.locator('button:visible', { hasText: /個人ファイル/ }).first().click(); await page.waitForTimeout(1200); return page.getByTestId('personal-file-modal').count(); };
for (const [k, vp] of [['ipad', { width: 1180, height: 820 }], ['pc', { width: 1440, height: 900 }], ['phone', { width: 393, height: 820 }]]) {
  const { ctx, page, S } = await open(vp, 'master');
  if (k === 'phone') await page.locator('[data-testid="pin-master-list"] button, button', { hasText: /^要(介護|支援)/ }).first().click().catch(() => {});
  const n = await openPF(page); if (n !== 1) { console.log(k, '個人ファイルが開かない'); r[`${k}_open`] = false; await ctx.close(); continue; }
  const cur = (await page.getByTestId('pf-pt-switch').innerText()).trim(); const curName = cur.replace(/\s*様.*$/, '');
  // 今開いている人と違う人(かなが長めの人)を選ぶ
  const target = S.names.find(p => p.name !== curName && p.kana.length >= 3); if (!target) { console.log(k, '対象なし'); r[`${k}_open`] = false; await ctx.close(); continue; }
  // 2つ目以降のタブを選んでおく(切り替えても同じタブのまま、を見る)
  if (k !== 'phone') { const second = page.locator('[data-testid^="pf-vtab-"]:visible').nth(1); await second.click(); await page.waitForTimeout(500); }
  const tabBefore = k === 'phone' ? '' : (await page.locator('[data-testid^="pf-vtab-"][aria-current="page"]').innerText().catch(() => '')).trim();
  await page.getByTestId('pf-pt-switch').click(); await page.waitForTimeout(400);
  const popShown = (await page.getByTestId('pf-pt-pop').count()) === 1; const allBtns = await page.locator('[data-testid^="pf-pt-pick-"]').count();
  const q = target.kana.slice(1, 3); await page.getByTestId('pf-pt-search').fill(q); await page.waitForTimeout(300);
  const hitBtns = await page.locator('[data-testid^="pf-pt-pick-"]').count(); const hasTarget = (await page.getByTestId(`pf-pt-pick-${target.id}`).count()) === 1;
  const goneLabel = S.gone ? (await page.getByTestId('pf-pt-pop').innerText()).includes('退所・終了') || !(await page.getByTestId(`pf-pt-pick-${S.gone.id}`).count()) : true; // 絞り込みで消えていてもよい
  console.log(k, '今', JSON.stringify(curName), '→', JSON.stringify(target.name), '小窓', popShown, '全員', allBtns, `「${q}」で`, hitBtns, '対象あり', hasTarget);
  await page.getByTestId(`pf-pt-pick-${target.id}`).click(); await page.waitForTimeout(900);
  const after = (await page.getByTestId('pf-pt-switch').innerText()).trim(); const stillOpen = (await page.getByTestId('personal-file-modal').count()) === 1; const popGone = (await page.getByTestId('pf-pt-pop').count()) === 0;
  const tabAfter = k === 'phone' ? '' : (await page.locator('[data-testid^="pf-vtab-"][aria-current="page"]').innerText().catch(() => '')).trim();
  console.log(k, '切替後', JSON.stringify(after), '開いたまま', stillOpen, 'タブ', JSON.stringify(tabBefore), '→', JSON.stringify(tabAfter));
  r[`${k}_switch`] = popShown && allBtns >= 2 && hitBtns < allBtns && hasTarget && after.startsWith(target.name) && stillOpen && popGone && goneLabel && (k === 'phone' || (tabBefore && tabAfter === tabBefore));
  // ⑤ 外を押すと閉じる
  await page.getByTestId('pf-pt-switch').click(); await page.waitForTimeout(300); await page.mouse.click(vp.width - 30, vp.height - 30); await page.waitForTimeout(300);
  r[`${k}_outside`] = (await page.getByTestId('pf-pt-pop').count()) === 0 && (await page.getByTestId('personal-file-modal').count()) === 1;
  if (k === 'pc' && process.env.SHOT_PATH) { await page.getByTestId('pf-pt-switch').click(); await page.waitForTimeout(300); await page.screenshot({ path: process.env.SHOT_PATH }); }
  await ctx.close();
}
await b.close();
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
