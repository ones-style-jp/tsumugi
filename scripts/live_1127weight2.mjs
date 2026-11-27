// 2026-11-27 trial656: テスト店舗・2 台 — 保存 1 回の読み直しは 1 回だけ／「今すぐ更新」は送れていない入力があるときだけ先に保存(入力は消えない)
//   T1 B が申し送りを保存 → B の店舗データ全体の読み込みは 1 回・書き込み 1 回・push-noop なし／A に届く
//   T2 何も変えずに「今すぐ更新」→ 保存を省く(upd-time save:0)・店舗データへの書き込みなし・読み込み直しのあと入力は残っている
//   T3 申し送りを保存して、すぐ「今すぐ更新」→ 保存が終わるのを待ってから読み込み直す・A に届く
//   T4 送信を止めた状態で保存(失敗)→ 送信を戻して、すぐ「今すぐ更新」→ 先に保存してから読み込み直す・A に届く
//   T5 かかった時間のまとめ(tsumugiPerfSum)に保存・取り込み・更新・起動が入る／[--diag] 本部向けの記録(diag_*)に perf が載る
//   LIVE_URL=https://tsumugi-git-trial-ones-style.vercel.app node chk/live_1127weight2.mjs [--diag]
import { chromium } from 'playwright';
const BASE = (process.env.LIVE_URL || 'https://tsumugi-git-trial-ones-style.vercel.app').replace(/\/$/, '');
const DIAG = process.argv.includes('--diag');
const b = await chromium.launch(); const R = []; const ok = (n, c, d) => { R.push([n, !!c]); console.log((c ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? ' ' + JSON.stringify(d) : '')); };
const open = async (tag) => {
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept());
  await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
  await page.evaluate(() => { localStorage.setItem('tsumugiSidebarOpen', '0'); localStorage.setItem('tsumugiDeviceName', 'probe-' + Math.random().toString(36).slice(2, 6)); });
  await page.locator('input[autocomplete^="username"]').first().fill('test'); await page.locator('input[autocomplete="current-password"]').first().fill('testoooo');
  await page.locator('button[type=submit]:visible, button:visible:has-text("ログイン")').first().click(); await page.waitForTimeout(7000);
  for (let i = 0; i < 6; i++) { const body = await page.locator('body').innerText();
    if (/管理者パスワードを入力/.test(body)) { const inp = page.locator('input[type=password]:visible, input[type=text]:visible, input:not([type]):visible').last(); await inp.fill('test1234'); await page.waitForTimeout(200); await inp.press('Enter'); await page.waitForTimeout(1500); await page.locator('button:visible', { hasText: /^(入る|確認|OK|ログイン|決定)$/ }).first().click({ timeout: 800 }).catch(() => {}); await page.waitForTimeout(4000); continue; }
    if (/どなたですか/.test(body)) { const el = page.locator('button:visible', { hasText: /試験 管理者/ }).first(); if (await el.count()) { await el.evaluate(b => b.click()); await page.waitForTimeout(3000); continue; } }
    if (/この端末の名前/.test(body)) { const inp = page.locator('input[type=text]:visible, input:not([type]):visible').first(); if (await inp.count()) await inp.fill('probe-' + tag); await page.locator('button:visible', { hasText: /決定|保存|OK|はじめる|次へ/ }).first().click({ timeout: 1000 }).catch(() => {}); await page.waitForTimeout(2000); continue; }
    if (!/どなたですか|パスワード|この端末の名前/.test(body)) break; await page.waitForTimeout(3000); }
  await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'dashboard', pid: null, t: Date.now() }))); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(6000);
  await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
  return { ctx, page }; };
const watchNet = (page, tag, sink) => { page.on('request', (rq) => { try { const u = rq.url(); if (!/app_state|state-cas/.test(u)) return; const U = new URL(u); const sel = U.searchParams.get('select') || ''; const key = U.searchParams.get('key') || ''; let body = ''; try { body = rq.postData() || ''; } catch {}
  sink.push({ at: Date.now(), tag, m: rq.method(), api: /state-cas/.test(u), full: rq.method() === 'GET' && /(^|,)data(,|$)/.test(sel), diag: /diag_/.test(key) || /diag_/.test(body.slice(0, 300)), perf: /"perf"/.test(body) }); } catch {} }); };
const slog = (page) => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('tsumugiSyncLog') || '[]'); } catch { return []; } });
const lastN = async (page) => { const L = await slog(page); return L.length ? Number(L[L.length - 1].n) || 0 : 0; };
const since = async (page, n) => (await slog(page)).filter(x => Number(x.n) > n);
const hasText = (page, s) => page.evaluate((s) => (localStorage.getItem('daycareAppData_v3') || '').includes(s), s);
const waitText = async (page, s, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await hasText(page, s).catch(() => false)) return Date.now() - t0; await page.waitForTimeout(500); } return -1; };
const memo = async (page, text) => { await page.getByTestId('home-memo-add').click(); await page.waitForTimeout(500); await page.getByTestId('memo-text').fill(text); };
const showBanner = async (page) => { await page.route('**/index.html?_v=*', async (route) => { try { const r = await route.fetch(); const t = await r.text(); await route.fulfill({ response: r, body: t.replace(/\/assets\/index-/g, '/assets/indexNEW-') }); } catch { try { await route.continue(); } catch {} } });
  await page.evaluate(() => { window.dispatchEvent(new Event('focus')); }); await page.getByTestId('update-banner-go').waitFor({ timeout: 70000 }); };
const A = await open('A'); const B = await open('B'); await A.page.waitForTimeout(8000);
const net = []; watchNet(A.page, 'A', net); watchNet(B.page, 'B', net);
// 本部向けの記録(diag_*)を読むときの中身に、まとめ perf が入っているか(書く前に必ず読むので、前の回に書いた分が見える)
const diagSeen = { n: 0, perf: 0, keys: '' }; for (const P of [A.page, B.page]) P.on('response', async (res) => { try { const u = res.url(); if (!/rest\/v1\/app_state/.test(u) || !/diag_/.test(u) || res.request().method() !== 'GET') return; const j = await res.json(); const d = (Array.isArray(j) ? j[0] : j) || {}; const data = d.data || {}; diagSeen.n++;
  for (const k of Object.keys(data)) { if (k.startsWith('__')) continue; const v = data[k]; if (v && v.perf && typeof v.perf === 'object') { diagSeen.perf++; diagSeen.keys = Object.keys(v.perf).join(','); } } } catch {} });
const isWrite = (x) => !x.diag && (x.api || x.m === 'PATCH' || x.m === 'POST');
const tok = 'k' + Date.now().toString(36);

// ===== T1 保存 1 回 =====
{ const n0 = await lastN(B.page); const t0 = Date.now();
  await memo(B.page, `軽さ検査1 ${tok}（消してよい）`); await B.page.getByTestId('memo-save').click();
  const got = await waitText(A.page, `軽さ検査1 ${tok}`, 40000); await B.page.waitForTimeout(6000);
  const nb = net.filter(x => x.tag === 'B' && x.at >= t0 && !x.diag); const L = await since(B.page, n0);
  ok('T1-1 保存した端末: 店舗データ全体の読み込みは 1 回だけ(これまで 2 回)', nb.filter(x => x.full).length === 1, { full: nb.filter(x => x.full).length, write: nb.filter(isWrite).length });
  ok('T1-2 保存した端末: 書き込みは 1 回', nb.filter(isWrite).length === 1);
  ok('T1-3 同期の記録に push-noop(確かめるだけの 2 回目)が無い・push-time ok', !L.some(x => x.ev === 'push-noop') && L.some(x => x.ev === 'push-time' && x.d && x.d.ok === 1), L.filter(x => /^push/.test(x.ev)).map(x => x.ev + ' ' + JSON.stringify(x.d || {})));
  ok('T1-4 もう 1 台に届く', got >= 0, { ms: got }); }

// ===== T2 何も変えずに「今すぐ更新」 =====
{ await showBanner(B.page); const n0 = await lastN(B.page); const t0 = Date.now(); let navAt = 0; const onNav = () => { if (!navAt) navAt = Date.now(); }; B.page.on('framenavigated', onNav);
  await B.page.getByTestId('update-banner-go').click();
  await B.page.waitForFunction(() => { try { return JSON.parse(localStorage.getItem('tsumugiSyncLog') || '[]').some(x => x.ev === 'boot-perf') && !document.querySelector('[data-tsu-splash="1"]') && !!document.querySelector('[data-testid="home-memo-add"]'); } catch { return false; } }, null, { timeout: 60000 }).catch(() => {});
  await B.page.waitForTimeout(6000); B.page.off('framenavigated', onNav);
  const L = await since(B.page, n0); const u = L.find(x => x.ev === 'upd-time');
  const pre = net.filter(x => x.tag === 'B' && x.at >= t0 && x.at <= (navAt || Date.now()) && !x.diag);
  ok('T2-1 送れていない入力なし → 保存を省く(upd-time save:0)', u && u.d && u.d.save === 0, u && u.d);
  ok('T2-2 読み込み直しの前に、店舗データ全体の読み込み・書き込みをしない', pre.filter(x => x.full).length === 0 && pre.filter(isWrite).length === 0, { full: pre.filter(x => x.full).length, write: pre.filter(isWrite).length, navMs: navAt - t0 });
  ok('T2-3 読み込み直しのあとも、さっきの入力が残っている', await hasText(B.page, `軽さ検査1 ${tok}`));
  ok('T2-4 開いたときの記録 boot-perf', L.some(x => x.ev === 'boot-perf'), (L.find(x => x.ev === 'boot-perf') || {}).d); }

// ===== T3 保存して、すぐ「今すぐ更新」 =====
{ await showBanner(B.page); const n0 = await lastN(B.page);
  // 通信がゆっくりのお店を想定: 書き込みを 3 秒遅らせる(その間に読み込み直すと、送信の途中で切れてしまう)
  const slow = async (route) => { const rq = route.request(); if (rq.method() !== 'GET') await new Promise(r => setTimeout(r, 3000)); try { await route.continue(); } catch {} };
  await B.page.route('**/api/state-cas*', slow); await B.page.route('**/rest/v1/app_state*', slow);
  await memo(B.page, `軽さ検査3 ${tok}（消してよい）`);
  const seen = []; await B.page.exposeFunction('__seen3', (t) => { seen.push(t); }).catch(() => {});
  await B.page.evaluate(() => { const el = document.querySelector('[data-testid="update-banner-go"]'); const mo = new MutationObserver(() => { try { window.__seen3(el.textContent); } catch {} }); mo.observe(el, { childList: true, subtree: true, characterData: true }); });
  await B.page.getByTestId('memo-save').click(); await B.page.getByTestId('update-banner-go').click({ force: true });
  const got = await waitText(A.page, `軽さ検査3 ${tok}`, 60000);
  await B.page.waitForFunction(() => !!document.querySelector('[data-testid="home-memo-add"]') && !document.querySelector('[data-tsu-splash="1"]'), null, { timeout: 60000 }).catch(() => {}); await B.page.waitForTimeout(6000);
  const L = await since(B.page, n0); const u = L.find(x => x.ev === 'upd-time');
  await B.page.unroute('**/api/state-cas*', slow).catch(() => {}); await B.page.unroute('**/rest/v1/app_state*', slow).catch(() => {});
  ok('T3-1 保存の送信が終わるのを待ってから読み込み直す(upd-time save:2・2.5 秒以上待つ)', u && u.d && u.d.save === 2 && u.d.saveMs >= 2500, u && u.d);
  ok('T3-1b 待っている間のボタンは「入力を保存しています…」', seen.some(t => /^入力を保存しています…（/.test(t)), seen.slice(0, 6));
  ok('T3-2 もう 1 台に届く(入力は消えない)', got >= 0, { ms: got });
  ok('T3-3 読み込み直した端末にも残っている', await hasText(B.page, `軽さ検査3 ${tok}`)); }

// ===== T4 送信に失敗した入力が残っているときの「今すぐ更新」 =====
{ await showBanner(B.page); const n0 = await lastN(B.page);
  const block = async (route) => { const rq = route.request(); if (rq.method() !== 'GET') { try { await route.abort('failed'); } catch {} } else { try { await route.continue(); } catch {} } };
  await B.page.route('**/api/state-cas*', block); await B.page.route('**/rest/v1/app_state*', block);
  await memo(B.page, `軽さ検査4 ${tok}（消してよい）`); await B.page.getByTestId('memo-save').click();
  const t0 = Date.now(); let gave = false; while (Date.now() - t0 < 60000) { const L = await since(B.page, n0); if (L.some(x => x.ev === 'push-give-up')) { gave = true; break; } await B.page.waitForTimeout(500); }
  ok('T4-0 (準備) 送信を止めると保存は失敗して端末に控える', gave && !(await hasText(A.page, `軽さ検査4 ${tok}`)));
  await B.page.unroute('**/api/state-cas*', block); await B.page.unroute('**/rest/v1/app_state*', block);
  await B.page.getByTestId('update-banner-go').click({ force: true });
  const got = await waitText(A.page, `軽さ検査4 ${tok}`, 60000);
  await B.page.waitForFunction(() => !!document.querySelector('[data-testid="home-memo-add"]') && !document.querySelector('[data-tsu-splash="1"]'), null, { timeout: 60000 }).catch(() => {}); await B.page.waitForTimeout(6000);
  const L = await since(B.page, n0); const u = L.find(x => x.ev === 'upd-time');
  ok('T4-1 送れていない入力あり → 先に保存する(upd-time save:1 か 2)', u && u.d && (u.d.save === 1 || u.d.save === 2), u && u.d);
  ok('T4-2 もう 1 台に届く(入力は消えない)', got >= 0, { ms: got });
  ok('T4-3 読み込み直した端末にも残っている', await hasText(B.page, `軽さ検査4 ${tok}`)); }

// ===== T5 かかった時間のまとめ =====
{ const pb = await B.page.evaluate(() => JSON.parse(localStorage.getItem('tsumugiPerfSum') || 'null')); const pa = await A.page.evaluate(() => JSON.parse(localStorage.getItem('tsumugiPerfSum') || 'null'));
  ok('T5-1 保存した端末のまとめ: 保存(push)・送信(send)・更新(upd)・起動(boot)', pb && pb.push && pb.push.n >= 2 && pb.upd && pb.boot && pb.boots >= 3, pb);
  ok('T5-2 受ける端末のまとめ: 取り込み(pull)の回数と時間', pa && pa.pull && pa.pull.n >= 2 && pa.pull.max > 0, pa && pa.pull);
  ok('T5-3 まとめは数字だけ(日本語の文字なし)', !/[\u3040-\u30ff\u4e00-\u9fff]/.test(JSON.stringify(pb) + JSON.stringify(pa)));
  { const t0 = Date.now(); while (DIAG && !diagSeen.perf && Date.now() - t0 < 330000) await A.page.waitForTimeout(3000);
    if (DIAG || diagSeen.perf) ok('T5-4 本部向けの記録(diag)にまとめ perf が載る', diagSeen.perf > 0, { ...diagSeen, waitedSec: Math.round((Date.now() - t0) / 1000) }); else console.log('SKIP T5-4 (diag の読み込み ' + diagSeen.n + ' 回・perf はまだ見えていない。--diag で 5 分待つ)'); } }
await b.close();
const ng = R.filter(r => !r[1]); console.log(`\n${R.length - ng.length}/${R.length} PASS`); if (ng.length) { console.log('NG:', ng.map(r => r[0]).join(' / ')); process.exit(1); }
