// エリア担当者向け資料: LIFE・計画書(試験版)の画面写真(見本＝架空データのみ)。試験版デモを 4173 で配信してから
//   node scripts/a15_life_shots.mjs --out <dir>
import { chromium } from 'playwright';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://localhost:4173'); const OUT = arg('--out', '/tmp/a15');
const log = (...a) => console.log('[a15life]', ...a);
const FAC = 'つむぎ デイサービス（見本）';
const b = await chromium.launch({ args: ['--lang=ja-JP'] });
const newPage = async () => { const ctx = await b.newContext({ locale: 'ja-JP', timezoneId: 'Asia/Tokyo', viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 }); const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => log('PAGEERROR', e.message.slice(0, 160))); await page.route('**/api/pdf**', r => r.fulfill({ status: 200, contentType: 'application/pdf', body: '%PDF-1.4\n%%EOF' })); return { ctx, page }; };
const login = async (page) => { await page.goto(`${BASE}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800); if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); } };
const reload = async (page) => { await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 400 }).catch(() => {}); };
const shot = async (loc, name) => { try { await loc.scrollIntoViewIfNeeded().catch(() => {}); await loc.screenshot({ path: `${OUT}/${name}.png` }); log('ok', name); } catch (e) { log('NG', name, String(e).slice(0, 120)); } };

// ---------- 1. 作成予定・利用者ごと ----------
{ const { ctx, page } = await newPage(); await login(page);
  const A = await page.evaluate((FAC) => {
    const d = JSON.parse(localStorage.getItem('daycareAppData_v3'));
    d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), name: FAC };
    d.systemSettings.addons = { ...(d.systemSettings.addons || {}), kasan_kinou2: true, kasan_kagaku: true, kasan_adl: true, kinou_keikaku: true };
    const act = d.patients.filter(p => p.status === '利用中'); const A = act[0];
    act.slice(0, 12).forEach((p, i) => { p.careLevel = i % 4 === 3 ? '要支援1' : `要介護${(i % 3) + 1}`; });
    d.kinouKeikakuRecords = [{ id: 'kkA1', patientId: A.id, createdAt: 1, createdDate: '令和8年7月1日', shortSanka: '見本の目標' }, { id: 'kkA2', patientId: A.id, createdAt: 2, createdDate: '令和8年10月3日', shortSanka: '見本の目標' }];
    d.seikatsuKinouRecords = [{ id: 'skA2', patientId: A.id, createdAt: 2, recordDate: '令和8年10月3日', recorder: '見本 相談二', adl: {}, kikyo: {}, iadl: {}, shinshin: {} }];
    d.kyomiKanshinRecords = [{ id: 'kiA1', patientId: A.id, createdAt: 1, recordDate: '令和8年10月3日', items: {}, custom: [], bikou: '' }];
    d.adlRecords = [{ id: 'adA1', patientId: A.id, evalDate: '2026-07-01', items: {}, science: {}, total: 0 }, { id: 'adA2', patientId: A.id, evalDate: '2026-10-03', items: {}, science: {}, total: 0 }];
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d));
    sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'kinou_yotei', pid: null, t: Date.now() }));
    return A.id;
  }, FAC);
  await reload(page);
  await page.screenshot({ path: `${OUT}/a15_kk_yotei.png` }); log('ok a15_kk_yotei');
  await page.evaluate((pid) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'kinou_patient', pid, t: Date.now() })), A); await reload(page);
  await page.screenshot({ path: `${OUT}/a15_kk_patient.png` }); log('ok a15_kk_patient');
  // LIFE提出(毎月の流れ)
  await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'life_submit', pid: null, t: Date.now() }))); await reload(page);
  await page.screenshot({ path: `${OUT}/a15_life_submit.png` }); log('ok a15_life_submit');
  await shot(page.getByTestId('life-flow'), 'a15_life_flow');
  await ctx.close(); }

// ---------- 2. ADL維持等加算の目安(架空の14名) ----------
{ const { ctx, page } = await newPage(); await login(page);
  await page.evaluate((FAC) => {
    const d = JSON.parse(localStorage.getItem('daycareAppData_v3'));
    d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), name: FAC };
    d.systemSettings.addons = { ...(d.systemSettings.addons || {}), kasan_kinou2: true, kasan_kagaku: true, kasan_adl: true, kinou_keikaku: true };
    const keys = ['eat', 'transfer', 'groom', 'toilet', 'bath', 'walk', 'stairs', 'dress', 'stool', 'urine'];
    const items = (t) => { const o = {}; keys.forEach((k, i) => { o[k] = i === 0 ? t : 0; }); return o; };
    const spec = [[50, 55], [60, 60], [80, 75], [20, 25], [40, 40], [70, 80], [90, 85], [30, 20], [55, 60], [100, 100], ['h', 45, 50], ['no6', 60], ['shien', 50, 60], ['late', 50, 60]];
    const fam = ['見本', '架空', '仮名', '例示', '試作', '模擬', '参考'];
    const giv = ['一郎', '花子', '次郎', '和子', '三郎', '幸子', '四郎'];
    const base = 995000; const pts = []; const tr = []; const adl = [];
    spec.forEach((sp, i) => {
      const id = base + i; const kind = typeof sp[0] === 'string' ? sp[0] : '';
      pts.push({ id, name: `${fam[i % 7]} ${giv[(i + Math.floor(i / 7) + 3) % 7]}`, kana: `ミホン ${i}`, status: '利用中', careLevel: kind === 'shien' ? '要支援2' : '要介護2', startDate: '2025-01-01', endDate: '', scheduleAmPm: ['', '1日', '', '', '', '', ''] });
      for (let m = 1; m <= 10; m++) { if (kind === 'h' && m === 7) continue; if (kind === 'late' && m < 8) continue; tr.push({ id: id * 100 + m, patientId: id, name: '', date: `${m}月10日`, year: 2026, dayOfWeek: '月', status: '出席' }); }
      const m0 = kind === 'late' ? 8 : 1; const v0 = kind ? sp[1] : sp[0]; const v6 = kind === 'no6' ? null : (kind ? sp[2] : sp[1]);
      adl.push({ id: `ad_${id}_0`, patientId: id, evalDate: `2026-${String(m0).padStart(2, '0')}-12`, items: items(v0), science: {} });
      if (v6 != null) adl.push({ id: `ad_${id}_6`, patientId: id, evalDate: kind === 'h' ? '2026-06-12' : `2026-${String(m0 + 6).padStart(2, '0')}-12`, items: items(v6), science: {} });
    });
    d.patients = pts; d.ticketRecords = tr; d.adlRecords = adl;
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d));
    sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'life_submit', t: Date.now() }));
  }, FAC);
  await reload(page);
  await page.getByTestId('adl-gain').locator('input[type="month"]').fill('2026-01'); await page.waitForTimeout(600);
  await shot(page.getByTestId('adl-gain'), 'a15_adl_gain');
  await ctx.close(); }
await b.close();
