// 2026-11-01 マニュアル24章の画面写真(試験版 trial474〜492・iPad 横・見本データ)
//   ①ホームの申し送り(利用者つき・全体・これからの分) ②申し送りを書く画面 ③カレンダー(申し送り・タスクの印) ④ホームの本日の業務(タスクの四角)
//   ⑤カレンダーの「複製」の緑の帯 ⑥各種設定→LIFE連携(通所介護1行・総合事業1行・CSVバージョン) ⑦個人ファイルの名前を押した小窓(利用者を探す)
//   ⑧フェイスシートの日常生活自立度の欄
//   必ず `node --import ./scripts/shot_fictional.mjs scripts/trial492_manual_shots_1101.mjs [--base http://localhost:4175] [--out public/manual/img]` で実行(実在の店舗名を架空に)
import { chromium } from 'playwright';
import path from 'node:path';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://localhost:4175'); const OUT = arg('--out', 'public/manual/img');
const b = await chromium.launch();
const guard = async (page) => { const t = await page.locator('body').innerText(); const v = await page.evaluate(() => [...document.querySelectorAll('input,textarea,select')].map(e => e.value).join(' '));
  if (/扇橋|6458|ひかり|佐藤\s?健一|岩岡|長谷川/.test(t + v)) { console.log('NG: 実在の店舗名・名前が残っている'); process.exit(1); } };
const facility = (d) => { const nm = '（見本）つむぎデイサービス', ph = '03-0000-0000';
  d.facilityName = nm; d.facilityPhone = ph; d.contactBookConfig = { ...(d.contactBookConfig || {}), facilityName: nm, facilityPhone: ph };
  d.systemSettings = d.systemSettings || {}; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), name: nm, phone: ph, fax: '03-0000-0001', address: '東京都新宿区西新宿2-8-1', zip: '', zipCode: '', building: '', email: '', officeNumber: '1300000000', serviceCode: '15', sougouOfficeNumber: '1300000000', sougouServiceCode: 'A6', insurerNo: '131000' };
  d.systemSettings.addons = { ...(d.systemSettings.addons || {}), kasan_kagaku: true, kasan_adl: true, kasan_kobetsu: true }; };
const ctx = await b.newContext({ viewport: { width: 1180, height: 760 }, deviceScaleFactor: 1.5, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept());
page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 160)));
await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const S = await page.evaluate((facSrc) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); (new Function('d', facSrc))(d);
  d.systemSettings.facilityInfo.closedDays = [0]; d.holidays = [];
  const act = d.patients.filter(p => p.status === '利用中' && !p.endDate && String(p.careLevel || '').startsWith('要介護')); const A = act[0], B = act[1];
  [A, B].forEach((p, i) => { p.insuranceNo = String(1000000001 + i); const fs = { ...(((p.personalFile || {}).faceSheet) || {}) }; delete fs.adlLevel; delete fs.dementiaLevel; p.personalFile = { ...(p.personalFile || {}), faceSheet: fs }; });
  d.scheduleEvents = (d.scheduleEvents || []).filter(e => !(e && (e.kind === 'memo' || e.kind === 'task')));
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0');
  const t = new Date(); const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; const n = new Date(t); n.setDate(n.getDate() + 2);
  return { A: A.id, B: B.id, An: A.name, today: iso(t), n2: iso(n) }; }, `(${facility.toString()})(d)`);
const go = async (view, extra) => { await page.evaluate(([v, x]) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: null, t: Date.now(), ...(x || {}) })), [view, extra]);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {}); };
const shot = async (name, opts) => { await guard(page); await page.screenshot({ path: path.join(OUT, name), type: 'jpeg', quality: 85, ...opts }); console.log('saved', name); };
const eshot = async (name, loc, pad = 10) => { await guard(page); const bb = await loc.boundingBox(); if (!bb) { console.log('NG: 要素がない', name); process.exit(1); }
  await page.screenshot({ path: path.join(OUT, name), type: 'jpeg', quality: 85, clip: { x: Math.max(0, bb.x - pad), y: Math.max(0, bb.y - pad), width: Math.min(1180 - Math.max(0, bb.x - pad), bb.width + pad * 2), height: Math.min(760 - Math.max(0, bb.y - pad), bb.height + pad * 2) } }); console.log('saved', name); };
// ① ② 申し送り
await go('dashboard');
const writeMemo = async (pid, text, sp, date) => { await page.getByTestId('home-memo-add').click(); await page.waitForTimeout(400);
  if (pid != null) await page.getByTestId('memo-pt').selectOption(String(pid)); await page.getByTestId('memo-text').fill(text); if (sp) await page.getByTestId('memo-sp').check(); if (date) await page.getByTestId('memo-date').fill(date);
  await page.getByTestId('memo-save').click(); await page.waitForTimeout(900); };
await writeMemo(S.A, '昨夜ご自宅で軽く転倒。今日は運動を少なめに、歩行は見守りで。', true);
await writeMemo(null, '午後、消防の方が設備点検に来られます（14時ごろ）。', false);
await writeMemo(S.B, 'インフルエンザの予防接種のあと。腕の痛みを聞いてください。', false, S.n2);
await page.getByTestId('home-memo-add').click(); await page.waitForTimeout(400);
await page.getByTestId('memo-pt').selectOption(String(S.A)); await page.getByTestId('memo-text').fill('昨夜ご自宅で軽く転倒。今日は運動を少なめに、歩行は見守りで。'); await page.getByTestId('memo-sp').check(); await page.waitForTimeout(300);
await eshot('trial_memo_editor.jpg', page.getByTestId('memo-editor'));
await page.locator('[data-testid="memo-editor"] button', { hasText: 'やめる' }).click(); await page.waitForTimeout(300);
await page.evaluate(() => { const el = document.querySelector('[data-testid="home-memos"]'); el && el.scrollIntoView({ block: 'start' }); }); await page.waitForTimeout(300);
await eshot('trial_home_memo.jpg', page.getByTestId('home-memos'));
// ③ ④ タスク
await go('schedule');
await page.getByTestId('sch-task-add').click(); await page.waitForTimeout(400);
await page.locator('input[placeholder^="やること"]').fill('国保連への請求データの送信'); await page.getByTestId('sch-modal-save').click(); await page.waitForTimeout(900);
await page.getByTestId('sch-task-add').click(); await page.waitForTimeout(400);
await page.locator('input[placeholder^="やること"]').fill('送迎車の洗車・給油'); await page.getByTestId('sch-modal-save').click(); await page.waitForTimeout(900);
await shot('trial_sch_month.jpg', { clip: { x: 0, y: 0, width: 1180, height: 760 } });
// ⑤ 複製の帯
const taskId = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const t = (d.scheduleEvents || []).find(e => e && e.kind === 'task'); return t && t.id; });
if (taskId && await page.getByTestId(`sch-copy-${taskId}`).count()) { await page.getByTestId(`sch-copy-${taskId}`).click(); await page.waitForTimeout(500); await shot('trial_sch_copy.jpg', { clip: { x: 0, y: 0, width: 1180, height: 420 } }); await page.getByTestId('sch-copy-end').click().catch(() => {}); }
else console.log('skip: 複製ボタンがない', taskId);
await go('dashboard');
for (const tier of ['today', 'week', 'month']) { const m = page.getByTestId(`home-tasks-more-${tier}`); if (await m.count()) { await m.click(); await page.waitForTimeout(200); } }
await page.evaluate(() => { const el = document.querySelector('[data-testid="home-tasks"]'); el && el.scrollIntoView({ block: 'start' }); }); await page.waitForTimeout(300);
await eshot('trial_home_task.jpg', page.getByTestId('home-tasks'));
// ⑥ LIFE連携
await go('settings'); await page.getByTestId('settings-vtab-life').click(); await page.waitForTimeout(800);
await shot('trial_life_cfg.jpg', { clip: { x: 0, y: 0, width: 1180, height: 560 } });
// ⑦ 個人ファイルの利用者切替
await go('master', { pid: S.A });
await page.locator('button:visible', { hasText: /個人ファイル/ }).first().click(); await page.waitForTimeout(1200);
await page.getByTestId('pf-pt-switch').click(); await page.waitForTimeout(400);
await page.getByTestId('pf-pt-search').fill('け'); await page.waitForTimeout(400);
await shot('trial_pf_switch.jpg', { clip: { x: 0, y: 0, width: 1180, height: 520 } });
await page.keyboard.press('Escape'); await page.waitForTimeout(300); await page.getByTestId('pf-close-btn').click({ timeout: 1000 }).catch(() => {}); await page.waitForTimeout(400);
// ⑧ フェイスシートの自立度(個人ファイルが開いたままなら閉じる)
await go('master', { pid: S.A }); if (await page.getByTestId('personal-file-modal').count()) { await page.getByTestId('pf-close-btn').click().catch(() => {}); await page.waitForTimeout(600); }
await page.locator('button:visible', { hasText: 'フェイスシートで編集' }).first().click(); await page.waitForTimeout(1500);
await page.getByTestId('fs-adl-level').selectOption('A2'); await page.getByTestId('fs-dem-level').selectOption('Ⅱa');
await page.evaluate(() => { const el = document.querySelector('[data-fs-sec="level"]'); el && el.scrollIntoView({ block: 'center' }); }); await page.waitForTimeout(500);
await eshot('trial_fs_level.jpg', page.locator('[data-fs-sec="level"]'), 14);
await b.close();
