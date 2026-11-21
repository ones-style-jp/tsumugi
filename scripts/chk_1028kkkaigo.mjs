// 2026-10-28 個別機能訓練計画書は要介護だけ: 計画書の利用者の選択・作成予定に要支援の方を出さない(介護度が未登録の方は出す)。
//   利用者ごとは LIFE(科学的介護)のある店舗だけ要支援の方も出し、個別機能訓練計画書は出さない
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4173'; })();
const b = await chromium.launch(); const r = {};
const page = await (await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ja-JP' })).newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
const K = 'daycareAppData_v3';
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
const P = await page.evaluate((K) => { const d = JSON.parse(localStorage.getItem(K)); const ps = (d.patients || []).filter(p => p.status === '利用中'); ps[0].careLevel = '要支援1'; ps[1].careLevel = '要介護1'; ps[2].careLevel = '';
  d.systemSettings = d.systemSettings || {}; d.systemSettings.addons = { ...(d.systemSettings.addons || {}), kasan_kinou2: true, kasan_kagaku: false, kasan_adl: false, kasan_life: false };
  d.kinouKeikakuRecords = (d.kinouKeikakuRecords || []).filter(x => ![ps[0].id, ps[1].id, ps[2].id].includes(x.patientId));
  localStorage.setItem(K, JSON.stringify(d)); return { shien: { id: ps[0].id, name: ps[0].name }, kaigo: { id: ps[1].id, name: ps[1].name }, none: { id: ps[2].id, name: ps[2].name } }; }, K);
const go = async (view, pid) => { await page.evaluate(([v, p]) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: p, t: Date.now() })), [view, pid]); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {}); };
const opts = async () => { await page.getByTestId('kk-patient').click(); await page.waitForTimeout(300); const t = await page.getByTestId('kk-patient-opt').allInnerTexts(); await page.keyboard.press('Escape'); await page.getByTestId('kk-patient').click().catch(() => {}); return t.join('|'); };
// 1) 個別機能訓練計画書: 要支援の方を渡しても選ばれず、選択肢にも出ない
await go('kinou_keikaku', P.shien.id);
const cur = await page.getByTestId('kk-patient').innerText(); const o1 = await opts();
r.kkNoShien = !cur.includes(P.shien.name) && !o1.includes(P.shien.name) && o1.includes(P.kaigo.name) && o1.includes(P.none.name);
// 2) 作成予定(個別機能訓練): 要支援の方の行が無い・要介護の方は「未作成」
await go('kinou_yotei', null); const body = await page.locator('main, #appMainArea').first().innerText();
r.yoteiNoShien = !body.includes(P.shien.name) && body.includes(P.kaigo.name);
// 3) 利用者ごと(LIFE なし): 要支援の方は出ない
await go('kinou_patient', P.shien.id); const o3 = await opts(); r.kpNoShien = !o3.includes(P.shien.name) && o3.includes(P.kaigo.name);
// 4) 利用者ごと(LIFE あり): 要支援の方は出るが、個別機能訓練計画書は出ず案内が出る
await page.evaluate((K) => { const d = JSON.parse(localStorage.getItem(K)); d.systemSettings.addons.kasan_kagaku = true; localStorage.setItem(K, JSON.stringify(d)); }, K);
await go('kinou_patient', P.shien.id);
r.kpShienLife = (await page.getByTestId('kk-patient').innerText()).includes(P.shien.name) && (await page.getByTestId('kk-shien-note').count()) === 1 && (await page.getByTestId('kk-doc-kinou_keikaku').count()) === 0 && (await page.getByTestId('kk-doc-life_hub').count()) === 1;
await go('kinou_patient', P.kaigo.id); r.kpKaigoHasKk = (await page.getByTestId('kk-doc-kinou_keikaku').count()) === 1 && (await page.getByTestId('kk-shien-note').count()) === 0;
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
