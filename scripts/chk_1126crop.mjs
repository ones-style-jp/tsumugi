// 2026-11-26 trial640: 写真の「切り抜き」。個人ファイルに画像を入れる → 向きの確認に「切り抜き」→ 枠を小さくして登録 → 保存された画像が小さくなる。登録済みの画像も「回転・切抜」から切り抜ける
//   使い方: node chk/chk_1126crop.mjs 4175
import { chromium } from 'playwright';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const PORT = process.argv[2] || '4175'; const BASE = `http://localhost:${PORT}`;
const b = await chromium.launch(); const R = []; const ok = (n, c, d) => { R.push([n, !!c]); console.log((c ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? ' ' + JSON.stringify(d) : '')); };
const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
// 400×300 の画像(左が赤・右が青)を作る
const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 400; c.height = 300; const x = c.getContext('2d'); x.fillStyle = '#e11'; x.fillRect(0, 0, 200, 300); x.fillStyle = '#11e'; x.fillRect(200, 0, 200, 300); return c.toDataURL('image/png'); });
const tmp = path.join(os.tmpdir(), 'tsu_crop_test.png'); fs.writeFileSync(tmp, Buffer.from(png.split(',')[1], 'base64'));
const pid = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const p = d.patients.find(x => x.status === '利用中'); localStorage.setItem('tsumugiSidebarOpen', '0');
  sessionStorage.setItem('tsumugiReopenPF', JSON.stringify({ patientId: p.id, tab: 'cat_2' })); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'master', pid: p.id, t: Date.now() })); return p.id; });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
ok('1 個人ファイルが開く', await page.locator('[data-testid="personal-file-modal"]').count() === 1);
await page.getByTestId('pf-files').locator('input[type="file"]').first().setInputFiles(tmp); await page.waitForTimeout(1200);
ok('2 向きの確認の画面が出る', await page.getByTestId('tsu-rotate').count() === 1);
ok('3 「切り抜き」のボタンがある', await page.getByTestId('tsu-crop-open').count() === 1);
await page.getByTestId('tsu-crop-open').click(); await page.waitForTimeout(800);
ok('4 切り抜きの画面(枠と 4 つの角)', await page.getByTestId('tsu-crop-editor').count() === 1 && await page.locator('[data-testid^="tsu-crop-h-"]').count() === 4);
// 右下の角を左上へ寄せて、枠を左半分・上 2/3 くらいに
const rect0 = await page.getByTestId('tsu-crop-rect').boundingBox(); const se = await page.getByTestId('tsu-crop-h-se').boundingBox();
await page.mouse.move(se.x + se.width / 2, se.y + se.height / 2); await page.mouse.down(); await page.mouse.move(se.x + se.width / 2 - rect0.width * 0.5, se.y + se.height / 2 - rect0.height * 0.34, { steps: 12 }); await page.mouse.up(); await page.waitForTimeout(300);
const rect1 = await page.getByTestId('tsu-crop-rect').boundingBox();
ok('5 角をつまんで枠が小さくなる', rect1.width < rect0.width * 0.6 && rect1.height < rect0.height * 0.75, { w0: Math.round(rect0.width), w1: Math.round(rect1.width), h0: Math.round(rect0.height), h1: Math.round(rect1.height) });
await page.getByTestId('tsu-crop-ok').click(); await page.waitForTimeout(400);
ok('6 札に「切り抜きあり」', /切り抜きあり/.test(await page.getByTestId('tsu-crop-badge').innerText()), await page.getByTestId('tsu-crop-badge').innerText());
await page.getByTestId('tsu-rotate-ok').click(); await page.waitForTimeout(2500);
const saved = await page.evaluate(async (pid) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const p = d.patients.find(x => x.id === pid); const f = ((p.personalFile || {}).files || []).filter(x => /tsu_crop_test/.test(x.name || '')).slice(-1)[0]; if (!f || !f.data) return null;
  const im = new Image(); await new Promise(r => { im.onload = r; im.onerror = r; im.src = f.data; }); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); const px = x.getImageData(im.width - 2, 2, 1, 1).data; return { w: im.width, h: im.height, rightPixel: [px[0], px[1], px[2]] }; }, pid);
ok('7 保存された画像は切り抜かれて小さい(左半分=赤だけ)', saved && saved.w < 260 && saved.w > 150 && saved.h < 260 && saved.rightPixel[0] > 150 && saved.rightPixel[2] < 100, saved);
// 登録済みの画像も「回転・切抜」から切り抜ける(切り抜きだけで保存できる)
const rotBtn = page.getByTestId('pf-rotate').last(); ok('8 一覧に「回転・切抜」', await rotBtn.count() === 1 && /回転・切抜/.test(await rotBtn.innerText()));
await rotBtn.click(); await page.waitForTimeout(1200); ok('9 回転・切り抜きの画面', await page.getByTestId('tsu-rotate').count() === 1 && /切り抜き/.test(await page.getByTestId('tsu-rotate').innerText()));
await page.getByTestId('tsu-crop-open').click(); await page.waitForTimeout(800);
const r0 = await page.getByTestId('tsu-crop-rect').boundingBox(); const nw = await page.getByTestId('tsu-crop-h-nw').boundingBox();
await page.mouse.move(nw.x + nw.width / 2, nw.y + nw.height / 2); await page.mouse.down(); await page.mouse.move(nw.x + nw.width / 2 + r0.width * 0.5, nw.y + nw.height / 2, { steps: 10 }); await page.mouse.up(); await page.waitForTimeout(300);
await page.getByTestId('tsu-crop-ok').click(); await page.waitForTimeout(300); await page.getByTestId('tsu-rotate-ok').click(); await page.waitForTimeout(3000);
const saved2 = await page.evaluate(async (pid) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const p = d.patients.find(x => x.id === pid); const fl = ((p.personalFile || {}).files || []).filter(x => /tsu_crop_test/.test(x.name || '')); const f = fl.slice(-1)[0]; if (!f || !f.data) return null; const im = new Image(); await new Promise(r => { im.onload = r; im.onerror = r; im.src = f.data; }); return { w: im.width, h: im.height, trash: ((p.personalFile || {}).trash || []).filter(t => /回転前/.test(t.title || '')).length }; }, pid);
ok('10 登録済みの画像を切り抜きだけで保存できる(幅が半分・元はゴミ箱)', saved2 && saved2.w < saved.w * 0.7 && saved2.trash >= 1, saved2);
await b.close();
const bad = R.filter(x => !x[1]); console.log(bad.length ? `FAIL ${bad.length}: ${bad.map(x => x[0]).join(' / ')}` : 'ALL PASS'); process.exit(bad.length ? 1 : 0);
