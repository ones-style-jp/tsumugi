// 2026-10-28 マニュアル4章(ホーム)の画面写真: ホーム(パソコン)・予定を押したときの小窓・スマホのホーム(3つを1行)
//   前提: デモ版(VITE_E2E_DEMO=1・架空データ)を配信しておく
//   実行: node scripts/home_manual_shots.mjs [--base http://localhost:4173] [--out public/manual/img]
//   出力: staff_home.jpg(manual_shots.mjs と同じ撮り方)・home_event_detail.jpg・home_phone.jpg
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://localhost:4173');
const OUT = arg('--out', 'public/manual/img');
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log('[home-shots]', ...a);
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const save = async (page, key, opts = {}) => { const file = path.join(OUT, `${key}.jpg`); await page.waitForTimeout(500); await page.screenshot({ path: file, type: 'jpeg', quality: 82, clip: opts.clip }); log('saved', file); };

const b = await chromium.launch();
let ok = true;
async function open(viewport, withEvents) {
  const ctx = await b.newContext({ viewport, deviceScaleFactor: viewport.width < 500 ? 2 : 1.5, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
  const page = await ctx.newPage(); page.on('dialog', d => d.accept());
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!localStorage.getItem('daycareAppData_v3'), null, { timeout: 30000 }); await page.waitForTimeout(800); // スマホはサイドバーが隠れているので、見本のデータが入るのを待つ
  await page.evaluate((ev) => {
    try { sessionStorage.setItem('tsumugiActiveRecorder', JSON.stringify({ id: 'demo_rec', name: '見本 職員', roleLabel: '介護職員' })); } catch {}
    if (ev) { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const p = (d.patients || []).find(x => x.status === '利用中');
      d.scheduleEvents = [{ id: 'ev_shot1', date: ev.today, title: '担当者会議', start: '14:00', end: '14:30', patientId: p ? p.id : null, color: '#3b82f6', note: '（見本）自宅で実施' }, { id: 'ev_shot2', date: ev.tomorrow, title: '契約', start: '10:00', patientId: null, color: '#ef4444' }];
      localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); }
    sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'dashboard', pid: null, t: Date.now() }));
  }, withEvents ? { today: iso(new Date()), tomorrow: iso(new Date(Date.now() + 86400000)) } : null);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('home-today').waitFor({ timeout: 30000 }); await page.waitForTimeout(1500);
  await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
  return page;
}
// 1) ホーム(パソコン): manual_shots.mjs の staff_home と同じ(予定は入れない)
{ const page = await open({ width: 1366, height: 900 }, false);
  const txt = await page.getByTestId('home-tasks').innerText(); if (/開く →|カレンダー →/.test(txt)) { ok = false; log('NG: 古いボタンが残っている'); }
  await save(page, 'staff_home'); await page.context().close(); }
// 2) 予定を押したときの小窓(パソコン)
{ const page = await open({ width: 1366, height: 900 }, true);
  await page.getByTestId('home-today-event-ev_shot1').click(); await page.getByTestId('notice-detail').waitFor({ timeout: 5000 });
  const n = page.getByTestId('notice-detail'); if (!(await page.getByTestId('notice-to-meeting').count()) || !(await page.getByTestId('notice-to-calendar').count())) { ok = false; log('NG: 小窓のボタンが無い'); }
  const bb = await n.boundingBox(); const m = 16;
  await save(page, 'home_event_detail', { clip: { x: Math.max(0, bb.x - m), y: Math.max(0, bb.y - m), width: bb.width + m * 2, height: bb.height + m * 2 } }); await page.context().close(); }
// 3) スマホのホーム(上の帯: 3つを1行)
{ const page = await open({ width: 390, height: 844 }, false);
  const tops = []; for (const id of ['home-today-am', 'home-today-pm', 'home-today-rate']) { const bb = await page.getByTestId(id).boundingBox(); tops.push(bb ? Math.round(bb.y) : -1); }
  if (new Set(tops).size !== 1) { ok = false; log('NG: 1行になっていない', tops); }
  const bb = await page.getByTestId('home-today').boundingBox(); const top = Math.max(0, bb.y - 90);
  await save(page, 'home_phone', { clip: { x: 0, y: top, width: 390, height: Math.min(844 - top, bb.y + bb.height + 16 - top) } }); await page.context().close(); }
await b.close();
console.log(ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
