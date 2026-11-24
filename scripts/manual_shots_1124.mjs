// 2026-11-25 マニュアル24章「新しい機能（2026年10月・11月）」の画面写真(試験版 trial493〜634・見本データ)
//   iPad 横: ①ホーム ②送迎表 ③各種設定→日誌(担当職員のいつから・いつまで) ④担当者会議記録の入力画面 ⑤カレンダーの予定の入力画面
//           ⑥「この日だけ消す／すべて消す」の小窓 ⑦LIFE 提出ダッシュボード(チェック列) ⑧各種設定→ログイン・管理者(管理者の交代) ⑨各種設定→計画書(運動器機能向上計画書の切替)
//   スマホ:  ⑩ホーム(下のバー) ⑪提供記録 1人1行 ⑫「キーボードを閉じる」 ⑬上端から引く「今日の予定」
//   必ず `node --import ./scripts/shot_fictional.mjs scripts/manual_shots_1124.mjs [--base http://localhost:4175] [--out public/manual/img]` で実行(実在の店舗名を架空に)
import { chromium, devices } from 'playwright';
import path from 'node:path';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://localhost:4175'); const OUT = arg('--out', 'public/manual/img');
const b = await chromium.launch(); const done = [];
const guard = async (page) => { const t = await page.locator('body').innerText(); const v = await page.evaluate(() => [...document.querySelectorAll('input,textarea,select')].map(e => e.value).join(' '));
  if (/扇橋|6458|ひかり|佐藤\s?健一|岩岡|長谷川/.test(t + v)) { console.log('NG: 実在の店舗名・名前が残っている'); process.exit(1); } };
const facility = (d) => { const nm = '（見本）つむぎデイサービス', ph = '03-0000-0000';
  d.facilityName = nm; d.facilityPhone = ph; d.contactBookConfig = { ...(d.contactBookConfig || {}), facilityName: nm, facilityPhone: ph };
  d.systemSettings = d.systemSettings || {}; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), name: nm, phone: ph, fax: '03-0000-0001', address: '東京都新宿区西新宿2-8-1', officeNumber: '1300000000', serviceCode: '78', insurerNo: '130000', lifeDefaultJob: '050' };
  d.systemSettings.addons = { ...(d.systemSettings.addons || {}), kasan_kagaku: true, kasan_adl: true, kasan_kinou2: true }; };
const seed = `(${facility.toString()})(d);
  d.systemSettings.facilityInfo.closedDays = [0]; d.holidays = [];
  const t = new Date(); const iso = (x) => \`\${x.getFullYear()}-\${String(x.getMonth() + 1).padStart(2, '0')}-\${String(x.getDate()).padStart(2, '0')}\`; const p2 = new Date(t); p2.setDate(p2.getDate() + 2);
  const act = d.patients.filter(p => p.status === '利用中' && !p.endDate && String(p.careLevel || '').startsWith('要介護')); const A = act[0], B = act[1];
  const items = {}; ['eat','transfer','groom','toilet','bath','walk','stairs','dress','stool','urine'].forEach(k => items[k] = 5);
  [A, B].forEach((p, i) => { p.insuranceNo = String(1000000001 + i); p.birthDate = p.birthDate || '1940-01-01'; p.gender = p.gender || '女'; p.personalFile = { ...(p.personalFile || {}), faceSheet: { ...(((p.personalFile || {}).faceSheet) || {}), adlLevel: 'A2', dementiaLevel: 'IIa' }, meetings: [] }; });
  d.adlRecords = [A, B].map((p, i) => ({ id: 'man-adl-' + i, patientId: p.id, evalDate: iso(new Date(t.getFullYear(), t.getMonth() - (i ? 1 : 0), 15)), evaluator: '見本 職員', items, total: 50, adlMonth: i === 0 ? 'first' : '', science: { height: '150', weight: '45', denture: 0, choke: 0, stains_on_teeth: 0, condition_of_gums: 0, dementia_diagnosis: 0 } }));
  d.scheduleEvents = (d.scheduleEvents || []).filter(e => !(e && (e.kind === 'memo' || e.kind === 'task')));
  d.scheduleEvents.push({ id: 'man_memo_3d', kind: 'memo', color: '#f97316', date: iso(t), endDate: iso(p2), title: '来週の避難訓練は10時から。動きやすい服装でお願いします', patientId: '', by: '見本 職員', at: new Date().toISOString(), _savedAt: Date.now() });
  d.scheduleEvents.push({ id: 'man_task_1', kind: 'task', color: '#059669', date: iso(t), title: '月末の請求の確認', start: '', end: '', _savedAt: Date.now() });
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0');
  return { A: A.id, B: B.id, today: iso(t) };`;
const boot = async (ctx) => { const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 160)));
  await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  const S = await page.evaluate((src) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); return (new Function('d', src))(d); }, seed);
  const go = async (view, extra) => { await page.evaluate(([v, x]) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: null, t: Date.now(), ...(x || {}) })), [view, extra]);
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {}); await guard(page); };
  const shot = async (name, loc) => { const p = path.join(OUT, name + '.jpg'); if (loc) await loc.screenshot({ path: p, type: 'jpeg', quality: 82 }); else await page.screenshot({ path: p, type: 'jpeg', quality: 82 }); done.push(name); console.log('shot', name); };
  return { page, S, go, shot }; };

// ===== iPad 横 =====
{ const ctx = await b.newContext({ viewport: { width: 1180, height: 760 }, deviceScaleFactor: 1.5, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const { page, S, go, shot } = await boot(ctx);
  await go('dashboard'); await shot('nov_home');
  // ⑥ この日だけ消す(ホームの申し送りの削除)
  await page.getByTestId('memo-rdel-man_memo_3d').click().catch(() => {}); await page.waitForTimeout(500);
  if (await page.getByTestId('del-scope').count()) await shot('nov_del_scope'); await page.getByTestId('del-scope-cancel').click().catch(() => {});
  await go('transport'); await shot('nov_transport');
  await go('schedule'); await page.locator('button:visible', { hasText: /^予定を追加$/ }).first().click().catch(() => {}); await page.waitForTimeout(500);
  if (await page.getByTestId('sch-modal').count()) await shot('nov_sch_form');
  await go('life_submit'); await shot('nov_life_sel');
  await go('settings'); await page.getByTestId('settings-vtab-login').click().catch(() => {}); await page.waitForTimeout(700);
  if (await page.getByTestId('handover-box').count()) { await page.getByTestId('handover-box').scrollIntoViewIfNeeded(); await shot('nov_handover_box'); }
  await page.getByTestId('handover-open').click().catch(() => {}); await page.waitForTimeout(500);
  if (await page.getByTestId('handover-modal').count()) await shot('nov_handover_modal'); await page.keyboard.press('Escape').catch(() => {});
  await go('settings'); await page.getByTestId('settings-vtab-keikaku').click().catch(() => {}); await page.waitForTimeout(700);
  if (await page.getByTestId('tk-uk-separate-setting').count()) { await page.getByTestId('tk-uk-separate-setting').scrollIntoViewIfNeeded(); await shot('nov_uk_setting'); }
  await go('settings'); await page.getByTestId('settings-vtab-diary').click().catch(() => {}); await page.waitForTimeout(700); await shot('nov_staff_rows');
  // ④ 担当者会議記録(個人ファイル → ケアプラン・担当者会議 → 新規)
  await page.evaluate(([pid]) => { sessionStorage.setItem('tsumugiReopenPF', JSON.stringify({ patientId: pid, tab: 'cat_3' })); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'master', pid, t: Date.now() })); }, [S.A]);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await guard(page);
  const M = page.locator('[data-testid="personal-file-modal"]');
  if (await M.count()) { await page.locator('[data-testid="personal-file-modal"] button:visible', { hasText: /ケアプラン・担当者会議/ }).first().click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(600);
    await page.locator('[data-testid="personal-file-modal"] button:visible', { hasText: /新規|新しく|追加/ }).first().click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(800);
    if (await page.getByTestId('meeting-float').count()) await shot('nov_meeting'); }
  await ctx.close(); }

// ===== スマホ =====
{ const ctx = await b.newContext({ ...devices['iPhone 14'], locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const { page, go, shot } = await boot(ctx);
  await go('dashboard'); await shot('nov_sp_home');
  await go('record'); await page.waitForTimeout(800); await shot('nov_sp_record');
  // ⑫ キーボードを閉じる: 一覧の行を押して textarea に触れる
  const row = page.locator('[data-testid="sp-phone-list"] [data-testid^="sp-row-"], [data-testid="sp-phone-list"] button').first(); if (await row.count()) { await row.tap().catch(() => {}); await page.waitForTimeout(600); }
  const ta = page.locator('[data-testid="sp-phone-list"] textarea').first();
  if (await ta.count()) { await ta.tap().catch(() => {}); await page.waitForTimeout(600); if (await page.getByTestId('tsu-kb-close').isVisible().catch(() => false)) await shot('nov_sp_kbclose'); }
  // ⑬ 今日の予定: 上端から下へ引く(CDP のタッチ)
  await go('dashboard'); const cdp = await ctx.newCDPSession(page);
  const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  await touch('touchStart', 196, 2); for (let i = 1; i <= 12; i++) { await touch('touchMove', 196, 2 + i * 25); await page.waitForTimeout(16); } await touch('touchEnd', 196, 302); await page.waitForTimeout(900);
  if (await page.getByTestId('tsu-today-sheet').count()) await shot('nov_sp_today');
  await ctx.close(); }
await b.close(); console.log('done', done.length, done.join(','));
