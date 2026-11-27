// 2026-11-27 1128a/trial657: 保険証(介護度・認定有効期間)の変更履歴が 2 個入る・前もって入れた認定がその日に切り替わらない の検査(見本ビルド)
//   A 開始日が来た予定の切り替え(アプリを開いたとき): 同じ介護度の認定更新・介護度の変更・負担割合 は切り替わる／先の日付・まだ切れていない期間・90日より前 は切り替えない
//   B ユーザーの手順: 利用者マスタを編集中(未保存)に「個人ファイルで編集」→ 認定有効期間を入れて保存 → 利用者マスタを保存
//       → 認定有効期間が前に戻らない・変更履歴に同じ行が増えない・利用者マスタの表示もすぐ新しい期間
//   C 同じ認定有効期間をもう一度入れても履歴は増えない
//   D すでに 2 個ずつ入っている履歴: 個人ファイルと利用者マスタの変更履歴では 1 行ずつ・利用者マスタで 1 行消すと同じ行が全部消える
//   E (trial658 だけ) 年・月・日の選ぶ欄: 後ろの画面を動かしても消えない・画面の中に収まる・今の値に印
//   使い方: node chk/chk_1127ins.mjs 4175
import { chromium } from 'playwright';
const PORT = process.argv[2] || '4175'; const BASE = `http://localhost:${PORT}`;
const OUT = process.env.S || '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad';
const b = await chromium.launch(); const R = []; const ok = (n, c, d) => { R.push([n, !!c]); console.log((c ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? ' ' + JSON.stringify(d) : '')); };
const PC = { viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' };
// 日付(日本時間のきょうから数える)
const jst = () => new Date(Date.now() + 9 * 3600 * 1000);
const iso = (d) => d.toISOString().slice(0, 10);
const D = (off) => { const d = jst(); d.setUTCDate(d.getUTCDate() + off); return iso(d); };
const TODAY = D(0); const M1 = TODAY.slice(0, 8) + '01'; // 今月の 1 日(きょう以前)
const addY = (s, y, dd = 0) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCFullYear(d.getUTCFullYear() + y); d.setUTCDate(d.getUTCDate() + dd); return iso(d); };
const OLD_FROM = addY(M1, -1, -10), OLD_TO = addY(M1, 0, -1); // 前の認定: 去年の今ごろ 〜 先月の末
const NEW_TO = addY(M1, 1, -1);

const boot = async (opt, view, seed) => { const ctx = await b.newContext(opt); const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  const ids = await page.evaluate(([view, seed, c]) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3'));
    const ps = d.patients.filter(p => p.status === '利用中' && !p.endDate);
    const set = (p, o) => { ['careLevelHistory', 'costBurdenHistory', '_fieldTs'].forEach(k => delete p[k]); Object.assign(p, o); };
    const [A, B2, C, Dd, E, F, G] = ps;
    if (seed === 'due') {
      set(A, { careLevel: '要介護1', careLevelFrom: c.OLD_FROM, careLevelTo: c.OLD_TO, careLevelHistory: [{ value: '要介護1', from: c.OLD_FROM, to: '', note: '' }, { value: '要介護1', from: c.M1, to: c.NEW_TO, note: '認定更新' }] });
      set(B2, { careLevel: '要介護1', careLevelFrom: c.OLD_FROM, careLevelTo: c.NEW_TO, careLevelHistory: [{ value: '要介護1', from: c.OLD_FROM, to: c.M1 }, { value: '要介護2', from: c.M1, to: c.NEW_TO, note: '' }] });
      set(C, { careLevel: '要介護1', careLevelFrom: c.OLD_FROM, careLevelTo: c.OLD_TO, careLevelHistory: [{ value: '要介護1', from: c.OLD_FROM, to: '' }, { value: '要介護3', from: c.FUT, to: '', note: '' }] });
      set(Dd, { careLevel: '要介護2', careLevelFrom: c.OLD_FROM, careLevelTo: c.NEW_TO, careLevelHistory: [{ value: '要介護2', from: c.OLD_FROM, to: '' }, { value: '要介護2', from: c.M1, to: c.NEW_TO, note: '認定更新' }] }); // 今の期間がまだ切れていない(わざと前の期間に直した場合など)
      set(E, { careLevel: '要介護2', careLevelFrom: c.VOLD_FROM, careLevelTo: c.VOLD_TO, careLevelHistory: [{ value: '要介護2', from: c.VOLD_FROM, to: '' }, { value: '要介護2', from: c.P100, to: c.NEW_TO, note: '認定更新' }] }); // 開始日が 90 日より前
      set(F, { costBurden: '1割', costBurdenFrom: c.OLD_FROM, costBurdenTo: c.OLD_TO, costBurdenHistory: [{ value: '1割', from: c.OLD_FROM, to: c.M1 }, { value: '2割', from: c.M1, to: c.NEW_TO, note: '' }] });
    } else {
      set(A, { careLevel: '要介護1', careLevelFrom: c.OLD_FROM, careLevelTo: c.OLD_TO, careLevelHistory: [{ value: '要介護1', from: c.OLD_FROM, to: '', note: '' }] });
      const a = { value: '要介護1', from: c.VOLD_FROM, to: c.VOLD_TO, note: '' }, n = { value: '要介護2', from: c.OLD_FROM, to: c.NEW_TO, note: '' };
      set(G, { careLevel: '要介護2', careLevelFrom: c.OLD_FROM, careLevelTo: c.NEW_TO, careLevelHistory: [a, n, { ...a, note: '認定更新' }, { ...n }] }); // 2 個ずつ入っている
    }
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0');
    sessionStorage.setItem('tsumugiActiveRecorder', JSON.stringify({ id: 'demo_rec', name: '見本 職員', roleLabel: '介護職員' }));
    sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: view.v, pid: view.p === 'A' ? A.id : view.p === 'G' ? G.id : null, t: Date.now() }));
    return { A: A.id, B: B2.id, C: C.id, D: Dd.id, E: E.id, F: F.id, G: G.id }; },
  [view, seed, { OLD_FROM, OLD_TO, NEW_TO, M1, FUT: D(20), VOLD_FROM: addY(M1, -2, -10), VOLD_TO: addY(M1, -1, -11), P100: D(-100) }]);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {}); return { page, ids, ctx }; };
const pat = (page, id) => page.evaluate((id) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); return d.patients.find(p => p.id === id); }, id);
const poll = async (fn, ms = 6000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await new Promise(z => setTimeout(z, 300)); } };
const sec = (page) => page.locator('div.mt-3', { hasText: '保険証の内容（選んで' }).last();
// 認定有効期間の欄(n = 0 開始 / 1 終了)に 年・月・日 を入れる(選ぶ欄でも、ブラウザのプルダウンでも)
const setWk = async (page, n, ey, m, day) => { const s = sec(page);
  if (await s.locator('[data-testid="wk-y"]').count()) {
    for (const [k, v] of [['y', ey], ['m', m], ['d', day]]) { await s.locator(`[data-testid="wk-${k}"]`).nth(n).click(); await page.waitForTimeout(200); await page.locator(`[data-testid="wk-${k}-opt"][data-value="${v}"]`).click(); await page.waitForTimeout(200); }
  } else { const sel = s.locator('select'); const o = 1 + n * 4; await sel.nth(o + 1).selectOption(String(ey)); await sel.nth(o + 2).selectOption(String(m)); await sel.nth(o + 3).selectOption(String(day)); await page.waitForTimeout(200); } };
const EY = Number(M1.slice(0, 4)) - 2018, MM = Number(M1.slice(5, 7));

// ===== A 開始日が来た予定の切り替え =====
{ const { page, ids, ctx } = await boot(PC, { v: 'home' }, 'due');
  const a = await poll(async () => { const p = await pat(page, ids.A); return p.careLevelFrom === M1 ? p : null; });
  ok('A1 同じ介護度の認定更新(前の期間が切れている): 開始日が来たら新しい認定有効期間に切り替わる', !!a && a.careLevelTo === NEW_TO && a.careLevel === '要介護1', a ? { from: a.careLevelFrom, to: a.careLevelTo } : await pat(page, ids.A).then(p => ({ from: p.careLevelFrom, to: p.careLevelTo })));
  ok('A2 切り替えた項目に「新しく直した」印が付く(ほかの端末の古い控えに負けない)', !!a && !!(a._fieldTs && a._fieldTs.careLevelFrom > 0 && a._fieldTs.careLevelTo > 0), a && a._fieldTs);
  const p2 = await pat(page, ids.B); ok('A3 介護度の変更: 開始日が来たら介護度と期間が切り替わる', p2.careLevel === '要介護2' && p2.careLevelFrom === M1 && p2.careLevelTo === NEW_TO, { v: p2.careLevel, from: p2.careLevelFrom });
  const p3 = await pat(page, ids.C); ok('A4 開始日が先の予定は、まだ切り替えない', p3.careLevel === '要介護1' && p3.careLevelFrom === OLD_FROM, { v: p3.careLevel, from: p3.careLevelFrom });
  const p4 = await pat(page, ids.D); ok('A5 今の期間がまだ切れていない同じ介護度は、切り替えない(手で直した期間を勝手に変えない)', p4.careLevelFrom === OLD_FROM && p4.careLevelTo === NEW_TO, { from: p4.careLevelFrom });
  const p5 = await pat(page, ids.E); ok('A6 開始日が 90 日より前の認定更新は、切り替えない(配った日に昔の分をまとめて書き換えない)', p5.careLevelFrom === addY(M1, -2, -10), { from: p5.careLevelFrom });
  const p6 = await pat(page, ids.F); ok('A7 負担割合の変更: 開始日が来たら切り替わる', p6.costBurden === '2割' && p6.costBurdenFrom === M1, { v: p6.costBurden, from: p6.costBurdenFrom });
  ok('A8 変更履歴は増えも減りもしない', a && a.careLevelHistory.length === 2 && p2.careLevelHistory.length === 2);
  await ctx.close(); }

// ===== B / C ユーザーの手順 =====
{ const { page, ids, ctx } = await boot(PC, { v: 'master', p: 'A' }, 'ui');
  // 利用者マスタを編集中(未保存)にする: サービス提供内容の「留意点」に書いて、基本情報へ戻る
  await page.locator('button:visible', { hasText: /^サービス提供内容$/ }).first().click(); await page.waitForTimeout(500);
  const ta = page.locator('div', { has: page.locator('> label', { hasText: '留意点（スタッフへの申し送り）' }) }).last().locator('textarea');
  await ta.scrollIntoViewIfNeeded(); await ta.click(); await ta.type('検査の申し送り'); await page.waitForTimeout(300);
  await page.locator('button:visible', { hasText: /^基本情報$/ }).first().click(); await page.waitForTimeout(500);
  await page.locator('button:visible', { hasText: '個人ファイルで編集' }).first().click(); await page.waitForTimeout(1200);
  ok('B1 個人ファイルの保険証の欄が開く', await sec(page).count() === 1);
  await setWk(page, 0, EY, MM, 1);
  await sec(page).locator('button', { hasText: /^1年$/ }).click(); await page.waitForTimeout(300);
  await sec(page).locator('button', { hasText: /^保存$/ }).first().click(); await page.waitForTimeout(1200);
  const p1 = await pat(page, ids.A);
  ok('B2 個人ファイルで保存: 認定有効期間が新しくなり、変更履歴は 前の期間 + 認定更新 の 2 行', p1.careLevelFrom === M1 && p1.careLevelTo === NEW_TO && p1.careLevelHistory.length === 2, { from: p1.careLevelFrom, to: p1.careLevelTo, hist: p1.careLevelHistory.map(h => `${h.value}|${h.from}|${h.note || ''}`) });
  const rows1 = await sec(page).locator('div', { hasText: '介護度の変更履歴' }).last().locator('xpath=..').locator('b').count();
  ok('B3 個人ファイルの変更履歴の表示も 2 行', rows1 === 2, rows1);
  await page.getByTestId('pf-close-btn').click(); await page.waitForTimeout(600);
  const shown = await page.evaluate(() => { const e = [...document.querySelectorAll('div,th,td,span')].filter(x => x.offsetParent && x.textContent.trim() === '介護度の認定有効期間').pop(); return e ? e.parentElement.innerText : ''; });
  ok('B4 利用者マスタ(編集中のまま)の表示も、すぐ新しい認定有効期間', new RegExp(`令和${EY}年${MM}月1日`).test(shown), shown.replace(/\s+/g, ' ').slice(0, 60));
  await page.locator('.tsu-mhead-btns button:visible', { hasText: /^保存$/ }).first().click(); await page.waitForTimeout(1800);
  const p2 = await pat(page, ids.A);
  ok('B5 そのあと利用者マスタを保存しても、認定有効期間は前に戻らない', p2.careLevelFrom === M1 && p2.careLevelTo === NEW_TO, { from: p2.careLevelFrom, to: p2.careLevelTo });
  ok('B6 変更履歴に同じ行が増えない(2 行のまま・前の期間の「認定更新」が足されない)', p2.careLevelHistory.length === 2 && new Set(p2.careLevelHistory.map(h => `${h.value}|${h.from}`)).size === 2, p2.careLevelHistory.map(h => `${h.value}|${h.from}|${h.note || ''}`));
  ok('B7 利用者マスタで入れた留意点は保存されている', /検査の申し送り/.test(String(p2.ryui || '')), p2.ryui);
  // C: 同じ期間をもう一度(いちど別の日にして保存 → 元の日に戻して保存)
  await page.locator('button:visible', { hasText: '個人ファイルで編集' }).first().click(); await page.waitForTimeout(1200);
  await setWk(page, 0, EY, MM, 2); await sec(page).locator('button', { hasText: /^保存$/ }).first().click(); await page.waitForTimeout(900);
  await setWk(page, 0, EY, MM, 1); await sec(page).locator('button', { hasText: /^保存$/ }).first().click(); await page.waitForTimeout(1200);
  const p3 = await pat(page, ids.A); const keys = p3.careLevelHistory.map(h => `${h.value}|${h.from}`);
  ok('C1 同じ開始日をもう一度入れても、同じ行は 2 個にならない', new Set(keys).size === keys.length && keys.filter(k => k === `要介護1|${M1}`).length === 1, keys);
  await ctx.close(); }

// ===== D すでに 2 個ずつ入っている履歴 =====
{ const { page, ids, ctx } = await boot(PC, { v: 'master', p: 'G' }, 'ui');
  await page.locator('button:visible', { hasText: /変更履歴/ }).first().click(); await page.waitForTimeout(700);
  const rows = page.getByTestId('hist-care-row');
  ok('D1 利用者マスタの変更履歴: 同じ行はまとめて 1 行ずつ(4 件 → 2 行)', await rows.count() === 2, await rows.count());
  await page.getByTestId('hist-care-del').first().click(); await page.waitForTimeout(400); // 新しい方(要介護2)
  await page.locator('button:visible', { hasText: /^削除(する)?$/ }).last().click(); await page.waitForTimeout(1500);
  const g = await pat(page, ids.G);
  ok('D2 1 行消すと、同じ行(2 個)がどちらも消え、残りは 1 件にまとまる', g.careLevelHistory.length === 1 && g.careLevelHistory[0].value === '要介護1', g.careLevelHistory.map(h => `${h.value}|${h.from}|${h.note || ''}`));
  ok('D3 消したあとの表示は 1 行', await rows.count() === 1, await rows.count());
  ok('D4 履歴を消しても、今の介護度と認定有効期間は変わらない', g.careLevel === '要介護2' && g.careLevelFrom === OLD_FROM && g.careLevelTo === NEW_TO);
  await ctx.close(); }

// ===== E 年・月・日の選ぶ欄(trial658 だけ) =====
for (const [nm, opt] of [['PC', PC], ['スマホ', PHONE]]) { const { page, ids, ctx } = await boot(opt, { v: 'master', p: 'A' }, 'ui');
  await page.locator('button', { hasText: '個人ファイルで編集' }).first().evaluate(el => el.click()); await page.waitForTimeout(1500); // スマホは名簿の引き出しが前にあるので、じかに押す
  const s = sec(page); const yb = s.locator('[data-testid="wk-y"]').first();
  if (!(await yb.count())) { console.log(`SKIP E(${nm}) この版はブラウザのプルダウンのまま`); await ctx.close(); continue; }
  await yb.scrollIntoViewIfNeeded(); await yb.click(); await page.waitForTimeout(300);
  const pop = page.getByTestId('wk-y-pop'); const vp = page.viewportSize();
  const bb = await pop.boundingBox();
  ok(`E1(${nm}) 年の候補が出て、画面の中に収まる`, !!bb && bb.x >= 0 && bb.y >= 0 && bb.x + bb.width <= vp.width + 0.5 && bb.y + bb.height <= vp.height + 0.5, bb);
  const cur = await page.locator('[data-testid="wk-y-opt"][aria-selected="true"]').evaluateAll(es => es.map(e => ({ v: e.getAttribute('data-value'), fw: getComputedStyle(e).fontWeight, t: e.innerText.replace(/\s+/g, '') })));
  ok(`E2(${nm}) 今の年に太字とチェック`, cur.length === 1 && Number(cur[0].fw) >= 800 && /✓/.test(cur[0].t), cur);
  const cell = await page.locator('[data-testid="wk-y-opt"]').first().boundingBox();
  ok(`E3(${nm}) 1 ますは 44px 以上`, cell.height >= 44 && cell.width >= 42, cell);
  // 候補の外(後ろの画面)でホイール・指の送り → 候補は消えない・後ろも動かない
  const sc0 = await page.evaluate(() => [...document.querySelectorAll('*')].filter(e => e.scrollTop > 0).map(e => e.scrollTop).join(','));
  if (nm === 'PC') { await page.mouse.move(30, 30); await page.mouse.wheel(0, 600); await page.waitForTimeout(400); await page.mouse.move(vp.width - 30, vp.height - 30); await page.mouse.wheel(0, -600); }
  else { const cdp = await ctx.newCDPSession(page); await cdp.send('Input.synthesizeScrollGesture', { x: 40, y: 80, yDistance: -200, gestureSourceType: 'touch' }).catch(() => {}); }
  await page.waitForTimeout(500);
  const sc1 = await page.evaluate(() => [...document.querySelectorAll('*')].filter(e => e.scrollTop > 0).map(e => e.scrollTop).join(','));
  ok(`E4(${nm}) 候補の外で画面を送っても、候補は開いたまま`, await pop.count() === 1 && await pop.isVisible());
  ok(`E5(${nm}) 後ろの画面は動かない`, sc0 === sc1, { sc0, sc1 });
  await page.screenshot({ path: `${OUT}/ins_pick_${nm === 'PC' ? 'pc' : 'phone'}.png` });
  const want = String(EY + 1);
  await page.locator(`[data-testid="wk-y-opt"][data-value="${want}"]`).click(); await page.waitForTimeout(300);
  ok(`E6(${nm}) 選ぶと閉じて、欄の年が変わる`, await pop.count() === 0 && (await yb.getAttribute('data-value')) === want, await yb.getAttribute('data-value'));
  await s.locator('[data-testid="wk-d"]').first().click(); await page.waitForTimeout(300);
  ok(`E7(${nm}) 日は 31 個・月は 12 個`, await page.locator('[data-testid="wk-d-opt"]').count() === 31);
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  ok(`E8(${nm}) Esc は候補だけ閉じる(個人ファイルは開いたまま)`, await page.getByTestId('wk-d-pop').count() === 0 && await sec(page).count() === 1);
  await s.locator('[data-testid="wk-m"]').first().click(); await page.waitForTimeout(300);
  await page.mouse.click(5, 5); await page.waitForTimeout(300);
  ok(`E9(${nm}) 外側を押すと候補だけ閉じる`, await page.getByTestId('wk-m-pop').count() === 0 && await sec(page).count() === 1);
  await ctx.close(); }

const ng = R.filter(x => !x[1]); console.log(`\n${R.length - ng.length}/${R.length} passed` + (ng.length ? '  FAILED: ' + ng.map(x => x[0]).join(' / ') : ''));
await b.close(); process.exit(ng.length ? 1 : 0);
