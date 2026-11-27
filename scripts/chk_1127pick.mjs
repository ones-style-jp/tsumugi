// 2026-11-27 trial654: 検索欄とあいうえおの区切りつきの選ぶ欄(TsuSearchPick)と、ケアマネ事業所のふりがな
//   A カレンダーの予定(PC): 利用者は押すと一覧(検索欄・あ行〜の見出し・行へ飛ぶボタン)・ふりがなで絞れる・選ぶと元の番号のまま保存・今の選択に印・「なし」で外れる・Esc は一覧だけ閉じる・画面からはみ出さない
//   B スマホ: 下からの紙(全幅)・× で閉じる・行とボタンは 44px・指の端末では検索欄に自動で入らない
//   C 申し送り: 利用者を選んで保存すると patientId が入る
//   D ケアマネ事業所: 追加にふりがな(ひらがな→カタカナ)・kana と _kanaTs が入る・未登録の件数・電話だけ直しても _kanaTs は変わらない・ふりがなを直すと _kanaTs が進む・担当者の追加で漢字の事業所をふりがなで探せる
//   E 利用者マスタ: 担当を変更の事業所・変更履歴の編集で名簿にない事業所は上に「名簿にありません」
//   使い方: node chk/chk_1127pick.mjs 4175
import { chromium } from 'playwright';
const PORT = process.argv[2] || '4175'; const BASE = `http://localhost:${PORT}`;
const OUT = process.env.S || '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad';
const b = await chromium.launch(); const R = []; const ok = (n, c, d) => { R.push([n, !!c]); console.log((c ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? ' ' + JSON.stringify(d) : '')); };
const PC = { viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' };
const PHONE = { viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' };
const boot = async (opt, view, pid) => { const ctx = await b.newContext(opt); const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  const ids = await page.evaluate(([view, pid]) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3'));
    const ps = d.patients.filter(p => p.status === '利用中' && !p.endDate);
    const NM = [['青木 見本', 'あおき みほん'], ['加藤 見本', 'かとう みほん'], ['佐藤 見本', 'さとう みほん'], ['田中 見本', 'たなか みほん'], ['中村 見本', 'なかむら みほん'], ['浜田 見本', 'はまだ みほん'], ['松本 見本', 'まつもと みほん'], ['山田 見本', 'やまだ みほん'], ['渡辺 見本', 'わたなべ みほん']];
    NM.forEach((x, i) => { if (ps[i]) { ps[i].name = x[0]; ps[i].kana = x[1]; ps[i].pauseHistory = []; } });
    const A = ps[3]; const Q = ps[8]; Q.status = '休止'; Q.pauseHistory = [{ start: '2026-01-01', end: '', reason: '入院' }];
    d.systemSettings = d.systemSettings || {};
    d.systemSettings.cmOffices = [['あおば居宅', 'アオバキョタク'], ['かえでケアプラン', 'カエデケアプラン'], ['さくら居宅', 'サクラキョタク'], ['たんぽぽ相談室', 'タンポポソウダンシツ'], ['中央ケアプラン', 'チュウオウケアプラン'], ['なのはな居宅', 'ナノハナキョタク'], ['ひまわり支援', 'ヒマワリシエン'], ['みどり居宅', 'ミドリキョタク'], ['やまぶき相談室', 'ヤマブキソウダンシツ'], ['若葉ケア', 'ワカバケア']].map((x, i) => ({ name: x[0], kana: x[1], phone: `03-0000-00${10 + i}`, fax: '' }));
    d.systemSettings.cmOffices.push({ name: '青空居宅介護支援', phone: '03-0000-0030', fax: '' }); // ふりがな未登録
    d.systemSettings.careManagers = [{ office: 'さくら居宅', name: '齋藤', kana: 'サイトウ', kanaLast: 'サイトウ', kanaFirst: '' }, { office: '中央ケアプラン', name: '阿佐田 実', kana: 'アサダ ミノル', kanaLast: 'アサダ', kanaFirst: 'ミノル' }];
    A.cmOffice = 'さくら居宅'; A.cmName = '齋藤'; A.cmHistory = [{ office: '旧あさひ事業所', name: '見本 太郎', from: '2026-01-01', to: '2026-03-31', note: '' }, { office: 'さくら居宅', name: '齋藤', from: '2026-04-01', to: null, note: '' }];
    d.scheduleEvents = [];
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0');
    sessionStorage.setItem('tsumugiActiveRecorder', JSON.stringify({ id: 'demo_rec', name: '見本 職員', roleLabel: '介護職員' }));
    sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view, pid: pid === 'A' ? A.id : null, t: Date.now() }));
    return { A: A.id, An: A.name, Q: Q.id, n: d.patients.filter(p => p.status === '利用中' || p.status === '休止').length, out: (d.patients.find(p => p.status === '退所') || {}).id ?? null }; }, [view, pid]);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2200); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {}); return { page, ids, ctx }; };
const data = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('daycareAppData_v3')));
const vals = (page, id) => page.locator(`[data-testid="${id}-opt"]`).evaluateAll(os => os.map(o => o.getAttribute('data-value')));
const opt = (page, id, v) => page.locator(`[data-testid="${id}-opt"][data-value="${v}"]`);

// ===== A カレンダーの予定(PC) =====
{ const { page, ids, ctx } = await boot(PC, 'schedule', null);
  await page.locator('button:visible', { hasText: /^予定を追加$/ }).first().click(); await page.waitForTimeout(400);
  const bt = page.getByTestId('sch-patient');
  ok('A1 利用者の欄は押して開くボタン(初めは「なし」)', await bt.evaluate(e => e.tagName === 'BUTTON' && /なし/.test(e.innerText) && e.getAttribute('data-value') === ''));
  await bt.click(); await page.waitForTimeout(350);
  const q = page.getByTestId('sch-patient-q');
  const qa = await q.evaluate(e => ({ name: e.getAttribute('name'), ac: e.getAttribute('autocomplete'), ph: e.getAttribute('placeholder'), focus: document.activeElement === e, fs: getComputedStyle(e).fontSize }));
  ok('A2 検索欄がある(自動入力を止める印つき・名前/氏名/住所の語なし・PCは初めから入力できる)', qa.name === 'tsu-q' && qa.ac === 'off' && !/名前|氏名|住所/.test(qa.ph || '') && qa.focus && qa.fs === '16px', qa);
  const heads = await page.locator('[data-testid="sch-patient-pop"] [data-pick-row]').evaluateAll(es => es.map(e => e.getAttribute('data-pick-row')));
  const chips = await page.locator('[data-testid="sch-patient-chip"]').evaluateAll(es => es.map(e => e.getAttribute('data-row')));
  ok('A3 あ行〜の見出しで分かれ、行へ飛ぶボタンが並ぶ', heads.length >= 9 && JSON.stringify(heads) === JSON.stringify(chips) && heads[0] === 'あ', { heads, chips });
  const ct = await page.locator('[data-testid="sch-patient-chip"]').evaluateAll(es => [...new Set(es.map(e => Math.round(e.getBoundingClientRect().top)))]);
  ok('A3b マウスの端末では行へ飛ぶボタンが1段に並ぶ', ct.length === 1, ct);
  const all = await vals(page, 'sch-patient');
  ok('A4 利用中と休止の方が並ぶ(退所の方は出ない)・休止の方には「休止中」', all.length === ids.n + 1 && all[0] === '' && all.includes(String(ids.Q)) && !(ids.out != null && all.includes(String(ids.out))) && /休止中/.test(await opt(page, 'sch-patient', ids.Q).innerText()), { n: all.length, want: ids.n + 1 });
  const bb = await page.getByTestId('sch-patient-pop').boundingBox();
  ok('A5 一覧は画面の中に収まり、高さが取れている(500px 以上)', bb.x >= 0 && bb.y >= 0 && bb.x + bb.width <= 1366 && bb.y + bb.height <= 900 && bb.width >= 340 && bb.height >= 500, bb);
  await page.screenshot({ path: `${OUT}/pick_sch_pc.png` });
  await page.locator('[data-testid="sch-patient-chip"][data-row="わ"]').click(); await page.waitForTimeout(250);
  const sc = await page.locator('[data-testid="sch-patient-pop"] [role="listbox"]').evaluate(e => ({ top: e.scrollTop, end: e.scrollTop + e.clientHeight >= e.scrollHeight - 2, row: Math.round(e.querySelector('[data-pick-row="わ"]').getBoundingClientRect().top - e.getBoundingClientRect().top) }));
  ok('A6 「わ」を押すと わ行まで進む(いちばん上に来るか、一覧の終わりまで)', sc.top > 0 && (sc.row <= 2 || sc.end), sc);
  await page.locator('[data-testid="sch-patient-chip"][data-row="さ"]').click(); await page.waitForTimeout(250);
  const sc2 = await page.locator('[data-testid="sch-patient-pop"] [role="listbox"]').evaluate(e => Math.round(e.querySelector('[data-pick-row="さ"]').getBoundingClientRect().top - e.getBoundingClientRect().top));
  ok('A6b 「さ」を押すと さ行がいちばん上に来る', Math.abs(sc2) <= 2, sc2);
  await q.fill('たなか'); await page.waitForTimeout(250);
  const hit = await vals(page, 'sch-patient');
  ok('A7 ふりがなで絞れる(「なし」の行は検索中は出ない)', hit.length === 1 && hit[0] === String(ids.A), hit);
  await q.fill('どこにもいない'); await page.waitForTimeout(200);
  ok('A8 見つからないときの文が出る', await page.getByTestId('sch-patient-empty').count() === 1);
  await q.fill('田中'); await page.waitForTimeout(250); await opt(page, 'sch-patient', ids.A).click(); await page.waitForTimeout(300);
  ok('A9 選ぶと一覧が閉じ、欄に名前が出る', await page.getByTestId('sch-patient-pop').count() === 0 && (await bt.innerText()).includes(ids.An) && (await bt.getAttribute('data-value')) === String(ids.A));
  await bt.click(); await page.waitForTimeout(350);
  const selv = await page.locator('[data-testid="sch-patient-opt"][aria-selected="true"]').evaluateAll(es => es.map(e => e.getAttribute('data-value')));
  const selVis = await page.locator('[data-testid="sch-patient-opt"][aria-selected="true"]').first().evaluate(e => { const r = e.getBoundingClientRect(); const l = e.closest('[role="listbox"]').getBoundingClientRect(); return r.top >= l.top - 1 && r.bottom <= l.bottom + 1; });
  ok('A10 開き直すと今の選択に印があり、見える所まで進んでいる', JSON.stringify(selv) === JSON.stringify([String(ids.A)]) && selVis, { selv, selVis });
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  ok('A11 Esc は一覧だけ閉じる(予定の入力は残る)', await page.getByTestId('sch-patient-pop').count() === 0 && await page.getByTestId('sch-modal').count() === 1);
  await bt.click(); await page.waitForTimeout(300); await opt(page, 'sch-patient', '').click(); await page.waitForTimeout(250);
  ok('A12 「なし」を選ぶと外れる', (await bt.getAttribute('data-value')) === '' && /なし/.test(await bt.innerText()));
  await bt.click(); await page.waitForTimeout(300); await page.mouse.click(1300, 880); await page.waitForTimeout(250);
  ok('A13 一覧の外を押すと一覧だけ閉じる', await page.getByTestId('sch-patient-pop').count() === 0 && await page.getByTestId('sch-modal').count() === 1);
  await bt.click(); await page.waitForTimeout(300); await q.fill('たなか'); await page.waitForTimeout(200); await q.press('Enter'); await page.waitForTimeout(300);
  ok('A14 検索して Enter で先頭の方を選べる', (await bt.getAttribute('data-value')) === String(ids.A) && await page.getByTestId('sch-modal').count() === 1);
  await page.locator('input[placeholder^="タイトル"]').fill('選ぶ欄の見本'); await page.getByTestId('sch-modal-save').click(); await page.waitForTimeout(800);
  const ev = ((await data(page)).scheduleEvents || []).find(e => e.title === '選ぶ欄の見本');
  ok('A15 保存した予定に利用者の番号が元の形のまま入る', !!ev && ev.patientId === ids.A, ev && { patientId: ev.patientId, t: typeof ev.patientId });
  await ctx.close(); }

// ===== B スマホ =====
{ const { page, ids, ctx } = await boot(PHONE, 'schedule', null);
  await page.locator('button:visible', { hasText: /^予定を追加$/ }).first().click().catch(async () => { await page.getByTestId('sch-task-add').click(); }); await page.waitForTimeout(500);
  if (await page.getByTestId('sch-kind-event').count()) { await page.getByTestId('sch-kind-event').tap().catch(() => {}); await page.waitForTimeout(200); }
  const bt = page.getByTestId('sch-patient'); await bt.scrollIntoViewIfNeeded(); await bt.tap(); await page.waitForTimeout(450);
  const bb = await page.getByTestId('sch-patient-pop').boundingBox();
  ok('B1 スマホは下からの紙(全幅・下端につく)', !!bb && Math.round(bb.x) === 0 && Math.round(bb.width) === 430 && Math.abs(bb.y + bb.height - 932) <= 1 && bb.y >= 80, bb);
  const m = await page.evaluate(() => { const q = document.querySelector('[data-testid="sch-patient-q"]'); const rows = [...document.querySelectorAll('[data-testid="sch-patient-opt"]')].map(e => Math.round(e.getBoundingClientRect().height)); const chips = [...document.querySelectorAll('[data-testid="sch-patient-chip"]')].map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }); const x = document.querySelector('[data-testid="sch-patient-close"]').getBoundingClientRect();
    return { focus: document.activeElement === q, qh: Math.round(q.getBoundingClientRect().height), rowMin: Math.min(...rows), chipMin: Math.min(...chips.flat()), x: [Math.round(x.width), Math.round(x.height)], sw: document.documentElement.scrollWidth }; });
  ok('B2 行・行へ飛ぶボタン・×・検索欄は 44px 以上、検索欄には自動で入らない、横にはみ出さない', !m.focus && m.qh >= 44 && m.rowMin >= 44 && m.chipMin >= 44 && m.x[0] >= 44 && m.x[1] >= 44 && m.sw <= 430, m);
  await page.screenshot({ path: `${OUT}/pick_sch_phone.png` });
  // 一覧を指で動かせる
  const st = await page.locator('[data-testid="sch-patient-pop"] [role="listbox"]').evaluate(e => { e.scrollTop = 400; return { top: e.scrollTop, sh: e.scrollHeight, ch: e.clientHeight }; });
  ok('B3 一覧は中でスクロールできる', st.sh > st.ch && st.top > 0, st);
  await page.getByTestId('sch-patient-close').tap(); await page.waitForTimeout(300);
  ok('B4 × で一覧だけ閉じる', await page.getByTestId('sch-patient-pop').count() === 0 && await page.getByTestId('sch-modal').count() === 1);
  await bt.tap(); await page.waitForTimeout(400); const o = opt(page, 'sch-patient', ids.A); await o.scrollIntoViewIfNeeded(); await o.tap(); await page.waitForTimeout(300);
  ok('B5 押して選べる', (await bt.getAttribute('data-value')) === String(ids.A) && (await bt.innerText()).includes(ids.An));
  await ctx.close(); }

// ===== B' iPad(指・横 1080) =====
{ const { page, ids, ctx } = await boot({ viewport: { width: 1080, height: 810 }, isMobile: true, hasTouch: true, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }, 'schedule', null);
  await page.locator('button:visible', { hasText: /^予定を追加$/ }).first().click(); await page.waitForTimeout(500);
  const bt = page.getByTestId('sch-patient'); await bt.scrollIntoViewIfNeeded(); await bt.tap(); await page.waitForTimeout(450);
  const bb = await page.getByTestId('sch-patient-pop').boundingBox();
  const m = await page.evaluate(() => { const q = document.querySelector('[data-testid="sch-patient-q"]'); const chips = [...document.querySelectorAll('[data-testid="sch-patient-chip"]')].map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }); const l = document.querySelector('[data-testid="sch-patient-pop"] [role="listbox"]'); return { focus: document.activeElement === q, chipMin: Math.min(...chips.flat()), listH: Math.round(l.getBoundingClientRect().height) }; });
  ok("B'1 iPad: 一覧は画面の中・行へ飛ぶボタンは 44px・検索欄に自動で入らない・一覧の高さが取れている", !!bb && bb.x >= 0 && bb.y >= 0 && bb.x + bb.width <= 1080 && bb.y + bb.height <= 810 && m.chipMin >= 44 && !m.focus && m.listH >= 320, { bb, m });
  await page.screenshot({ path: `${OUT}/pick_sch_ipad.png` });
  const o = opt(page, 'sch-patient', ids.A); await o.scrollIntoViewIfNeeded(); await o.tap(); await page.waitForTimeout(300);
  ok("B'2 iPad: 押して選べる", (await bt.getAttribute('data-value')) === String(ids.A));
  await ctx.close(); }

// ===== C 申し送り =====
{ const { page, ids, ctx } = await boot(PC, 'dashboard', null);
  await page.getByTestId('home-memo-add').click(); await page.waitForTimeout(400);
  const bt = page.getByTestId('memo-pt'); ok('C1 申し送りの利用者の欄(初めは全体への連絡)', /全体への連絡/.test(await bt.innerText()));
  await bt.click(); await page.waitForTimeout(300); await page.getByTestId('memo-pt-q').fill('やまだ'); await page.waitForTimeout(250);
  const hit = await vals(page, 'memo-pt'); await page.locator('[data-testid="memo-pt-opt"]').first().click(); await page.waitForTimeout(250);
  await page.getByTestId('memo-text').fill('選ぶ欄の見本の申し送り'); await page.getByTestId('memo-save').click(); await page.waitForTimeout(900);
  const d = await data(page); const mm = (d.scheduleEvents || []).find(e => e.kind === 'memo' && e.title === '選ぶ欄の見本の申し送り'); const p = d.patients.find(x => x.name === '山田 見本');
  ok('C2 ふりがなで探して選び、保存すると利用者の番号が入る', hit.length === 1 && !!mm && !!p && mm.patientId === p.id, mm && { patientId: mm.patientId, want: p && p.id });
  await ctx.close(); }

// ===== D ケアマネ事業所 =====
{ const { page, ctx } = await boot(PC, 'cmmaster', null);
  ok('D1 ふりがな未登録の件数が出る', /ふりがな未登録 1件/.test(await page.getByTestId('cm-office-nokana').innerText().catch(() => '')));
  await page.locator('button:visible', { hasText: /事業所を追加/ }).first().click(); await page.waitForTimeout(400);
  ok('D2 追加の小窓にふりがなの欄がある', await page.getByTestId('cm-office-kana-new').count() === 1);
  await page.getByTestId('cm-office-name-new').fill('見本ケアセンター'); await page.getByTestId('cm-office-kana-new').fill('みほんけあせんたー'); await page.waitForTimeout(200);
  ok('D3 ひらがなで入れてもカタカナになる', (await page.getByTestId('cm-office-kana-new').inputValue()) === 'ミホンケアセンター');
  await page.screenshot({ path: `${OUT}/pick_office_add.png` });
  const t0 = Date.now() - 5 * 60000;
  await page.locator('button:visible', { hasText: /^追加$/ }).last().click(); await page.waitForTimeout(1000);
  let d = await data(page); let o = (d.systemSettings.cmOffices || []).find(x => x.name === '見本ケアセンター');
  ok('D4 保存した事業所に ふりがな と その時刻 が入る', !!o && o.kana === 'ミホンケアセンター' && Number(o._kanaTs) > t0, o);
  // ふりがななしで追加 → kana なし・時刻なし
  await page.locator('button:visible', { hasText: /事業所を追加/ }).first().click(); await page.waitForTimeout(400);
  await page.getByTestId('cm-office-name-new').fill('見本相談室'); ok('D5 2回目に開いたとき、ふりがなの欄は空', (await page.getByTestId('cm-office-kana-new').inputValue()) === '');
  await page.locator('button:visible', { hasText: /^追加$/ }).last().click(); await page.waitForTimeout(1000);
  d = await data(page); o = (d.systemSettings.cmOffices || []).find(x => x.name === '見本相談室');
  ok('D6 ふりがなを入れずに追加もできる(時刻は付けない)・未登録は2件に', !!o && !o.kana && o._kanaTs === undefined && /ふりがな未登録 2件/.test(await page.getByTestId('cm-office-nokana').innerText()), o);
  // 編集
  const editOf = async (name) => { const idx = await page.evaluate((name) => { const bs = [...document.querySelectorAll('button[title="編集"]')].filter(b => b.offsetParent); return bs.findIndex(b => { const row = b.parentElement; return row && (row.innerText || '').split('\n')[0].trim() === name; }); }, name); if (idx < 0) return false; await page.locator('button[title="編集"]:visible').nth(idx).click(); await page.waitForTimeout(500); return true; };
  const save = async () => { await page.locator('button:visible', { hasText: /^(保存|更新|保存する)$/ }).last().click(); await page.waitForTimeout(1100); };
  ok('D7 事業所の編集が開く', await editOf('さくら居宅') && (await page.getByTestId('cm-office-kana-edit').inputValue()) === 'サクラキョタク');
  const tel = page.locator('input[inputmode="tel"]:visible').first(); await tel.fill('03-0000-0099'); await tel.press('Tab'); await save();
  d = await data(page); o = d.systemSettings.cmOffices.find(x => x.name === 'さくら居宅');
  ok('D8 電話だけ直したとき、ふりがなの時刻は付かない', !!o && o.phone === '03-0000-0099' && o.kana === 'サクラキョタク' && o._kanaTs === undefined, o);
  ok('D9 ふりがなのない事業所の編集', await editOf('青空居宅介護支援') && (await page.getByTestId('cm-office-kana-edit').inputValue()) === '');
  await page.getByTestId('cm-office-kana-edit').fill('あおぞらきょたくかいごしえん'); await page.waitForTimeout(200); await save();
  d = await data(page); o = d.systemSettings.cmOffices.find(x => x.name === '青空居宅介護支援');
  ok('D10 ふりがなを入れると kana と時刻が入り、未登録は1件に戻る', !!o && o.kana === 'アオゾラキョタクカイゴシエン' && Number(o._kanaTs) > t0 && o.phone === '03-0000-0030' && /ふりがな未登録 1件/.test(await page.getByTestId('cm-office-nokana').innerText()), o);
  // 担当者を追加 → 所属事業所の選ぶ欄
  await page.locator('button:visible', { hasText: /担当者を追加/ }).first().click(); await page.waitForTimeout(500);
  const bt = page.getByTestId('cm-new-office'); ok('D11 担当者の追加の所属事業所は選ぶ欄', await bt.count() === 1 && await bt.evaluate(e => e.tagName === 'BUTTON'));
  await bt.click(); await page.waitForTimeout(350);
  const heads = await page.locator('[data-testid="cm-new-office-pop"] [data-pick-row]').evaluateAll(es => es.map(e => [e.getAttribute('data-pick-row'), e.querySelectorAll('[data-testid="cm-new-office-opt"]').length]));
  const first = await page.locator('[data-testid="cm-new-office-pop"] [data-pick-row="あ"] [data-testid="cm-new-office-opt"]').evaluateAll(es => es.map(e => e.getAttribute('data-value')));
  ok('D12 事業所があいうえおの行で分かれる(ふりがなを入れた漢字の事業所は あ行・入れていない事業所は その他)', JSON.stringify(first) === JSON.stringify(['青空居宅介護支援', 'あおば居宅']) && heads.some(h => h[0] === 'その他' && h[1] === 1) && heads.some(h => h[0] === 'ま' && h[1] === 2), heads);
  await page.screenshot({ path: `${OUT}/pick_office_pc.png` });
  await page.getByTestId('cm-new-office-q').fill('あおぞら'); await page.waitForTimeout(250);
  const hit = await vals(page, 'cm-new-office'); ok('D13 漢字の事業所をふりがなで探せる', JSON.stringify(hit) === JSON.stringify(['青空居宅介護支援']), hit);
  await opt(page, 'cm-new-office', '青空居宅介護支援').click(); await page.waitForTimeout(300);
  ok('D14 選ぶと欄に事業所名が出る', (await bt.getAttribute('data-value')) === '青空居宅介護支援' && (await bt.innerText()).includes('青空居宅介護支援'));
  await ctx.close(); }

// ===== E 利用者マスタ =====
{ const { page, ctx } = await boot(PC, 'master', 'A');
  await page.locator('button:visible', { hasText: /^担当を変更$/ }).first().click(); await page.waitForTimeout(500);
  const bt = page.getByTestId('cm-change-office'); ok('E1 担当を変更の事業所は選ぶ欄(今の事業所が出ている)', await bt.count() === 1 && (await bt.getAttribute('data-value')) === 'さくら居宅');
  await bt.click(); await page.waitForTimeout(350); await page.getByTestId('cm-change-office-q').fill('ちゅうおう'); await page.waitForTimeout(250);
  await opt(page, 'cm-change-office', '中央ケアプラン').click(); await page.waitForTimeout(300);
  const names = await page.evaluate(() => { const b = document.querySelector('[data-testid="cm-change-office"]'); let m = b; for (let i = 0; i < 8 && m; i++, m = m.parentElement) { const s = m.querySelectorAll('select'); if (s.length) return [...s[0].options].map(o => o.textContent); } return null; });
  ok('E2 事業所を選ぶと、担当者はその事業所の人に変わる', (await bt.getAttribute('data-value')) === '中央ケアプラン' && !!names && names.some(t => /阿佐田 実/.test(t)) && !names.some(t => /齋藤/.test(t)), names);
  await page.locator('button:visible', { hasText: /^(キャンセル|やめる|閉じる)$/ }).last().click(); await page.waitForTimeout(400);
  await page.locator('button:visible', { hasText: /変更履歴/ }).first().click(); await page.waitForTimeout(700);
  const hb = page.locator('[data-testid^="hist-edit-cm-"]'); const n = await hb.count(); let found = false;
  for (let i = 0; i < n && !found; i++) { await hb.nth(i).click(); await page.waitForTimeout(500);
    const v = await page.getByTestId('hist-cm-office').getAttribute('data-value');
    if (v === '旧あさひ事業所') { found = true; break; }
    await page.locator('button:visible', { hasText: /^(キャンセル|やめる|閉じる)$/ }).last().click(); await page.waitForTimeout(400); }
  ok('E3 名簿にない事業所の履歴を開ける', found, n);
  if (found) { const h = page.getByTestId('hist-cm-office');
    ok('E4 欄に「名簿にありません」と添えて今の値が出る', /旧あさひ事業所/.test(await h.innerText()) && /名簿にありません/.test(await h.innerText()));
    await h.click(); await page.waitForTimeout(350); const v = await vals(page, 'hist-cm-office');
    ok('E5 一覧のいちばん上(「選んでください」の次)に名簿にない今の事業所', v[0] === '' && v[1] === '旧あさひ事業所' && v.length === 13, v.slice(0, 3));
    await opt(page, 'hist-cm-office', 'さくら居宅').click(); await page.waitForTimeout(300);
    ok('E6 名簿の事業所に選び直せる(担当者はその事業所の人)', (await h.getAttribute('data-value')) === 'さくら居宅' && (await page.getByTestId('hist-cm-name').locator('option').allInnerTexts()).some(t => /齋藤/.test(t))); }
  await ctx.close(); }
// ===== F お知らせの投稿(ケアマネあて・個別) =====
{ const { page, ctx } = await boot(PC, 'family_admin', null);
  await page.locator('label:visible', { hasText: /個別に表示/ }).first().click(); await page.waitForTimeout(400);
  const bt = page.getByTestId('post-cm-office');
  ok('F1 お知らせの宛先の事業所は選ぶ欄', await bt.count() === 1 && /事業所を選択してください/.test(await bt.innerText()));
  if (await bt.count()) { await bt.scrollIntoViewIfNeeded(); await bt.click(); await page.waitForTimeout(350); await page.getByTestId('post-cm-office-q').fill('さくら'); await page.waitForTimeout(250);
    await opt(page, 'post-cm-office', 'さくら居宅').click(); await page.waitForTimeout(300);
    ok('F2 事業所を選ぶと、その事業所の担当者が出る', (await bt.getAttribute('data-value')) === 'さくら居宅' && (await page.locator('body').innerText()).includes('齋藤')); }
  await ctx.close(); }

// ===== G ご関係者の登録(ケアマネの招待・事業所が決まっていないとき) =====
{ const ctx = await b.newContext(PC); const page = await ctx.newPage(); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.goto(BASE + '/?family', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(600);
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.familyInvites = [{ code: 'DEMO1234', relation: 'ケアマネージャー', email: '' }];
    d.systemSettings = { ...(d.systemSettings || {}), cmOffices: [{ name: 'さくら居宅', kana: 'サクラキョタク' }, { name: '青空居宅介護支援' }, { name: '中央ケアプラン', kana: 'チュウオウケアプラン' }], careManagers: [{ office: 'さくら居宅', name: '齋藤' }] };
    localStorage.setItem('tsumugiFamilyAppData_v1', JSON.stringify(d)); sessionStorage.clear(); });
  await page.goto(BASE + '/?family&invite=DEMO1234', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1500);
  const bt = page.getByTestId('signup-cm-office'); ok('G1 登録画面の事業所は選ぶ欄', await bt.count() === 1);
  if (await bt.count()) { await bt.scrollIntoViewIfNeeded(); await bt.click(); await page.waitForTimeout(400);
    const v = await vals(page, 'signup-cm-office'); ok('G2 いちばん下に「新規作成」', JSON.stringify(v) === JSON.stringify(['', 'さくら居宅', '中央ケアプラン', '青空居宅介護支援', '__new__']), v);
    await opt(page, 'signup-cm-office', '__new__').click(); await page.waitForTimeout(300);
    ok('G3 新規作成を選ぶと欄にそう出る', /新規作成/.test(await bt.innerText()) && (await bt.getAttribute('data-value')) === '__new__');
    await bt.click(); await page.waitForTimeout(300); await opt(page, 'signup-cm-office', 'さくら居宅').click(); await page.waitForTimeout(300);
    ok('G4 名簿の事業所に選び直せる', (await bt.getAttribute('data-value')) === 'さくら居宅'); }
  await ctx.close(); }
await b.close();
const bad = R.filter(x => !x[1]); console.log(bad.length ? `FAIL ${bad.length}: ${bad.map(x => x[0]).join(' / ')}` : 'ALL PASS'); process.exit(bad.length ? 1 : 0);
