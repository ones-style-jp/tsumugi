// 事業所(職員)向け「新機能のご案内と使い方(10/15)」の追加の画面写真(見本＝架空データのみ)。安定版デモを 4173 で配信してから
//   node scripts/s15_shots.mjs --out <dir>
import { chromium } from 'playwright';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://localhost:4173'); const OUT = arg('--out', '/tmp/s15');
const log = (...a) => console.log('[s15]', ...a);
const FAC = 'つむぎ デイサービス（見本）';
const b = await chromium.launch({ args: ['--lang=ja-JP'] });
const newPage = async (time) => { const ctx = await b.newContext({ locale: 'ja-JP', timezoneId: 'Asia/Tokyo', viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 }); const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => log('PAGEERROR', e.message.slice(0, 160))); if (time) await page.clock.install({ time: new Date(time) }); return { ctx, page }; };
const login = async (page) => { await page.goto(`${BASE}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800); if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); } };
const reload = async (page) => { await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1600); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 500 }).catch(() => {}); };
const shot = async (loc, name) => { try { await loc.scrollIntoViewIfNeeded().catch(() => {}); await loc.screenshot({ path: `${OUT}/${name}.png` }); log('ok', name); } catch (e) { log('NG', name, String(e).slice(0, 120)); } };

// 1. 提供記録の並び替え
{ const { ctx, page } = await newPage('2026-10-07T10:40:00'); await login(page);
  await page.evaluate((FAC) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), name: FAC }; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'record', t: Date.now() })); }, FAC);
  await reload(page);
  await page.locator('button', { hasText: /^並び替え$/ }).first().click(); await page.waitForTimeout(600);
  await shot(page.getByTestId('rec-order-modal').locator(':scope > div').first(), 's15_rec_order');
  await ctx.close(); }

// 2. 送迎表の「変更内容」の一覧
{ const { ctx, page } = await newPage('2026-10-07T10:00:00'); await login(page);
  await page.evaluate((FAC) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), name: FAC };
    d.diarySettings.cars = [{ id: 'car1', name: 'シエンタ', type: '', cap: '5' }, { id: 'car2', name: 'ステップ', type: '', cap: '7' }];
    const ps = d.patients.filter(p => p.status === '利用中').slice(0, 8); d.transportPlans = d.transportPlans || {};
    const fin = (a, b2) => ({ cars: { car1: [{ pid: ps[a].id, t: '8:30' }, { pid: ps[b2].id, t: '8:40' }] }, walkers: [], walkT: {}, others: [], driver: { car1: '見本 運転一' } });
    d.transportPlans['2026-10-05_AM'] = { cars: { car1: [{ pid: ps[0].id, t: '8:30' }] }, walkers: [], others: [], un: [], driver: { car1: '見本 運転一' }, _final: fin(0, 1), _finalAt: Date.now() - 3600000, _savedAt: Date.now() };
    d.transportPlans['2026-10-07_AM'] = { cars: { car1: [{ pid: ps[2].id, t: '8:30' }, { pid: ps[3].id, t: '8:50' }] }, walkers: [], others: [], un: [], driver: { car1: '見本 運転一' }, _final: fin(2, 3), _finalAt: Date.now() - 3600000, _savedAt: Date.now() };
    d.ticketRecords = [...(d.ticketRecords || []), { id: 'rec_ab1', patientId: ps[1].id, date: '10月5日', year: 2026, status: '欠席', tokki: '通院', ampm: 'AM' }];
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, t: Date.now() })); }, FAC);
  await reload(page);
  await page.getByTestId('tp-chg-btn').click(); await page.waitForTimeout(500);
  await shot(page.getByTestId('tp-chg-panel'), 's15_chg_panel');
  await ctx.close(); }
await b.close();
