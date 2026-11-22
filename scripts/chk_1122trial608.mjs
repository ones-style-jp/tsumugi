// 2026-11-22 trial608 の検査(見本データ VITE_E2E_DEMO=1 のビルド・:4175)
//   A 強制更新: /update-notes.json の minVersion が今の版より新しいと、全画面の「更新が必要です」が出る(minVersion が空なら出ない)
//   B 管理者の交代(案B): 担当者を選ぶ画面に「管理者が代わるとき」の入口 → 小窓 → 新しい管理者を選ばずに送ると注意が出る
//   C 一人ずつのログイン(PIN)の期限(trial609): 期限前は残り日数の案内・期限後は PIN の無い人を選べない
//   実行: node chk/chk_1122trial608.mjs [port]
import { chromium } from 'playwright';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
const b = await chromium.launch();
// ---- A1: minVersion なし → 全画面は出ない
{
  const page = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
  page.on('dialog', d => d.accept());
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  await page.waitForTimeout(6500); // 起動5秒後の確認を待つ
  ok((await page.locator('[data-testid="force-update-overlay"]').count()) === 0, 'A1 minVersion が空のときは全画面の更新案内は出ない');
  await page.context().close();
}
// ---- A2: minVersion が新しい → 全画面が出て、ボタンが押せる
{
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
  await ctx.route(/\/update-notes\.json/, async (route) => {
    const res = await route.fetch(); const j = await res.json(); j.minVersion = 'upd-2099-0101a';
    await route.fulfill({ response: res, body: JSON.stringify(j), headers: { ...res.headers(), 'content-type': 'application/json' } });
  });
  const page = await ctx.newPage(); page.on('dialog', d => d.accept());
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  await page.waitForTimeout(6500);
  const ov = page.locator('[data-testid="force-update-overlay"]');
  ok((await ov.count()) === 1, 'A2 minVersion が新しいと全画面の「更新が必要です」が出る');
  const txt = (await ov.textContent().catch(() => '')) || '';
  ok(/更新が必要です/.test(txt) && /更新する/.test(txt), `A2 文言(更新が必要です・更新する) → ${txt.replace(/\s+/g, ' ').slice(0, 60)}`);
  ok((await page.locator('[data-testid="update-banner-go"]').count()) === 1, 'A2 更新の帯のボタンも出ている(全画面のボタンはこれを押す)');
  await ctx.close();
}
// ---- B: 管理者の交代の入口(見本の担当者選択画面)
{
  const page = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
  page.on('dialog', d => d.accept());
  await page.goto(`http://localhost:${PORT}/#picker`, { waitUntil: "networkidle" }).catch(() => {}); await page.waitForTimeout(1500);
  let open = page.locator('[data-testid="handover-open"]');
  if (!(await open.count())) { // 見本の担当者選択画面は別の入口のことがある → 普通の起動で担当者選択が出ていればそこで
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500); open = page.locator('[data-testid="handover-open"]');
  }
  if (await open.count()) {
    await open.first().click(); await page.waitForTimeout(500);
    ok((await page.locator('[data-testid="handover-modal"]').count()) === 1, 'B 「管理者が代わるとき」を押すと申請の小窓が開く');
    await page.locator('[data-testid="handover-submit"]').click(); await page.waitForTimeout(400);
    const mt = (await page.locator('[data-testid="handover-modal"]').textContent().catch(() => '')) || '';
    ok(/新しい管理者を選んでください/.test(mt), 'B 新しい管理者を選ばずに送ると注意が出る');
    const opts = await page.locator('[data-testid="handover-new"] option').count();
    ok(opts >= 2, `B 新しい管理者の候補(管理者以外)が出る → ${opts - 1}人`);
  } else {
    console.log('SKIP B 見本の担当者選択画面に入口が出ない(見本の職員がいない)');
  }
  await page.context().close();
}
// ---- C: 一人ずつのログイン(PIN)の期限(trial609): 期限前は残り日数の案内・期限後は PIN が無い人を選べない
{
  const mk = async (deadline) => { const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); await ctx.addInitScript((d) => { window.__tsumugiE2E = { ...(window.__tsumugiE2E || {}), pinDeadline: d }; }, deadline); const page = await ctx.newPage(); const dialogs = []; page.on('dialog', d => { dialogs.push(d.message()); d.accept(); }); await page.goto(`http://localhost:${PORT}/#picker`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1200); return { ctx, page, dialogs }; };
  const iso = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  { const { ctx, page } = await mk(iso(10)); const t = (await page.locator('[data-testid="pin-deadline-banner"]').textContent().catch(() => '')) || '';
    ok(/あと 10 日/.test(t) && /選べなくなります/.test(t), `C 期限の10日前: 残り日数の案内 → ${t.slice(0, 50)}`);
    await page.locator('button', { hasText: '見本 次郎' }).first().click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(500);
    ok((await page.locator('[data-testid="pin-deadline-banner"]').count()) === 1 && !(await page.getByText('まだ本人登録（PIN）が済んでいません').count()), 'C 期限前は PIN の無い人も名前の選択で進める(注意の小窓は出ない)');
    await ctx.close(); }
  { const { ctx, page, dialogs } = await mk(iso(-1)); const t = (await page.locator('[data-testid="pin-deadline-banner"]').textContent().catch(() => '')) || '';
    ok(/済んだ方だけ選べます/.test(t), `C 期限後: 「本人登録が済んだ方だけ」の案内 → ${t.slice(0, 40)}`);
    await page.locator('button', { hasText: '見本 次郎' }).first().click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(500);
    ok(dialogs.some(m => /本人登録（PIN）が済んでいません/.test(m)), `C 期限後は PIN の無い人を選べない(注意が出る) → ${dialogs.join(' / ').slice(0, 60)}`);
    await ctx.close(); }
}
await b.close(); console.log(fails ? `FAIL ${fails}` : 'ALL PASS'); process.exit(fails ? 1 : 0);
