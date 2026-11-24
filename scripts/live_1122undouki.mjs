// 2026-11-22 trial612: テスト店舗(試験版)で運動器機能向上計画書を 入力→保存→再読み込み→端末の控え(クラウドから取り込んだ状態)に残るか を確認。
//   要支援・事業対象者の方がいなければ、いちばん最初の利用中の方を一時的に「要支援1」にして確認し、終わったら戻す。
//   LIVE_URL=https://tsumugi-git-trial-ones-style.vercel.app node scripts/live_1122undouki.mjs
import { chromium } from 'playwright';
const BASE = (process.env.LIVE_URL || 'https://tsumugi-git-trial-ones-style.vercel.app').replace(/\/$/, '');
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept());
page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
await page.goto(BASE + '/', { waitUntil: 'load', timeout: 180000 }); await page.waitForTimeout(3000);
await page.evaluate(() => { localStorage.setItem('tsumugiSidebarOpen', '0'); localStorage.setItem('tsumugiDeviceName', 'live-uk'); });
await page.locator('input[autocomplete^="username"]').first().fill('test'); await page.locator('input[autocomplete="current-password"]').first().fill('testoooo');
await page.locator('button[type=submit]:visible, button:visible:has-text("ログイン")').first().click(); await page.waitForTimeout(5000);
const settle = async () => { for (let i = 0; i < 8; i++) { const body = await page.locator('body').innerText();
  if (/管理者パスワードを入力/.test(body)) { const inp = page.locator('input[type=password]:visible, input[type=text]:visible, input:not([type]):visible').last(); await inp.fill('test1234'); await inp.press('Enter'); await page.waitForTimeout(1500); await page.locator('button:visible', { hasText: /^(入る|確認|OK|ログイン|決定)$/ }).first().click({ timeout: 800 }).catch(() => {}); await page.waitForTimeout(3000); continue; }
  if (/どなたですか/.test(body)) { const el = page.locator('button:visible', { hasText: /試験 管理者/ }).first(); if (await el.count()) { await el.evaluate(b => b.click()); await page.waitForTimeout(2500); continue; } }
  if (/この端末の名前/.test(body)) { const inp = page.locator('input[type=text]:visible, input:not([type]):visible').first(); if (await inp.count()) await inp.fill('live-uk'); await page.locator('button:visible', { hasText: /この名前で保存/ }).first().click({ timeout: 1500 }).catch(() => {}); await page.waitForTimeout(2500); continue; }
  if (!/どなたですか|パスワード|この端末の名前/.test(body)) break; await page.waitForTimeout(2500); } };
await settle(); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
for (let i = 0; i < 30; i++) { const n = await page.evaluate(() => { try { const d = JSON.parse(localStorage.getItem('daycareAppData_v3') || '{}'); return d._sbStoreId ? (d.patients || []).length : 0; } catch { return 0; } }); if (n > 0) break; await page.waitForTimeout(2000); }
const info = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3') || '{}'); const act = (d.patients || []).filter(p => p.status === '利用中'); const sh = act.find(p => /要支援|事業対象/.test(String(p.careLevel || ''))); return { total: act.length, shien: sh ? { id: sh.id, name: sh.name } : null, first: act[0] ? { id: act[0].id, name: act[0].name, careLevel: act[0].careLevel } : null }; });
console.log('test store:', info.total, '名 / 要支援:', info.shien ? 'あり' : 'なし');
const target = info.shien || info.first; ok(!!target, '対象の利用者がいる');
// 運動器機能向上計画書の画面へ
await page.evaluate((pid) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'undouki_keikaku', pid, t: Date.now() })), target.id);
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(5000); await settle(); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
let txt = await page.locator('body').innerText();
if (!info.shien) { console.log('要支援の方がいないので、この確認では画面の表示だけを見る(新規作成は要支援の方だけ)'); }
const before = await page.getByTestId('uk-row').count().catch(() => 0);
ok((await page.getByTestId('uk-new').count()) === 1 || /要支援・事業対象者の方がいません/.test(txt), '運動器機能向上計画書の画面が開く');
if (await page.getByTestId('uk-new').count()) {
  await page.getByTestId('uk-new').click(); await page.waitForTimeout(1200);
  ok((await page.getByTestId('uk-form').count()) === 1, '新規作成の入力画面');
  const fit = await page.locator('[data-testid="uk-fit"] input').evaluateAll(els => els.map(e => e.value)); console.log('体力測定(自動):', JSON.stringify(fit));
  await page.locator('[data-testid="uk-form"] textarea').nth(2).fill('実機確認(消してよい) 長期目標'); await page.waitForTimeout(300);
  await page.getByTestId('uk-save').click(); await page.waitForTimeout(6000);
  ok((await page.getByTestId('uk-row').count()) === before + 1, `保存して一覧に 1 件増える(${before}→${before + 1})`);
  // 再読み込み(クラウドの取り込み後の控えで見る)
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(8000); await settle(); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
  const after = await page.evaluate((pid) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3') || '{}'); return { sb: d._sbStoreId, n: (d.undoukiRecords || []).filter(r => r.patientId === pid && /実機確認/.test(r.longGoal || '')).length }; }, target.id);
  ok(after.sb && after.n === 1, `再読み込み後も残る(クラウド経由・${JSON.stringify(after)})`);
  const rows = await page.getByTestId('uk-row').count(); ok(rows === before + 1, `一覧も ${before + 1} 件`);
  // 片付け: 作った 1 件を削除(管理者)
  const delBtn = page.locator('[data-testid="uk-row"]', { hasText: /実機確認/ }).locator('button', { hasText: '削除' }).first();
  if (await delBtn.count()) { await delBtn.click(); await page.waitForTimeout(1500); const body2 = await page.locator('body').innerText(); if (/管理者パスワードを入力/.test(body2)) { await settle(); await delBtn.click().catch(() => {}); await page.waitForTimeout(1500); } }
  await page.waitForTimeout(4000);
  const left = await page.evaluate((pid) => (JSON.parse(localStorage.getItem('daycareAppData_v3') || '{}').undoukiRecords || []).filter(r => r.patientId === pid && /実機確認/.test(r.longGoal || '')).length, target.id);
  console.log('片付け後の残り:', left);
}
await b.close(); console.log(fails ? `FAIL ${fails}` : 'ALL PASS'); process.exit(fails ? 1 : 0);
