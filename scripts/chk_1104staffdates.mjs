// 2026-11-04 trial519(江古田店の事故): 担当職員の「いつから・いつまで」と役職の履歴
//   S1=生活相談員で いつまで=おととい / S2=今は生活相談員・おとといまでは介護職員(_roles) / S3=介護職員(変わらず)
//   ①3日前の日誌: S1 は生活相談員の欄にチェック付きで残る・S2 は介護職員の欄にチェック付き ②今日の日誌: S1 は出ない・S2 は生活相談員の欄
//   ③送迎表の運転者の候補: 3日前は S1 が居る・今日は居ない ④各種設定: × を押すと日付を聞いて「いつまで」が入り「過去の職員」へ移る・役職の「変更…」で日付を聞いて履歴が付く
//   実行: node scripts/chk_1104staffdates.mjs [port]
import { chromium } from 'playwright';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
const r = {};
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = new Date(); const d2 = new Date(today); d2.setDate(d2.getDate() - 1); if (d2.getDay() === 0) d2.setDate(d2.getDate() - 1); /* 過去の日(昨日・日曜なら土曜): 送迎表は日曜の列が無い */ const d3 = d2;
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const S = await page.evaluate(([iso2, iso3, todayIso]) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3'));
  d.diarySettings = d.diarySettings || {}; d.systemSettings = d.systemSettings || {}; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [] }; d.holidays = [];
  const staff = [
    { id: 'stA', role: '管理者', name: '検 管理' },
    { id: 'stS1', role: '生活相談員', name: '検 相談一', _to: iso2 },
    { id: 'stS2', role: '生活相談員', name: '検 相談二', _roles: [{ until: iso2, role: '介護職員', role2: '' }] },
    { id: 'stS3', role: '介護職員', name: '検 介護三' },
    { id: 'stK', role: '機能訓練指導員', name: '検 機能四' },
  ];
  d.diarySettings.staff = staff; d.storeMembers = [];
  d.diaryLogs = d.diaryLogs || {};
  d.diaryLogs[`${iso3}_AM`] = { ...(d.diaryLogs[`${iso3}_AM`] || {}), staff: { stA: true, stS1: true, stS2: true }, staffSubV: 1, _savedAt: Date.now() - 86400000 * 3 };
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d));
  sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'diary', pid: null, t: Date.now(), date: iso3, ampm: 'AM' })); return { ok: true }; }, [isoOf(d2), isoOf(d3), isoOf(today)]);
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
const txt3 = await page.evaluate(() => document.body.innerText);
// 日誌の担当職員の欄: 役職の見出しの後に名前が並ぶ。生活相談員の欄に 相談一、介護職員の欄に 相談二 が居るか(文字の並びで見る)
// 担当職員の欄(「担当職員」〜「利用者」の文字)の中で、名前の直前にある役職の見出しを見る
const roleOf = (t, name) => { const a = t.indexOf('担当職員'); const bIdx = t.indexOf('利用者', a + 1); const sec = t.slice(a, bIdx > 0 ? bIdx : undefined); const i = sec.indexOf(name); if (i < 0) return ''; let best = '', bi = -1; ['管理者', '生活相談員', '機能訓練指導員', '看護師', '介護職員'].forEach(rl => { const j = sec.lastIndexOf(rl, i); if (j > bi) { bi = j; best = rl; } }); return best; };
r.past_S1_in_seikatsu = roleOf(txt3, '検 相談一') === '生活相談員';
r.past_S2_in_kaigo = roleOf(txt3, '検 相談二') === '介護職員';
await page.screenshot({ path: '/tmp/chk_1104staffdates_past.png', fullPage: false }).catch(() => {});
// 今日の日誌
await page.evaluate((iso) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'diary', pid: null, t: Date.now(), date: iso, ampm: 'AM' })), isoOf(today)); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
const txtT = await page.evaluate(() => document.body.innerText);
r.today_S1_gone = !/検 相談一/.test(txtT);
r.today_S2_in_seikatsu = roleOf(txtT, '検 相談二') === '生活相談員';
// 送迎表: 運転者の候補(車の見出しを押すとメニューの選択肢)
const drivers = async (iso) => { await page.evaluate((iso) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, t: Date.now(), date: iso, ampm: 'AM' })), iso); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
  const head = page.locator(`[data-testid^="tp-carhead-${iso}-AM-"]`).first(); if (!(await head.count())) return null; await head.click(); await page.waitForTimeout(400);
  // ★ 2026-11-09 trial531: 候補は選ぶ欄でなく、そのまま並んだ名前のボタン(tp-driver-<車>-opt)
  const opts = page.locator(`[data-testid^="tp-carmenu-${iso}-AM-"] [data-testid$="-opt"]`); if (!(await opts.count())) return null; return await opts.evaluateAll(els => els.map(e => e.dataset.name || e.textContent)); };
const dr3 = await drivers(isoOf(d3)), drT = await drivers(isoOf(today));
if (!dr3) console.log('dr3 null'); r.driver_past_has_S1 = !!dr3 && dr3.some(x => /検 相談一/.test(x)); r.driver_today_no_S1 = !!drT && !drT.some(x => /検 相談一/.test(x)) && drT.some(x => /検 相談二/.test(x));
// 各種設定: × → 日付 → いつまで → 過去の職員
page.on('dialog', d => d.type() === 'prompt' ? d.accept(isoOf(d2)) : d.accept());
await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'settings', pid: null, t: Date.now() }))); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
const tab = page.locator('button:visible', { hasText: /^日誌$/ }); if (await tab.count()) { await tab.first().click(); await page.waitForTimeout(800); } // PC は左の縦の項目(見えているボタン)
r.settings_has_S3 = (await page.getByTestId('staff-retire-stS3').count()) === 1 && (await page.getByTestId('staff-past').count()) === 1 && (await page.getByTestId('staff-past-stS1').count()) === 1;
await page.getByTestId('staff-retire-stS3').click(); await page.waitForTimeout(800);
r.retire_moves_to_past = (await page.getByTestId('staff-past-stS3').count()) === 1 && (await page.getByTestId('staff-retire-stS3').count()) === 0;
const chg = page.getByTestId('staff-role-change-stS2'); if (await chg.count()) { await chg.selectOption('介護職員'); await page.waitForTimeout(800); }
// 各種設定は「保存」を押して確定
const sv = page.locator('button:visible', { hasText: /^保存$/ }); if (await sv.count()) { await sv.first().click(); await page.waitForTimeout(1200); }
const saved = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); return (d.diarySettings.staff || []).map(s => ({ id: s.id, role: s.role, _to: s._to, roles: (s._roles || []).length })); });
const s2 = saved.find(x => x.id === 'stS2'), s3 = saved.find(x => x.id === 'stS3');
r.role_change_history = !!s2 && s2.role === '介護職員' && s2.roles === 2; r.retire_saved = !!s3 && s3._to === isoOf(d2);
await page.screenshot({ path: '/tmp/chk_1104staffdates_settings.png', fullPage: false }).catch(() => {});
await b.close();
const ok = Object.values(r).every(v => v === true); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
