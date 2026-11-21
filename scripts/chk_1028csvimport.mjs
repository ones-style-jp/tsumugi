// 2026-10-28 ユーザー依頼「利用者名簿のテンプレートを全部入力した状態で、ちゃんと反映されるか試してほしい」
//   利用者マスタ → CSV入出力 → テンプレートの見出しを確かめ → 全列を埋めた CSV(架空の3人)をファイルで取り込み → 保存された中身を1項目ずつ確かめる
//   1人目=ハイフンあり / 2人目=ハイフンなし・Excel で先頭の0が落ちた番号・日付は 2024/7/1 形式 / 3人目=全角の数字・カンマと改行を含む文
//   実行: node scripts/chk_1028csvimport.mjs --port 4173 --file <CSV> [--json 結果の保存先]
import { chromium } from 'playwright';
import fs from 'node:fs';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const PORT = arg('--port', '4173'); const FILE = arg('--file', ''); const JSON_OUT = arg('--json', '');
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', acceptDownloads: true }); const page = await ctx.newPage();
let alertMsg = ''; page.on('dialog', d => { alertMsg = d.message(); d.accept(); }); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
await page.evaluate(() => { localStorage.setItem('tsumugiSidebarOpen', '0'); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'master', pid: null, t: Date.now() })); });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
await page.locator('button[title="CSV入出力"]').first().click(); await page.waitForTimeout(500);
const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('button', { hasText: 'テンプレート' }).first().click()]);
const tpl = fs.readFileSync(await dl.path(), 'utf8').replace(/^﻿/, ''); const tplHead = tpl.split('\n')[0].split(',');
const myHead = fs.readFileSync(FILE).toString('utf8').replace(/^﻿/, '').split(/\r?\n/)[0];
console.log('テンプレートの列', tplHead.length, '件:', tplHead.join(' / '));
await page.locator('button', { hasText: 'CSV を貼り付けて一括追加' }).first().click(); await page.waitForTimeout(400);
await page.locator('input[type="file"][accept=".csv,text/csv"]').setInputFiles(FILE); await page.waitForTimeout(800);
await page.locator('button', { hasText: '取り込みを実行' }).click(); await page.waitForTimeout(1500);
if (await page.locator('button', { hasText: 'この内容で取り込む' }).count()) { console.log('同じ名前の方がいる→1人ずつ選ぶ画面'); await page.locator('button', { hasText: 'この内容で取り込む' }).click(); await page.waitForTimeout(1200); }
console.log('完了の知らせ:', JSON.stringify(alertMsg));
const got = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const ps = (d.patients || []).filter(p => /^検証/.test(p.name || ''));
  const pick = (p) => { const fs = (p.personalFile || {}).faceSheet || {}; return { id: p.id, name: p.name, kana: p.kana, gender: p.gender, birthDate: p.birthDate, zipCode: p.zipCode, address: p.address, prefecture: p.prefecture, city: p.city, addressLine: p.addressLine, addressBuilding: p.addressBuilding, addressRoom: p.addressRoom,
    phone: p.phone, phoneMobile: p.phoneMobile, familyName: p.familyName, familyRelation: p.familyRelation, familyPhone: p.familyPhone, familyPhoneMobile: p.familyPhoneMobile, familyEmail: p.familyEmail,
    insuranceNo: p.insuranceNo, careLevel: p.careLevel, startDate: p.startDate, endDate: p.endDate, status: p.status, kiou: p.kiou, ryui: p.ryui, doctor: p.doctor, email: p.email, careLevelFrom: p.careLevelFrom, careLevelTo: p.careLevelTo, costBurden: p.costBurden,
    cmOffice: p.cmOffice, cmOfficePhone: p.cmOfficePhone, cmFax: p.cmFax, cmName: p.cmName, cmPhone: p.cmPhone, medicalInstitution: p.medicalInstitution, medicalContact: p.medicalContact,
    fs_fax: fs.fax, fs_householdType: fs.householdType, fs_adlLevel: fs.adlLevel, fs_dementiaLevel: fs.dementiaLevel, fs_lifeHistory: fs.lifeHistory, fs_bikou: fs.bikou, fs_addendum: fs.addendum, fs_chronicDiseases: fs.chronicDiseases, fs_updatedBy: fs.updatedBy,
    scheduleAmPm: (p.scheduleAmPm || []).join('|') }; };
  const ss = d.systemSettings || {}; return { ps: ps.map(pick), cmOffices: (ss.cmOffices || []).filter(o => /見本/.test(o.name || '')).map(o => ({ name: o.name, phone: o.phone, fax: o.fax })), careManagers: (ss.careManagers || []).filter(c => /見本/.test(c.name || '')).map(c => ({ office: c.office, name: c.name, phone: c.phone })) }; });
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify({ tplHead, myHeadSame: myHead === tplHead.join(','), alertMsg, ...got }, null, 1));
console.log(JSON.stringify(got, null, 1));
await b.close();
