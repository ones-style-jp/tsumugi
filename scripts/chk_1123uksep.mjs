// 2026-11-23 trial616(ユーザー「運動器機能向上計画書は全店舗が必要なわけじゃない。各種設定で作るかどうか選べるように。作らないなら個別サービス計画書の中に運動の内容、作るなら個別サービス計画書には書かない」)
//   A 既定(作らない): 要支援の方の 利用者ごと → 「計画書を作る」は個別サービス計画書(通所介護計画書の画面)へ・運動器の入口なし・左の並びに運動器なし・個別サービス計画書の入力に運動の欄(Ⅳ)がある
//   B 各種設定 → 計画書 に「運動器機能向上計画書」の切替があり「作る」を押すと保存される
//   C 作る: 個別サービス計画書の入力に運動の欄が無く案内が出る・利用者ごとに運動器の入口が戻る・左の並びに運動器が出る・運動器の新規作成の題名は「運動器機能向上計画書」で意向の欄なし
//   実行: node chk/chk_1123uksep.mjs [port]
import { chromium } from 'playwright';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
page.on('dialog', d => d.accept()); page.on('pageerror', e => { console.log('PAGEERROR', e.message.slice(0, 200)); fails++; });
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const seed = await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('daycareAppData_v3'));
  const p = (d.patients || []).find(p => p.status === '利用中' && /要支援|事業対象/.test(String(p.careLevel || ''))); if (!p) return null;
  d.systemSettings = d.systemSettings || {}; delete d.systemSettings.undoukiSeparate; delete d.systemSettings.undoukiTitle;
  d.undoukiRecords = (d.undoukiRecords || []).filter(r => r.patientId !== p.id);
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0');
  return { pid: p.id, name: p.name, level: p.careLevel };
});
ok(!!seed, `見本に要支援の方がいる → ${seed ? seed.level : 'なし'}`);
const go = async (view, pid) => { await page.evaluate(([v, id]) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: id, t: Date.now() })), [view, pid || null]); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {}); };
const pickPatient = async () => { const q = page.getByTestId('kk-patient-q'); if (await q.count()) { await q.fill(seed.name.slice(0, 2)); await page.waitForTimeout(300); } const opt = page.getByTestId('kk-patient-opt').filter({ hasText: seed.name }).first(); if (await opt.count()) { await opt.click(); await page.waitForTimeout(800); return true; } return false; };
const setSep = async (v) => page.evaluate((v) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.systemSettings = d.systemSettings || {}; d.systemSettings.undoukiSeparate = v; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); }, v);
// A 既定(作らない)
await go('kinou_patient', seed.pid); await pickPatient();
let body = await page.locator('body').innerText();
ok((await page.getByTestId('uk-start').count()) === 0, 'A1 作らない: 「運動器機能向上計画書を作る」の入口は出ない');
const ks = page.getByTestId('kk-start'); const ksTxt = (await ks.count()) ? await ks.innerText() : '';
ok(/個別サービス計画書/.test(ksTxt) || /評価・計画を始める/.test(ksTxt), `A2 「計画書を作る」の案内は個別サービス計画書(${ksTxt.replace(/\n/g, ' ').slice(0, 40)})`);
const navTxt = await page.locator('body').innerText();
ok(!/運動器機能向上計画書を新しく作ります/.test(navTxt), 'A3 運動器を新しく作る案内は出ない');
const sideUk = await page.locator('button', { hasText: /^運動器機能向上計画書$/ }).count(); ok(sideUk === 0, `A4 左の並びに運動器機能向上計画書は無い(${sideUk})`);
if (/個別サービス計画書/.test(ksTxt)) { await ks.click(); await page.waitForTimeout(1500);
  ok((await page.getByTestId('tk-ex-card').count()) === 1 && (await page.getByTestId('tk-ex-sep').count()) === 0, 'A5 個別サービス計画書の入力に 運動の欄(Ⅳ)がある');
}
// B 各種設定 → 計画書 の切替
await go('settings', null); await page.locator('button:visible', { hasText: /^計画書$/ }).first().click().catch(() => {}); await page.waitForTimeout(600);
ok((await page.getByTestId('tk-uk-separate-setting').count()) === 1, 'B1 各種設定 → 計画書 に「運動器機能向上計画書」の切替がある');
await page.getByTestId('tk-uk-separate-on').click(); await page.waitForTimeout(1200);
const saved = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); return d.systemSettings && d.systemSettings.undoukiSeparate === true; });
ok(saved, 'B2 「作る」を押すと店舗の設定に保存される');
// C 作る
await go('kinou_patient', seed.pid); await pickPatient();
ok((await page.locator('button', { hasText: /^運動器機能向上計画書$/ }).count()) >= 1, 'C1 左の並びに運動器機能向上計画書が出る');
const ks2 = page.getByTestId('kk-start'); const ks2Txt = (await ks2.count()) ? await ks2.innerText() : '';
ok(/運動器機能向上計画書/.test(ks2Txt) || (await page.getByTestId('uk-start').count()) === 1, 'C2 運動器機能向上計画書を作る入口が戻る');
await go('tsusho_keikaku', seed.pid); await pickPatient();
const newBtn = page.locator('button:visible', { hasText: /新規作成|新しく作る/ }).first(); if (await newBtn.count()) { await newBtn.click(); await page.waitForTimeout(1200); }
ok((await page.getByTestId('tk-ex-card').count()) === 0 && (await page.getByTestId('tk-ex-sep').count()) === 1, 'C3 個別サービス計画書の入力に運動の欄が無く、案内が出る');
await go('undouki_keikaku', seed.pid); await pickPatient();
ok((await page.getByTestId('uk-off-note').count()) === 0, 'C4 作る店舗では「作らない」の案内は出ない');
if (await page.getByTestId('uk-new').count()) { await page.getByTestId('uk-new').click(); await page.waitForTimeout(1000);
  body = await page.locator('body').innerText();
  ok(/運動器機能向上計画書の編集/.test(body), 'C5 新規作成の題名は「運動器機能向上計画書」');
  ok(!/本人・家族の意向／介護予防プランの概要/.test(body), 'C6 意向・留意事項の欄は出ない(個別サービス計画書の側に書く)');
}
await setSep(false); await go('undouki_keikaku', seed.pid);
ok((await page.getByTestId('uk-off-note').count()) === 1, 'C7 作らないに戻すと、運動器の画面に案内が出る');
await b.close(); console.log(fails ? `FAIL ${fails}` : 'ALL PASS'); process.exit(fails ? 1 : 0);
