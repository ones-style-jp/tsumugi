// 2026-11-10 trial545: 休み連絡 — ダウンロード(PDF)しても「DL済」にならない(状態は変わらない)。「連絡済にする」で連絡済。古い 'pdf' は編集済の扱い
//   node chk/chk_1110absdl.mjs [port]   (見本データ VITE_E2E_DEMO=1 のビルド)
import { chromium } from 'playwright';
import fs from 'node:fs';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
const S = process.env.S || '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad';
const OUT = `${S}/shots/absdl`; fs.mkdirSync(OUT, { recursive: true });
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => { console.log('PAGEERROR', e.message.slice(0, 200)); fails++; });
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(900); }
// 今日の欠席を2件入れる: 1件目は状態なし、2件目は古い 'pdf'(DL済) の状態
const names = await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const act = (d.patients || []).filter(x => x.status === '利用中');
  const t = new Date(); const dd = `${t.getMonth() + 1}月${t.getDate()}日`; const iso = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  d.ticketRecords = (d.ticketRecords || []).filter(r => !(r && r.date === dd && r.year === t.getFullYear() && (r.patientId === act[0].id || r.patientId === act[1].id)))
    .concat([{ id: 'absA', patientId: act[0].id, date: dd, year: t.getFullYear(), status: '欠席', tokki: '' }, { id: 'absB', patientId: act[1].id, date: dd, year: t.getFullYear(), status: '欠席', tokki: '' }]);
  d.faxDataStore = { [`${iso}_${act[1].id}`]: { status: 'pdf', reason: '体調不良' } };
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d));
  sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'absence_fax', pid: null, t: Date.now() }));
  return [act[0].name, act[1].name];
});
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 400 }).catch(() => {});
// 1件目を開く
const openEntry = async (nm) => { await page.locator('button:visible', { hasText: /^カレンダーに戻る$/ }).first().click({ timeout: 800 }).catch(() => {}); await page.waitForTimeout(500); const el = page.getByText(nm, { exact: true }).first(); if (!(await el.count())) { console.log('not found', nm, (await page.locator('body').innerText()).slice(0, 300).replace(/\n+/g, ' / ')); } await el.scrollIntoViewIfNeeded(); await el.click(); await page.waitForTimeout(800); if (!(await page.getByTestId('abs-done-toggle').count())) console.log('after click', nm, (await page.locator('body').innerText()).slice(0, 400).replace(/\n+/g, ' / ')); };
await openEntry(names[0]);
ok(!(await page.getByText('DL（ダウンロード）済', { exact: false }).count()), '凡例に「DL（ダウンロード）済」がない');
const tg = page.getByTestId('abs-done-toggle');
ok(await tg.count() === 1, '送付状に「連絡済にする」の切り替えがある');
ok(/連絡済にする/.test(await tg.innerText()), '最初は「連絡済にする」');
// ダウンロード(PDF)の合図 → 状態は変わらない
await page.evaluate((nm) => window.dispatchEvent(new CustomEvent('tsumugi:printed', { detail: { title: `休み連絡_${nm}`, method: 'pdf' } })), names[0]); await page.waitForTimeout(600);
ok(/連絡済にする/.test(await tg.innerText()), 'ダウンロードしても「連絡済にする」のまま(DL済にならない)');
const st1 = await page.evaluate((nm) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const p = (d.patients || []).find(x => x.name === nm); const t = new Date(); const iso = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; const f = (d.faxDataStore || {})[`${iso}_${p.id}`]; return f ? f.status : 'none'; }, names[0]);
ok(st1 !== 'pdf' && st1 !== 'both', `保存される状態に DL済('pdf')は入らない (status=${st1})`);
ok(!(await page.getByText('DL済', { exact: true }).count()), '画面に「DL済」の文字がない');
// 印刷の合図 → 連絡済
await page.evaluate((nm) => window.dispatchEvent(new CustomEvent('tsumugi:printed', { detail: { title: `休み連絡_${nm}`, method: 'print' } })), names[0]); await page.waitForTimeout(600);
ok(/連絡済（取消）/.test(await tg.innerText()), '印刷すると「連絡済（取消）」');
await page.screenshot({ path: `${OUT}/abs_after_print.png` });
// 2件目(古い 'pdf' の状態)を開く → 「連絡済にする」が出る(編集済の扱い)
await openEntry(names[1]);
ok(/連絡済にする/.test(await tg.innerText()), "古い 'pdf'(DL済) の記録は「連絡済にする」が出る(編集済の扱い)");
await tg.click(); await page.waitForTimeout(600);
ok(/連絡済（取消）/.test(await tg.innerText()), '「連絡済にする」を押すと連絡済');
await page.screenshot({ path: `${OUT}/abs_legacy.png` });
await ctx.close(); await b.close();
console.log(fails ? `FAILS ${fails}` : 'ALL PASS'); process.exit(fails ? 1 : 0);
