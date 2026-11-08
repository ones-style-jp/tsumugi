// 2026-11-08 trial530: 管理局「端末の更新状況」で端末の控えを消す
//   ① 7日以上動いていない端末がある店舗に「7日以上動いていない N 台を消す」・各行に「消す」
//   ② まとめて消す → 20日前の端末が消え(30日前まで表示でも出ない)、ボタンも消える
//   ③ 1台だけ消す → その端末だけ消え、台数の表示が減る
//   実行: node scripts/chk_1108hqdev.mjs [port]   (VITE_E2E_DEMO=1 のビルド・#hqdevices)
import { chromium } from 'playwright';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
const OUT = process.env.S || '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad';
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1000, height: 900 } })).newPage();
page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
const dialogs = []; page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
const now = Date.now(), H = 3600e3, D = 24 * H;
await page.addInitScript(({ now, H, D }) => {
  window.__tsumugiE2E = { stores: [{ id: 's1', name: 'テスト店A' }, { id: 's2', name: 'テスト店B' }],
    syncDiag: [
      { storeId: 's1', devices: [
        { tag: 'dev-a1', name: 'テスト店A1', ver: 'upd-2026-1107a', at: now - 5 * 60e3, sb: true },
        { tag: 'dev-a2', name: 'テスト店A2', ver: 'upd-2026-1107a', at: now - 2 * H, sb: true },
        { tag: 'dev-a9', name: 'テスト店A9', ver: 'upd-2026-1030b', at: now - 9 * D, sb: null },
        { tag: 'dev-a20', name: 'テスト店A20', ver: 'upd-2026-1001-1001a', at: now - 20 * D, sb: null } ] },
      { storeId: 's2', devices: [ { tag: 'dev-b1', name: 'テスト店B1', ver: 'upd-2026-1107a', at: now - 60e3, sb: true } ] } ] };
}, { now, H, D });
await page.goto(`http://localhost:${PORT}/#hqdevices`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
await page.getByTestId('hq-dev-toggle').click(); await page.waitForTimeout(300);
const r = {};
const body = async () => page.locator('body').innerText();
let t = await body();
r.cleanBtn = (await page.getByTestId('hq-dev-clean-s1').count()) === 1 && t.includes('7日以上動いていない 2 台を消す') && (await page.getByTestId('hq-dev-clean-s2').count()) === 0;
r.rowBtns = (await page.getByTestId('hq-dev-del-dev-a1').count()) === 1 && (await page.getByTestId('hq-dev-del-dev-b1').count()) === 1;
r.a9Shown14 = t.includes('テスト店A9') && !t.includes('テスト店A20');
await page.screenshot({ path: `${OUT}/hqdev_1108_before.png`, fullPage: true });
// ② まとめて消す
await page.getByTestId('hq-dev-clean-s1').click(); await page.waitForTimeout(600);
r.confirmText = dialogs.length === 1 && /テスト店Aの端末 2 台の控えを消します/.test(dialogs[0]) && /7日以上動いていない/.test(dialogs[0]);
await page.getByText('30日前まで表示').click(); await page.waitForTimeout(300);
t = await body();
r.staleGone = !t.includes('テスト店A9') && !t.includes('テスト店A20') && t.includes('テスト店A1') && t.includes('テスト店A2') && (await page.getByTestId('hq-dev-clean-s1').count()) === 0 && t.includes('証あり 2 / 2 台');
// ③ 1台だけ消す
await page.getByTestId('hq-dev-del-dev-a2').click(); await page.waitForTimeout(600);
t = await body();
r.oneGone = dialogs.length === 2 && /「テスト店A2」/.test(dialogs[1]) && !t.includes('テスト店A2') && t.includes('テスト店A1') && t.includes('証あり 1 / 1 台') && t.includes('テスト店B1');
await page.screenshot({ path: `${OUT}/hqdev_1108_after.png`, fullPage: true });
console.log(r); const ok = Object.values(r).every(Boolean); console.log(ok ? 'PASS' : 'FAIL'); await b.close(); process.exit(ok ? 0 : 1);
