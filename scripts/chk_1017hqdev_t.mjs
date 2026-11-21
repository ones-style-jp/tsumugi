// 管理局「端末の更新状況」: 店舗ごとの端末一覧・証あり/証なし/古い版 の判定・14日/30日の切替
import { chromium } from 'playwright';
const OUT = '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad';
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1000, height: 900 } })).newPage();
page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
const now = Date.now(), H = 3600e3, D = 24 * H;
await page.addInitScript(({ now, H, D }) => {
  window.__tsumugiE2E = { stores: [{ id: 's1', name: 'テスト店A' }, { id: 's2', name: 'テスト店B' }, { id: 's3', name: 'テスト店C' }],
    syncDiag: [
      { storeId: 's1', devices: [
        { tag: 'iPad1|upd-2026-1017-trial313', name: 'iPad1', ver: 'upd-2026-1017-trial313', at: now - 5 * 60e3, sb: true },
        { tag: 'iPad2|upd-2026-1017-trial313', name: 'iPad2', ver: 'upd-2026-1017-trial313', at: now - 2 * H, sb: false },
        { tag: '事務PC|upd-2026-1016-1016h', name: '事務PC', ver: 'upd-2026-1016-1016h', at: now - 3 * D, sb: null },
        { tag: '旧iPad|upd-2026-1001-1001a', name: '旧iPad', ver: 'upd-2026-1001-1001a', at: now - 20 * D, sb: null } ] },
      { storeId: 's2', devices: [ { tag: 'iPad|upd-2026-1017-trial313', name: 'iPad', ver: 'upd-2026-1017-trial313', at: now - 60e3, sb: true } ] } ] };
}, { now, H, D });
await page.goto('http://localhost:4185/#hqdevices', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
// 折りたたみ: 最初は見出しと集計だけ(表は出ない)
const txt0 = await page.locator('body').innerText();
const collapsed = txt0.includes('直近14日に動いた端末 4 台のうち 証あり 2 台') && !txt0.includes('iPad1') && !txt0.includes('30日前まで表示');
await page.getByTestId('hq-dev-toggle').click(); await page.waitForTimeout(300);
const txt = await page.locator('body').innerText();
const has = (t) => txt.includes(t);
const checks = {
  collapsed_default: collapsed,
  header_total: has('直近14日に動いた端末 4 台のうち 証あり 2 台'),
  storeA_ratio: has('証あり 1 / 3 台'),
  storeB_all: has('証あり 1 / 1 台'),
  storeC_none: has('直近の端末なし'),
  sb_true: has('証あり') && has('iPad1'),
  sb_false: has('証なし（ログインし直し）'),
  old_ver: has('古い版（証なし）') && has('事務PC'),
  ver_short: has('trial313') && has('1016h') && !has('upd-2026-1017-trial313'),
  ago: has('5分前') && has('2時間前') && has('3日前'),
  old_hidden: !has('旧iPad'),
};
await page.screenshot({ path: `${OUT}/hqdev_14.png`, fullPage: true });
await page.getByText('30日前まで表示').click(); await page.waitForTimeout(300);
const txt2 = await page.locator('body').innerText();
checks.old_shown = txt2.includes('旧iPad') && txt2.includes('証あり 1 / 4 台') && txt2.includes('直近30日');
await page.screenshot({ path: `${OUT}/hqdev_30.png`, fullPage: true });
console.log(checks); console.log(Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL');
await b.close();
