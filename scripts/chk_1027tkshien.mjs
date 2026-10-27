// 2026-10-27 通所介護計画書の 要介護/要支援・暫定・アセスメントのタブ・要支援の計画書の名前・個別機能訓練計画書の暫定
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4173'; })();
const b = await chromium.launch(); const r = {};
const page = await (await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ja-JP' })).newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
const K = 'daycareAppData_v3';
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
// 利用中の2人: A=要支援2(運動の予定あり)・B=介護度なし(申請中)
const ids = await page.evaluate((K) => { const d = JSON.parse(localStorage.getItem(K)); const ps = (d.patients || []).filter(p => p.status === '利用中'); const A = ps[0], B = ps[1];
  A.careLevel = '要支援2'; A.cmOffice = '見本地域包括支援センター'; A.cmName = '見本 花子'; A.careLevelFrom = '2026-04-01'; A.careLevelTo = '2027-03-31'; A.plannedExercises = { ...(A.plannedExercises || {}), u1: '10分', u2: '3分' }; A.plannedExercisesHistory = undefined;
  B.careLevel = ''; d.tsushoKeikakuRecords = (d.tsushoKeikakuRecords || []).filter(x => x.patientId !== A.id && x.patientId !== B.id);
  localStorage.setItem(K, JSON.stringify(d)); return { A: A.id, B: B.id }; }, K);
const go = async (view, pid) => { await page.evaluate(([v, p]) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: p, t: Date.now() })), [view, pid]); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {}); };
const recs = (pid) => page.evaluate(([K, pid]) => (JSON.parse(localStorage.getItem(K)).tsushoKeikakuRecords || []).filter(x => x.patientId === pid), [K, pid]);
const printHtml = () => page.evaluate(() => (document.getElementById('tk-print-area') || {}).innerHTML || '');
// 1) 要支援の方: 要支援の計画書(種類は固定・総合事業の欄・個別の運動が提供記録から入る)
await go('tsusho_keikaku', ids.A);
await page.locator('button', { hasText: '＋ 新規作成' }).first().click(); await page.waitForTimeout(600);
r.shienFixed = (await page.getByTestId('tk-type-shien').getAttribute('class')).includes('bg-teal-600') && await page.getByTestId('tk-type-kaigo').isDisabled();
r.shienFields = (await page.getByTestId('tk-shien-basic').count()) === 1 && (await page.locator('label:visible', { hasText: '通所介護利用までの経緯' }).count()) === 0 && (await page.locator('label:visible', { hasText: '介護予防サービス・支援計画（ケアプラン）の概要' }).count()) === 1; // 見えている欄だけ(印刷の中身は数えない)
const exN = await page.getByTestId('tk-ex-row').count(); const ex0 = exN ? await page.getByTestId('tk-ex-row').first().locator('input').first().inputValue() : '';
r.exFromRecord = exN >= 2 && /バイク/.test(ex0);
await page.locator('button', { hasText: '保存して閉じる' }).first().click(); await page.waitForTimeout(800);
let ra = await recs(ids.A); let h = await printHtml();
r.shienSaved = ra.length === 1 && ra[0].planType === 'shien' && ra[0].cpOffice === '見本地域包括支援センター' && (ra[0].exercises || []).length >= 2;
r.shienPrint = h.includes('【個別サービス計画書（介護予防・日常生活支援総合事業）】') && h.includes('個別の運動（機能訓練）の実施内容') && h.includes('要支援度') && h.includes('見本地域包括支援センター') && h.includes('説明を受け、同意し、交付を受けました') && !h.includes('通所介護利用までの経緯');
// 2) 各種設定で名前を江東区のものに → 印刷の題名が変わる
await go('settings', null);
await page.getByTestId('settings-search-input').fill('要支援'); await page.waitForTimeout(300); await page.locator('[data-testid^="settings-search-hit-"]', { hasText: /要支援の計画書の名前/ }).first().click(); await page.waitForTimeout(800);
await page.getByTestId('tk-shien-title-setting').locator('button', { hasText: '江東区総合事業個別サービス計画書（介護予防型通所）' }).click(); await page.waitForTimeout(600);
r.titleSaved = await page.evaluate((K) => (JSON.parse(localStorage.getItem(K)).systemSettings || {}).shienPlanTitle === '江東区総合事業個別サービス計画書（介護予防型通所）', K);
await go('tsusho_keikaku', ids.A); h = await printHtml();
r.titleInPrint = h.includes('【江東区総合事業個別サービス計画書（介護予防型通所）】');
// 3) 介護度なしの方: 暫定が最初から付く → 見込み 要支援1 を選ぶと要支援の計画書に → 保存 → 一覧に暫定 → 印刷に（暫定）
await go('tsusho_keikaku', ids.B);
await page.locator('button', { hasText: '＋ 新規作成' }).first().click(); await page.waitForTimeout(600);
r.zanteiDefault = await page.getByTestId('tk-zantei').isChecked() && !(await page.getByTestId('tk-type-kaigo').isDisabled());
await page.getByTestId('tk-zantei-level').selectOption('要支援1'); await page.waitForTimeout(300);
r.levelSetsType = (await page.getByTestId('tk-type-shien').getAttribute('class')).includes('bg-teal-600') && (await page.getByTestId('tk-ex-card').count()) === 1;
await page.locator('button', { hasText: '保存して閉じる' }).first().click(); await page.waitForTimeout(800);
h = await printHtml();
r.zanteiList = (await page.getByTestId('tk-zantei-badge').count()) === 1 && /見込み 要支援1/.test(await page.getByTestId('tk-zantei-badge').innerText());
r.zanteiPrint = h.includes('（暫定）') && h.includes('申請中') && h.includes('見込み 要支援1');
// 4) 認定の結果が「要介護1」に → 「本計画にする」→ 要介護の計画書を新しく作る(暫定は残る)
await page.evaluate(([K, id]) => { const d = JSON.parse(localStorage.getItem(K)); d.patients.find(p => p.id === id).careLevel = '要介護1'; localStorage.setItem(K, JSON.stringify(d)); }, [K, ids.B]);
await go('tsusho_keikaku', ids.B);
await page.getByTestId('tk-finalize').click(); await page.waitForTimeout(600);
r.finalOpens = (await page.getByTestId('tk-type-kaigo').getAttribute('class')).includes('bg-blue-600') && !(await page.getByTestId('tk-zantei').isChecked());
await page.locator('button', { hasText: '保存して閉じる' }).first().click(); await page.waitForTimeout(800);
const rb = await recs(ids.B); const fin = rb.find(x => !x.zantei); const zan = rb.find(x => x.zantei);
r.finalSaved = rb.length === 2 && !!fin && !!zan && fin.planType === 'kaigo' && fin.zanteiFromId === zan.id && /暫定の計画書/.test(fin.tokki || '') && !fin.setsumeiDate;
h = await printHtml(); r.kaigoPrint = h.includes('【（地域密着型）通所介護計画書】') && !h.includes('（暫定）');
// 5) アセスメントのタブ: 通所介護計画書のタブから 3-1 を開くと、通所介護計画書のタブのまま
r.assessTabs = (await page.getByTestId('kk-tab-kyomi_kanshin').count()) === 1 && (await page.getByTestId('kk-tab-seikatsu_kinou').count()) === 1;
await page.getByTestId('kk-tab-kyomi_kanshin').click(); await page.waitForTimeout(1200);
r.assessStaysTsusho = (await page.getByTestId('kk-tab-tsusho_keikaku').count()) === 1 && (await page.getByTestId('kk-tab-kinou_patient').count()) === 0;
await page.getByTestId('kk-tab-tsusho_keikaku').click(); await page.waitForTimeout(1000); r.backToTsusho = (await page.getByTestId('tk-finalize').count()) >= 0 && (await page.locator('button', { hasText: '＋ 新規作成' }).count()) >= 1;
// 6) 個別機能訓練計画書の暫定 → 印刷の題名に（暫定）
await go('kinou_keikaku', ids.B);
await page.locator('button', { hasText: '＋ 新規作成' }).first().click(); await page.waitForTimeout(600);
await page.getByTestId('kk-zantei').check(); await page.waitForTimeout(300);
r.kkZantei = (await page.evaluate(() => (document.getElementById('kk-print-area') || {}).innerHTML || '')).includes('【個別機能訓練計画書】（暫定）');
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
