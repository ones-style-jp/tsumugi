// 2026-11-25 1125b: 個人ファイルに「サービス提供票」のフォルダ(既定カテゴリ・全店)。タブがある・開ける・ⓘの説明・PDF を入れると「ファイル (1)」と年月の見出し
//   使い方: node chk/chk_1125teikyohyo.mjs 4173
import { chromium } from 'playwright';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const PORT = process.argv[2] || '4173'; const BASE = `http://localhost:${PORT}`;
const b = await chromium.launch(); const R = []; const ok = (n, c, d) => { R.push([n, !!c]); console.log((c ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? ' ' + JSON.stringify(d) : '')); };
const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const pid = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const p = d.patients.find(x => x.status === '利用中'); localStorage.setItem('tsumugiSidebarOpen', '0');
  sessionStorage.setItem('tsumugiReopenPF', JSON.stringify({ patientId: p.id, tab: 'cat_teikyohyo' })); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'master', pid: p.id, t: Date.now() })); return p.id; });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
const M = page.locator('[data-testid="personal-file-modal"]'); ok('1 個人ファイルが開く', await M.count() === 1, { pid });
const tab = M.locator('button', { hasText: /^\s*サービス提供票\s*$/ }).first(); ok('2 「サービス提供票」のタブがある', await tab.count() === 1);
const cls = await tab.getAttribute('class').catch(() => ''); if (!/border-emerald-600/.test(cls || '')) { await tab.click(); await page.waitForTimeout(500); }
ok('3 タブを開ける(選択の線)', /border-emerald-600/.test((await tab.getAttribute('class')) || ''));
ok('4 ⓘ の説明(pf-teikyohyo-hint)がある', await page.getByTestId('pf-teikyohyo-hint').count() === 1);
ok('5 ファイルの枠(pf-files)がある・0件', await page.getByTestId('pf-files').count() === 1 && /ファイル \(0\)/.test(await page.getByTestId('pf-files').innerText()));
// タブの並び: ケアプラン・担当者会議 の次
const names = await M.locator('button.border-b-2').allInnerTexts(); const i3 = names.findIndex(t => /ケアプラン・担当者会議/.test(t)); const iT = names.findIndex(t => /サービス提供票/.test(t));
ok('6 並びは「ケアプラン・担当者会議」の次', i3 >= 0 && iT === i3 + 1, { i3, iT });
// PDF を入れる
const tmp = path.join(os.tmpdir(), 'tsu_teikyo_test.pdf'); fs.writeFileSync(tmp, '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\nxref\n0 4\n0000000000 65535 f \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n0\n%%EOF');
await page.getByTestId('pf-files').locator('input[type="file"]').first().setInputFiles(tmp); await page.waitForTimeout(2500);
await page.locator('button:visible', { hasText: /^(OK|はい|そのまま|決定)$/ }).first().click({ timeout: 800 }).catch(() => {});
await page.waitForTimeout(800);
const txt = await page.getByTestId('pf-files').innerText(); ok('7 PDF を入れると「ファイル (1)」', /ファイル \(1\)/.test(txt), txt.slice(0, 80).replace(/\n/g, ' '));
ok('8 年月の見出しでまとまる', /\d{4}[-年]\s?\d{1,2}/.test(txt));
// 保存されている(categoryId)
const saved = await page.evaluate((pid) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const p = d.patients.find(x => x.id === pid); return ((p.personalFile || {}).files || []).filter(f => f.categoryId === 'cat_teikyohyo').length; }, pid);
ok('9 端末のデータに categoryId=cat_teikyohyo で保存', saved === 1, saved);
// 他のカテゴリには混ざらない(データで確認)
const other = await page.evaluate((pid) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const p = d.patients.find(x => x.id === pid); return ((p.personalFile || {}).files || []).filter(f => /tsu_teikyo_test/.test(f.name || '') && f.categoryId !== 'cat_teikyohyo').length; }, pid);
ok('10 ほかのカテゴリには混ざらない', other === 0, other);
await b.close();
const bad = R.filter(x => !x[1]); console.log(bad.length ? `FAIL ${bad.length}: ${bad.map(x => x[0]).join(' / ')}` : 'ALL PASS'); process.exit(bad.length ? 1 : 0);
