import { chromium } from 'playwright';
const OUT = '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad';
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1500, height: 1000 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.goto('http://localhost:4185/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const seed = async (final) => { await page.evaluate((final) => {
  const d = JSON.parse(localStorage.getItem('daycareAppData_v3'));
  d.diarySettings.cars = [{ id: 'cS', name: 'シエンタ', type: '', cap: '5' }, { id: 'cT', name: 'ステップ', type: '', cap: '7' }, { id: 'cK', name: 'タント', type: '', cap: '3' }];
  const act = d.patients.filter(p => p.status === '利用中'); act.forEach(p => { p.scheduleAmPm = ['', 'AM', 'AM', 'AM', 'AM', 'AM', '']; });
  const today = new Date(); const mon = new Date(today); mon.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const iso = (dd) => `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, '0')}-${String(dd.getDate()).padStart(2, '0')}`;
  const pk = (arr) => arr.map((p, i) => ({ pid: p.id, t: `8:${String(30 + i * 5).padStart(2, '0')}`, mark: false }));
  const counts = [[3, 5, 2], [1, 2, 0], [4, 1, 3], [2, 4, 1], [3, 3, 2]]; // 日ごとの シエンタ/ステップ/タント の人数
  d.transportPlans = {};
  counts.forEach((c, i) => { const dd = new Date(mon); dd.setDate(mon.getDate() + i); const k = `${iso(dd)}_AM`; let s = 0;
    const take = (n) => { const r = act.slice(s, s + n); s += n; return pk(r); };
    d.transportPlans[k] = { cars: { cS: take(c[0]), cT: take(c[1]), cK: take(c[2]) }, walkers: [], others: [], un: [], driver: {}, _savedAt: Date.now(), ...(final ? { _final: true, _finalAt: Date.now() } : {}) }; });
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, t: Date.now() })); }, final);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {}); };
// 作成中
await seed(false);
const edit = await page.evaluate(() => { const out = {}; for (const cid of ['cS', 'cT', 'cK']) { out[cid] = [...document.querySelectorAll(`[data-tpdrop="${cid}"][data-tpslot="AM"]`)].map(el => Math.round(el.getBoundingClientRect().top)); } out.pads = document.querySelectorAll('[data-testid="tp-pad"]').length; return out; });
console.log('edit tops', JSON.stringify(edit));
console.log('cS blocks', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('[data-tpdrop="cS"][data-tpslot="AM"]')].map(el => ({ h: Math.round(el.getBoundingClientRect().height), kids: [...el.children].map(c => Math.round(c.getBoundingClientRect().height)).join('/') })))));
await page.screenshot({ path: `${OUT}/align_edit.png` });
// 確定後
await seed(true);
const fin = await page.evaluate(() => { const grid = document.querySelector('[data-testid="tp-fb-grid"]'); if (!grid) return 'no grid'; const out = {}; for (const name of ['シエンタ', 'ステップ', 'タント']) { out[name] = [...grid.querySelectorAll('[data-testid^="tp-fb-cell-"][data-testid$="-AM"]')].map(cell => { const h = [...cell.querySelectorAll('div')].find(x => x.children.length <= 2 && x.textContent.startsWith(name) && /border-dashed/.test(x.className)); return h ? Math.round(h.getBoundingClientRect().top) : null; }); } out.pads = grid.querySelectorAll('[data-testid="tp-fb-pad"]').length; out.empty = grid.querySelectorAll('[data-testid^="tp-fb-car-empty-"]').length; return out; });
console.log('final tops', JSON.stringify(fin));
await page.screenshot({ path: `${OUT}/align_final.png` });
await b.close();
