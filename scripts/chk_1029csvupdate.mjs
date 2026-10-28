// 2026-10-29 ユーザー質問「利用者マスタ管理で最新のものを読み込んだら、保険番号や電話番号はちゃんとしたのが反映されるんだよね？」
//   すでに登録してある方の番号を、CSV の取り込みで新しい番号に直せるかを確かめる(架空の3人)
//   ①1回目: 全列を埋めた CSV(chk_1028csvimport と同じ --file)で3人を登録
//   ②2回目: 同じ3人の番号だけを変えた CSV を取り込む(氏名で一致→「置き換え」/1人は利用者IDで一致)
//     一郎: 電話・被保険者番号を新しい番号に / 二郎: 電話は空欄(→前の番号のまま)・被保険者番号は Excel で先頭の0が落ちた9桁(→10桁に戻る)
//     三子: 利用者IDで指定・携帯を新しい番号(全角)に・緊急連絡先電話を新しい番号に
//   ③人数が増えていない(同じ方が2人にならない)
//   実行: node scripts/chk_1029csvupdate.mjs --port 4175 --file <1回目の CSV>
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const PORT = arg('--port', '4175'); const FILE = arg('--file', '');
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', acceptDownloads: true }); const page = await ctx.newPage();
let alertMsg = ''; page.on('dialog', d => { alertMsg = d.message(); d.accept(); }); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
await page.evaluate(() => { localStorage.setItem('tsumugiSidebarOpen', '0'); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'master', pid: null, t: Date.now() })); });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
const doImport = async (file) => { alertMsg = '';
  await page.locator('button[title="CSV入出力"]').first().click(); await page.waitForTimeout(500);
  await page.locator('button', { hasText: 'CSV を貼り付けて一括追加' }).first().click(); await page.waitForTimeout(400);
  await page.locator('input[type="file"][accept=".csv,text/csv"]').setInputFiles(file); await page.waitForTimeout(800);
  await page.locator('button', { hasText: '取り込みを実行' }).click(); await page.waitForTimeout(1500);
  let dup = false; if (await page.locator('button', { hasText: 'この内容で取り込む' }).count()) { dup = true; await page.locator('button', { hasText: 'この内容で取り込む' }).click(); await page.waitForTimeout(1200); }
  return { dup, msg: alertMsg }; };
const people = () => page.evaluate(() => (JSON.parse(localStorage.getItem('daycareAppData_v3')).patients || []).filter(p => /^検証/.test(p.name || '')).map(p => ({ id: p.id, name: p.name, phone: p.phone, phoneMobile: p.phoneMobile, insuranceNo: p.insuranceNo, familyPhone: p.familyPhone, em0: ((p.emergencyContacts || [])[0] || {}).phone || '' })));
const r = {};
const first = await doImport(FILE); const p1 = await people(); console.log('1回目', first.msg.split('\n')[0], JSON.stringify(p1));
r.firstAdded = p1.length === 3;
// 2回目の CSV: 1回目と同じ見出しで、番号の列だけ入れる(ほかは空欄=前のまま)
const src = fs.readFileSync(FILE).toString('utf8').replace(/^﻿/, ''); const head = src.split(/\r?\n/)[0].split(',');
const ix = (n) => head.indexOf(n); const row = (o) => head.map((h) => (o[h] ?? '')).join(',');
const sanko = p1.find(p => p.name === '検証 三子');
const csv2 = [head.join(','),
  row({ '氏名': '検証 一郎', '電話番号': '03-1234-5678', '被保険者番号': '1234567890' }),
  row({ '氏名': '検証 二郎', '被保険者番号': '987654321' }),
  row({ '利用者ID': String(sanko ? sanko.id : ''), '携帯電話番号': '０８０－９９９９－０００３', '緊急連絡先電話': '03-5555-0003' })].join('\r\n') + '\r\n';
if (ix('利用者ID') < 0 || ix('電話番号') < 0 || ix('被保険者番号') < 0) { console.log('見出しが見つからない'); process.exit(1); }
const f2 = path.join(path.dirname(path.resolve(FILE)), `csvupdate_${Date.now()}.csv`); fs.writeFileSync(f2, '﻿' + csv2);
// 2回目の CSV は1回目と同じ場所に一時的に置いて、取り込んだら消す
const second = await doImport(f2); fs.unlinkSync(f2); const p2 = await people(); console.log('2回目', second.dup ? '(同じ名前→置き換え)' : '', second.msg.split('\n')[0], JSON.stringify(p2));
const g = (n) => p2.find(p => p.name === n) || {}; const o = (n) => p1.find(p => p.name === n) || {};
r.noDuplicate = p2.length === 3;
r.ichiroUpdated = g('検証 一郎').phone === '03-1234-5678' && g('検証 一郎').insuranceNo === '1234567890' && g('検証 一郎').phoneMobile === o('検証 一郎').phoneMobile;
r.jiroBlankKeeps = g('検証 二郎').phone === o('検証 二郎').phone && !!o('検証 二郎').phone && g('検証 二郎').insuranceNo === '0987654321';
r.sankoById = g('検証 三子').phoneMobile === '080-9999-0003' && g('検証 三子').em0 === '03-5555-0003' && g('検証 三子').familyPhone === '03-5555-0003' && g('検証 三子').insuranceNo === o('検証 三子').insuranceNo;
r.message = /更新 3 件/.test(second.msg) && /新規 0 件/.test(second.msg);
await b.close();
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
