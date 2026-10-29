// 2026-10-29 ユーザー要望「フェイスシートの建物名は建物名＋部屋番号で1つの欄に。部屋番号だけの欄はなくす。前に部屋番号が入っていたら建物名＋部屋番号へ」
//   見本の3人: A=建物名「見本ハイツ」部屋番号「203」(前の形) / B=建物名「見本荘 101」部屋番号「101」(CSV の書き出しで重なった形) / C=建物名「見本コーポ」部屋番号なし
//   ①利用者マスタの住所: A は「見本ハイツ 203」・B は「見本荘 101」(101 を重ねない)
//   ②CSV の書き出し: 「部屋番号」の列がない・建物名の列が A「見本ハイツ 203」B「見本荘 101」
//   ③A のフェイスシート: 「部屋番号」の欄がない・「建物名・部屋番号」が「見本ハイツ 203」→ 保存すると建物名「見本ハイツ 203」・部屋番号は空
//   ④前の形の CSV(建物名と部屋番号の列あり)を取り込む: C(建物名は空・部屋番号 305)→「見本コーポ 305」/ B(建物名「見本荘」部屋番号「102」)→「見本荘 102」/ 新しい方(部屋番号だけ 401)→「401」
//   実行: node scripts/chk_1029bldroom.mjs [--port 4175]
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4175'; })();
const b = await chromium.launch(); const r = {};
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', acceptDownloads: true }); const page = await ctx.newPage();
let alertMsg = ''; page.on('dialog', d => { alertMsg = d.message(); d.accept(); }); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const ids = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const ps = d.patients.filter(p => p.status === '利用中' && !p.endDate);
  const [A, B, C] = ps; A.addressBuilding = '見本ハイツ'; A.addressRoom = '203'; B.addressBuilding = '見本荘 101'; B.addressRoom = '101'; C.addressBuilding = '見本コーポ'; C.addressRoom = '';
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0');
  sessionStorage.setItem('tsumugiActiveRecorder', JSON.stringify({ id: 'demo_rec', name: '見本 職員', roleLabel: '介護職員' }));
  sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'master', pid: null, t: Date.now() })); return { A: A.id, B: B.id, C: C.id, An: A.name, Bn: B.name, Cn: C.name }; });
const reload = async () => { await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'master', pid: null, t: Date.now() }))); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {}); };
await reload();
const pt = (id) => page.evaluate((id) => { const p = JSON.parse(localStorage.getItem('daycareAppData_v3')).patients.find(x => x.id === id) || {}; return { b: p.addressBuilding, r: p.addressRoom }; }, id);
const openPatient = async (name) => { await page.locator('button:visible', { hasText: new RegExp('^' + name) }).first().click(); await page.waitForTimeout(1200); };
// ① 利用者マスタの住所
await openPatient(ids.An); const tA = await page.locator('body').innerText(); r.masterA = tA.includes('見本ハイツ 203');
await openPatient(ids.Bn); const tB = await page.locator('body').innerText(); r.masterBNoDup = tB.includes('見本荘 101') && !tB.includes('見本荘 101 101');
// ② CSV の書き出し
await page.locator('button[title="CSV入出力"]').first().click(); await page.waitForTimeout(500);
const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('button', { hasText: 'エクスポート' }).first().click()]);
const csv = fs.readFileSync(await dl.path(), 'utf8').replace(/^﻿/, ''); const lines = csv.split(/\r?\n/); const head = lines[0].split(',');
const ib = head.indexOf('建物名'); const rowOf = (id) => (lines.find(l => l.startsWith(`${id},`)) || '').split(',');
r.csvNoRoomCol = !head.includes('部屋番号') && ib >= 0; r.csvA = rowOf(ids.A)[ib] === '見本ハイツ 203'; r.csvB = rowOf(ids.B)[ib] === '見本荘 101';
console.log('CSV', head.includes('部屋番号'), rowOf(ids.A)[ib], rowOf(ids.B)[ib]);
await page.keyboard.press('Escape').catch(() => {}); await reload();
// ③ A のフェイスシート
await openPatient(ids.An); await page.locator('button:visible', { hasText: /個人ファイル/ }).first().click(); await page.waitForTimeout(1200);
await page.locator('button:visible', { hasText: /^編集・追記$/ }).first().click(); await page.waitForTimeout(500);
await page.locator('button:visible', { hasText: /手入力で作成/ }).first().click(); await page.waitForTimeout(900);
const labels = await page.evaluate(() => [...document.querySelectorAll('label, span, div')].filter(e => e.children.length === 0).map(e => (e.textContent || '').trim()));
r.fsNoRoomField = !labels.includes('部屋番号') && labels.includes('建物名・部屋番号');
const bInput = page.locator('input[placeholder="例: 見本ハイツ 101"]').first(); const bv = await bInput.inputValue().catch(() => ''); console.log('フェイスシートの建物名・部屋番号', bv); r.fsCombined = bv === '見本ハイツ 203';
await page.locator('button:visible', { hasText: /^保存$/ }).last().click(); await page.waitForTimeout(1500);
const a2 = await pt(ids.A); console.log('保存後 A', JSON.stringify(a2)); r.fsSavedMoved = a2.b === '見本ハイツ 203' && !a2.r;
for (let k = 0; k < 3 && await page.getByTestId('pf-close-btn').count(); k++) { await page.getByTestId('pf-close-btn').first().click().catch(() => {}); await page.waitForTimeout(600); }
await reload();
for (let k = 0; k < 3 && await page.getByTestId('pf-close-btn').count(); k++) { await page.getByTestId('pf-close-btn').first().click().catch(() => {}); await page.waitForTimeout(600); }
// ④ 前の形の CSV
const H = ['利用者ID', '氏名', '建物名', '部屋番号'];
const oldCsv = [H.join(','), `${ids.C},${ids.Cn},,305`, `${ids.B},${ids.Bn},見本荘,102`, `,検証 部屋,,401`].join('\r\n') + '\r\n';
const f = path.join(os.tmpdir(), `bldroom_${Date.now()}.csv`); fs.writeFileSync(f, '﻿' + oldCsv);
await page.locator('button[title="CSV入出力"]').first().click(); await page.waitForTimeout(500);
await page.locator('button', { hasText: 'CSV を貼り付けて一括追加' }).first().click(); await page.waitForTimeout(400);
await page.locator('input[type="file"][accept=".csv,text/csv"]').setInputFiles(f); await page.waitForTimeout(800);
await page.locator('button', { hasText: '取り込みを実行' }).click(); await page.waitForTimeout(1500);
if (await page.locator('button', { hasText: 'この内容で取り込む' }).count()) { await page.locator('button', { hasText: 'この内容で取り込む' }).click(); await page.waitForTimeout(1200); }
fs.unlinkSync(f);
const c4 = await pt(ids.C), b4 = await pt(ids.B); const n4 = await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('daycareAppData_v3')).patients.find(x => x.name === '検証 部屋') || {}; return { b: p.addressBuilding, r: p.addressRoom }; });
console.log('取り込み後', JSON.stringify({ C: c4, B: b4, new: n4 }), alertMsg.split('\n')[0]);
r.importRoomOnly = c4.b === '見本コーポ 305' && !c4.r; r.importBoth = b4.b === '見本荘 102' && !b4.r; r.importNew = n4.b === '401' && !n4.r;
await b.close();
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
