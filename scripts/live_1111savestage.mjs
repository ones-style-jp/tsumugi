// 2026-11-11 trial561: テスト店舗(試験版)で手で保存したときの表示の段階と時間 — 65秒休ませてから申し送りを保存し、
//   「最新の内容を確かめています」→「クラウドに保存しています」→「✓ 保存しました」の順と、診断ログ push-time {pullMs,pushMs} を見る。画面からログイン
//   LIVE_URL=https://tsumugi-git-trial-ones-style.vercel.app node scripts/live_1111savestage.mjs
import { chromium } from 'playwright';
const BASE = (process.env.LIVE_URL || 'https://tsumugi-git-trial-ones-style.vercel.app').replace(/\/$/, '');
const b = await chromium.launch(); const r = {};
const open = async (tag, view) => {
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept());
  const _tg = Date.now(); await page.goto(BASE + '/', { waitUntil: 'load', timeout: 180000 }); console.log(tag, 'page load', Math.round((Date.now() - _tg) / 1000) + 's'); await page.waitForTimeout(4000);
  await page.evaluate(() => { localStorage.setItem('tsumugiSidebarOpen', '0'); localStorage.setItem('tsumugiDeviceName', 'live-guard-' + Math.random().toString(36).slice(2, 6)); });
  await page.locator('input[autocomplete^="username"]').first().fill('test'); await page.locator('input[autocomplete="current-password"]').first().fill('testoooo');
  await page.locator('button[type=submit]:visible, button:visible:has-text("ログイン")').first().click(); await page.waitForTimeout(7000);
  // 「どなたですか」→ 試験 管理者 → 管理者パスワード(出たら) を、画面が落ち着くまで繰り返す
  // 「どなたですか」→ 試験 管理者 → 管理者パスワード(出たら test1234) を、画面が落ち着くまで繰り返す
  const settle = async () => { for (let i = 0; i < 6; i++) {
    const body = await page.locator('body').innerText();
    if (/管理者パスワードを入力/.test(body)) {
      const inp = page.locator('input[type=password]:visible, input[type=text]:visible, input:not([type]):visible').last();
      await inp.fill('test1234'); await page.waitForTimeout(200); await inp.press('Enter'); await page.waitForTimeout(1500);
      await page.locator('button:visible', { hasText: /^(入る|確認|OK|ログイン|決定)$/ }).first().click({ timeout: 800 }).catch(() => {}); await page.waitForTimeout(4000);
      console.log(tag, 'after pw:', (await page.locator('body').innerText()).slice(0, 100).replace(/\n+/g, ' / ')); continue;
    }
    if (/どなたですか/.test(body)) { const el = page.locator('button:visible', { hasText: /試験 管理者/ }).first(); if (await el.count()) { await el.evaluate(b => b.click()); await page.waitForTimeout(3000); continue; } }
    if (/この端末の名前/.test(body)) { const inp = page.locator('input[type=text]:visible, input:not([type]):visible').first(); if (await inp.count()) { await inp.fill('live-guard-' + tag); await page.waitForTimeout(200); } await page.locator('button:visible', { hasText: /この名前で保存/ }).first().click({ timeout: 1500 }).catch(() => {}); await page.waitForTimeout(3000); continue; }
    if (!/どなたですか|パスワード|この端末の名前/.test(body)) break; await page.waitForTimeout(3000); } };
  // 店舗のデータが端末に入るまで待つ(最大40秒)
  const waitData = async () => { for (let i = 0; i < 20; i++) { const n = await page.evaluate(() => { try { return (JSON.parse(localStorage.getItem('daycareAppData_v3') || '{}').patients || []).length; } catch { return 0; } }); if (n > 0) return n; await page.waitForTimeout(2000); } return 0; };
  await settle();
  if (view) { await page.evaluate((v) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: null, t: Date.now() })), view); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(6000); await settle(); }
  await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
  await settle(); console.log(tag, 'patients in device:', await waitData());
  console.log(tag, 'screen:', (await page.locator('body').innerText()).slice(0, 60).replace(/\n/g, ' / '));
  return { ctx, page }; };
const state = (page) => page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3') || '{}'); return { n: (d.patients || []).length, ids: (d.patients || []).map(p => p.id), seq: d.patientIdSeq, names: (d.patients || []).map(p => p.name) }; });
const slog = (page) => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('tsumugiSyncLog') || '[]').slice(-40).map(x => `${x.t} ${x.ev}${x.d ? ' ' + JSON.stringify(x.d).slice(0, 60) : ''}`); } catch { return []; } });

const toastText = (page) => page.evaluate(() => { const els = [...document.querySelectorAll('[role="status"], .tsu-toast, [data-testid="toast"]')]; const t = els.map(e => e.innerText || '').filter(Boolean).join(' | '); return t || [...document.querySelectorAll('div')].filter(d => /保存しています|確かめています|保存しました/.test(d.textContent || '') && d.children.length <= 2).map(d => d.textContent.trim()).slice(-1).join(''); });
const A = await open('A', 'dashboard');
console.log('65秒 休ませる(眠っていた端末の扱いにする)'); await A.page.waitForTimeout(65000);
await A.page.getByTestId('home-memo-add').click(); await A.page.waitForTimeout(500); await A.page.getByTestId('memo-text').fill('保存の表示の検査(消してよい)');
const seen = []; const t0 = Date.now();
await A.page.getByTestId('memo-save').click();
for (let i = 0; i < 300; i++) { const t = await toastText(A.page); if (t && (!seen.length || seen[seen.length - 1].t !== t)) seen.push({ t, at: Date.now() - t0 }); if (/保存しました|できませんでした/.test(t)) break; await A.page.waitForTimeout(200); }
console.log('toast sequence:'); seen.forEach(x => console.log(`  ${String(x.at).padStart(6)}ms  ${x.t}`));
const lg = await slog(A.page); console.log('log tail:\n  ' + lg.filter(x => /push-time|push-stale|push-ok|cas-conflict|push-noop/.test(x)).join('\n  '));
r.stage_pull = true; r.stage_pull_seen = seen.some(x => /最新の内容を確かめています/.test(x.t)); // 起きている端末は定期的にクラウドを確かめているので「先に取り込む」は出ないことが多い(参考値)
r.stage_push = seen.some(x => /クラウドに保存しています/.test(x.t));
r.done = seen.some(x => /✓ .*保存しました/.test(x.t));
r.push_time_logged = lg.some(x => /push-time/.test(x));
// 片付け: いま入れた申し送りを削除
try { const row = A.page.locator('[data-testid^="memo-row-"]', { hasText: '保存の表示の検査' }).first(); if (await row.count()) { await row.click(); await A.page.waitForTimeout(400); await A.page.locator('button:visible', { hasText: /^削除$/ }).first().click({ timeout: 1500 }); await A.page.waitForTimeout(3000); } } catch (e) { console.log('cleanup skipped', String(e).slice(0, 80)); }
console.log(r); await b.close(); process.exit(Object.values(r).every(Boolean) ? 0 : 1);
