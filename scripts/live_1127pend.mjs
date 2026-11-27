// 2026-11-27 trial651: テスト店舗・実機相当 — 個人ファイルで「変えてすぐ再読み込み」「削除してすぐ再読み込み」しても元に戻らない
//   ① A が個人ファイル(サービス提供票)に検査の PDF を入れる(保存を待つ) ② 題名を変えて、すぐ再読み込み → 開き直しても題名が残る
//   ③ 削除を押して、すぐ再読み込み → 開き直しても消えたまま(ゴミ箱にある)。同期の記録に pend-resend(boot) / pend-resend-ok
//   ④ 新しい端末 C でも、題名の変更と削除が見える ⑤ ふつうに保存して待つと控えが消える・右上の印 ⑥ 片付け: ゴミ箱から完全に削除
//   LIVE_URL=https://tsumugi-git-trial-ones-style.vercel.app node scripts/live_1127pend.mjs [--delay=300] [--cleanup-only]
import { chromium } from 'playwright';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const BASE = (process.env.LIVE_URL || 'https://tsumugi-git-trial-ones-style.vercel.app').replace(/\/$/, '');
const b = await chromium.launch(); const r = {};
const open = async (tag, view) => {
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept());
  await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
  await page.evaluate(() => { localStorage.setItem('tsumugiSidebarOpen', '0'); localStorage.setItem('tsumugiDeviceName', 'live-pend-' + Math.random().toString(36).slice(2, 6)); });
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
    if (/この端末の名前/.test(body)) { const inp = page.locator('input[type=text]:visible, input:not([type]):visible').first(); if (await inp.count()) { await inp.fill('live-pend-' + tag); await page.waitForTimeout(200); } await page.locator('button:visible', { hasText: /この名前で保存/ }).first().click({ timeout: 1500 }).catch(() => {}); await page.waitForTimeout(3000); continue; }
    if (!/どなたですか|パスワード|この端末の名前/.test(body)) break; await page.waitForTimeout(3000); } };
  // 店舗のデータが端末に入るまで待つ(最大40秒)
  const waitData = async () => { for (let i = 0; i < 20; i++) { const n = await page.evaluate(() => { try { return (JSON.parse(localStorage.getItem('daycareAppData_v3') || '{}').patients || []).length; } catch { return 0; } }); if (n > 0) return n; await page.waitForTimeout(2000); } return 0; };
  await settle();
  if (view) { await page.evaluate((v) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: null, t: Date.now() })), view); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(6000); await settle(); }
  await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
  await settle(); console.log(tag, 'patients in device:', await waitData());
  console.log(tag, 'screen:', (await page.locator('body').innerText()).slice(0, 60).replace(/\n/g, ' / '));
  return { ctx, page }; };
const b0 = b;
const PID = Number(process.env.LIVE_PID || 23); const CLEAN_ONLY = process.argv.includes('--cleanup-only');
const DELAY = Number((process.argv.find(a => a.startsWith('--delay=')) || '--delay=300').split('=')[1]);
const R = []; const ok = (n, c, d) => { R.push([n, !!c]); console.log((c ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? ' ' + JSON.stringify(d) : '')); };
const slog = (page, n = 60) => page.evaluate((n) => { try { return JSON.parse(localStorage.getItem('tsumugiSyncLog') || '[]').slice(-n).map(x => `${x.t} ${x.ev}${x.d ? ' ' + JSON.stringify(x.d).slice(0, 90) : ''}`); } catch { return []; } }, n);
const setPF = (page) => page.evaluate((pid) => { sessionStorage.setItem('tsumugiReopenPF', JSON.stringify({ patientId: pid, tab: 'cat_teikyohyo' })); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'master', pid, t: Date.now() })); }, PID);
const afterBoot = async (page, ms = 9000) => { await page.waitForTimeout(ms); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {}); };
const openPF = async (page) => { await setPF(page); await page.reload({ waitUntil: 'domcontentloaded' }); await afterBoot(page);
  const M = page.locator('[data-testid="personal-file-modal"]'); if (!(await M.count())) { console.log('PF not open:', (await page.locator('body').innerText()).slice(0, 120).replace(/\n+/g, ' / ')); return false; }
  const tab = M.locator('button', { hasText: /^\s*サービス提供票\s*$/ }).first(); const cls = await tab.getAttribute('class').catch(() => ''); if (!/border-emerald-600/.test(cls || '')) { await tab.click().catch(() => {}); await page.waitForTimeout(600); } return true; };
// 画面の「ファイル」の行(検査の PDF だけ)。題名と、端末のデータ(files/trash)
const rows = (page) => page.evaluate(() => { const box = document.querySelector('[data-testid="pf-files"]'); if (!box) return null; return [...box.querySelectorAll('input[placeholder="タイトル"]')].map(i => i.value).filter(v => /検査pend|tsu_pend_test/.test(v)); });
const dataOf = (page) => page.evaluate((pid) => { try { const d = JSON.parse(localStorage.getItem('daycareAppData_v3') || '{}'); const p = (d.patients || []).find(x => x.id === pid); const f = (p && p.personalFile) || {}; const hit = x => /tsu_pend_test/.test(x.name || '');
  return { files: (f.files || []).filter(hit).map(x => x.title || x.name), trash: (f.trash || []).filter(hit).length }; } catch (e) { return { err: String(e) }; } }, PID);
const pend = (page) => page.evaluate(() => new Promise(res => { try { const r = indexedDB.open('tsumugi-pending', 1); r.onupgradeneeded = () => { try { r.result.createObjectStore('push'); } catch {} }; r.onsuccess = () => { try { const tx = r.result.transaction('push', 'readonly'); const q = tx.objectStore('push').getAll(); q.onsuccess = () => { res((q.result || []).map(x => ({ kind: x.kind || '', age: Math.round((Date.now() - (x.at || 0)) / 1000) }))); r.result.close(); }; q.onerror = () => res('err'); } catch (e) { res('err ' + e); } }; r.onerror = () => res('openerr'); } catch (e) { res('x ' + e); } }));
const pill = (page) => page.evaluate(() => { const e = document.querySelector('[data-testid="push-pill"]'); return e ? e.getAttribute('data-st') : ''; });
const toast = (page) => page.evaluate(() => { const e = document.querySelector('[data-testid="save-toast"]'); return e ? e.innerText.replace(/\s+/g, ' ').slice(0, 60) : ''; });
// 押した直後から、印とお知らせの文を 0.1 秒ごとに拾う
const watch = async (page, ms) => { const seen = { pill: new Set(), toast: new Set() }; const t0 = Date.now(); while (Date.now() - t0 < ms) { const p = await pill(page).catch(() => ''); const t = await toast(page).catch(() => ''); if (p) seen.pill.add(p); if (t) seen.toast.add(t); await page.waitForTimeout(100); } return { pill: [...seen.pill], toast: [...seen.toast] }; };
const idle = async (page, ms = 40000) => { const t0 = Date.now(); for (;;) { const p = await pend(page); const pl = await pill(page); if (Array.isArray(p) && p.length === 0 && pl !== 'busy') return true; if (Date.now() - t0 > ms) { console.log('idle timeout', JSON.stringify(p), pl); return false; } await page.waitForTimeout(1000); } };
const cleanup = async (page) => { if (!(await openPF(page))) return false; await idle(page);
  for (let i = 0; i < 6; i++) { const r = await rows(page); if (!r || !r.length) break; const row = page.locator('[data-testid="pf-files"] div.flex.items-start', { has: page.locator('input[placeholder="タイトル"]') }).filter({ hasText: /tsu_pend_test/ }).first(); if (!(await row.count())) break; await row.locator('button', { hasText: /^削除$/ }).click(); await page.waitForTimeout(1500); await idle(page); }
  if (!(await page.locator('button:visible', { hasText: /^完全削除$/ }).count())) { await page.getByTestId('pf-trash-btn').click().catch(() => {}); await page.waitForTimeout(800); }
  for (let i = 0; i < 6; i++) { const it = page.locator('div.flex.items-center.gap-3', { hasText: /tsu_pend_test|検査pend/ }).filter({ has: page.locator('button', { hasText: /^完全削除$/ }) }).first(); if (!(await it.count())) break; await it.locator('button', { hasText: /^完全削除$/ }).click(); await page.waitForTimeout(2500); await idle(page); }
  await page.waitForTimeout(3000); await idle(page); const d = await dataOf(page); console.log('cleanup data:', JSON.stringify(d)); return d && (d.files || []).length === 0 && d.trash === 0; };

const A = await open('A', 'master'); const pa = A.page;
if (CLEAN_ONLY) { console.log('cleanup:', await cleanup(pa)); await b.close(); process.exit(0); }
ok('0 個人ファイル(サービス提供票)が開く', await openPF(pa));
const before = await rows(pa); if (before && before.length) { console.log('前の検査の残りを片付けます', before); await cleanup(pa); await openPF(pa); }
// ① 検査の PDF を入れる
const tmp = path.join(os.tmpdir(), 'tsu_pend_test.pdf'); fs.writeFileSync(tmp, '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\nxref\n0 4\n0000000000 65535 f \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n0\n%%EOF');
await pa.getByTestId('pf-files').locator('input[type="file"]').first().setInputFiles(tmp); const w1 = await watch(pa, 6000);
await pa.locator('button:visible', { hasText: /^(OK|はい|そのまま|決定)$/ }).first().click({ timeout: 800 }).catch(() => {});
ok('1 PDF を入れると行ができる', ((await rows(pa)) || []).length === 1, await rows(pa)); console.log('  入れた直後の印/文:', JSON.stringify(w1));
ok('1b 待つと控えが消える(送信が終わる)', await idle(pa), await pend(pa));
// ② 題名を変えて、すぐ再読み込み
const TITLE = '検査pend ' + new Date().toTimeString().slice(0, 8);
const inp = pa.locator('[data-testid="pf-files"] input[placeholder="タイトル"]').first(); await setPF(pa); await inp.fill(TITLE);
await pa.waitForTimeout(DELAY); const pill2 = await pill(pa); const pend2 = await pend(pa); await pa.reload({ waitUntil: 'domcontentloaded' });
const w2 = await watch(pa, 9000); await pa.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {}); await pa.waitForTimeout(4000);
console.log('  ② 再読み込みの直前: 印', pill2, '控え', JSON.stringify(pend2), '/ 開き直したあとの文:', JSON.stringify(w2.toast));
const tabA = pa.locator('[data-testid="personal-file-modal"] button', { hasText: /^\s*サービス提供票\s*$/ }).first(); if (await tabA.count()) { const c = await tabA.getAttribute('class'); if (!/border-emerald-600/.test(c || '')) { await tabA.click(); await pa.waitForTimeout(600); } } else await openPF(pa);
const r2 = await rows(pa); ok('2 題名を変えてすぐ再読み込み → 題名が残る', (r2 || []).includes(TITLE), r2);
const l2 = await slog(pa); ok('2b 同期の記録: 起動のとき控えを送った(pend-resend boot → ok)', l2.some(x => /pend-resend \{.*"tag":"boot"/.test(x)) && l2.some(x => /pend-resend-ok/.test(x)), l2.filter(x => /pend-/.test(x)).slice(-4));
ok('2c 「前回、保存の途中で閉じた変更をクラウドへ送りました」と出る', w2.toast.some(t => /保存の途中で閉じた変更/.test(t)), w2.toast);
await idle(pa);
// ③ 削除を押して、すぐ再読み込み
await setPF(pa); const row = pa.locator('[data-testid="pf-files"] div.flex.items-start').filter({ has: pa.locator(`input[placeholder="タイトル"]`) }).filter({ hasText: /tsu_pend_test/ }).first();
await row.locator('button', { hasText: /^削除$/ }).click(); const w3a = await watch(pa, Math.max(200, DELAY)); const pend3 = await pend(pa); await pa.reload({ waitUntil: 'domcontentloaded' });
const w3 = await watch(pa, 9000); await pa.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {}); await pa.waitForTimeout(4000);
console.log('  ③ 再読み込みの直前: 印/文', JSON.stringify(w3a), '控え', JSON.stringify(pend3), '/ 開き直したあとの文:', JSON.stringify(w3.toast));
ok('3a 削除を押すと「削除しています…」と出る', w3a.toast.some(t => /削除しています/.test(t)), w3a.toast);
if (!(await pa.locator('[data-testid="personal-file-modal"]').count())) await openPF(pa); else { const c = await tabA.getAttribute('class').catch(() => ''); if (!/border-emerald-600/.test(c || '')) { await tabA.click().catch(() => {}); await pa.waitForTimeout(600); } }
const r3 = await rows(pa); const d3 = await dataOf(pa); ok('3 削除してすぐ再読み込み → 消えたまま', r3 && r3.length === 0, { rows: r3, data: d3 });
ok('3b ゴミ箱に入っている', d3 && d3.trash === 1, d3);
const l3 = await slog(pa); ok('3c 同期の記録: 起動のとき控えを送った', l3.filter(x => /pend-resend-ok/.test(x)).length >= 2, l3.filter(x => /pend-/.test(x)).slice(-6));
await idle(pa);
// ④ 新しい端末 C
const C = await open('C', 'master'); const pc = C.page; await openPF(pc); const rc = await rows(pc); const dc = await dataOf(pc);
ok('4 新しい端末でも消えている・ゴミ箱に題名つきで入っている', rc && rc.length === 0 && dc && dc.trash === 1, { rows: rc, data: dc });
await C.ctx.close();
// ⑤ 片付け(完全に削除)。ふつうに待つ保存では控えが残らない
const cl = await cleanup(pa); ok('5 片付け(完全に削除)・控えなし', cl && (await pend(pa)).length === 0, await pend(pa));
console.log('同期の記録(終わり):'); (await slog(pa, 40)).filter(x => /pend-|push-time|push-ok|blocked/.test(x)).slice(-14).forEach(x => console.log('  ', x));
await b.close(); const bad = R.filter(x => !x[1]); console.log(bad.length ? `FAIL ${bad.length}: ${bad.map(x => x[0]).join(' / ')}` : 'ALL PASS'); process.exit(bad.length ? 1 : 0);
