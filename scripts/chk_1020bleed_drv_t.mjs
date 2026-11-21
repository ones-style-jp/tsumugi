// ①スマホで各画面が横にはみ出さない・外側の枠が端から端まで(PC は従来どおり枠と角丸)
// ②日誌で追加した「この日だけ」の担当者が、その日の午前/午後(両方なら両方)の運転者の一覧に出る・別の日の方は出ない
import { chromium } from 'playwright';
const OUT = '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad';
const b = await chromium.launch(); const r = {};
const today = new Date(); const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; const iso = ymd(today); const y = new Date(today); y.setDate(y.getDate() - 1); const yIso = ymd(y);
async function open(opt) { const page = await (await b.newContext({ locale: 'ja-JP', timezoneId: 'Asia/Tokyo', ...opt })).newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.route('**/api/route-plan', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ configured: false }) }));
  await page.goto('http://localhost:4185/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); } return page; }
const go = async (page, v, ex = {}) => { await page.evaluate(([v, ex]) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: null, t: Date.now(), ...ex })), [v, ex]); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1600); };
const VIEWS = ['dashboard', 'jisseki', 'cmmaster', 'dash_operation', 'dash_personal', 'family_admin', 'emergency', 'settings', 'roster', 'class_roster', 'keikaku_yotei', 'kinou_yotei', 'life_hub', 'record', 'diary', 'transport', 'monitoring', 'master', 'absence_fax', 'schedule'];
for (const W of [390, 440]) {
  const page = await open({ viewport: { width: W, height: 900 }, isMobile: true, hasTouch: true }); const bad = [];
  for (const v of VIEWS) { await go(page, v); const m = await page.evaluate((W) => { const root = document.getElementById('tsuContentScroller') || document.body; const over = [...root.querySelectorAll('*')].filter(e => { const r = e.getBoundingClientRect(); if (!(r.width > 0 && r.right > W + 2)) return false; let p = e.parentElement; while (p && p !== root) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') return false; p = p.parentElement; } return true; }).length; const sc = root.scrollWidth > root.clientWidth + 1; return { over, sc }; }, W); if (m.over || m.sc) bad.push(`${v}:${JSON.stringify(m)}`); }
  r[`noOverflow_${W}`] = bad.length === 0; if (bad.length) console.log(W, bad.join(' '));
  for (const v of ['dashboard', 'settings', 'roster', 'life_hub']) { await go(page, v); const ok = await page.evaluate((W) => { const els = [...document.querySelectorAll('.tsu-ph-cards *')].filter(e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width >= W - 1 && r.left <= 0.5 && r.height > 30 && cs.backgroundColor !== 'rgba(0, 0, 0, 0)'; }); return els.length > 0; }, W); r[`bleed_${v}_${W}`] = ok; }
  await page.context().close();
}
{ const page = await open({ viewport: { width: 1280, height: 900 } }); await go(page, 'dashboard'); r.pcKeepsCards = await page.evaluate(() => { const root = document.querySelector('.tsu-ph-cards'); const cs = getComputedStyle(root); const card = [...root.children].find(c => parseFloat(getComputedStyle(c).borderTopLeftRadius) >= 6); return cs.paddingLeft === '16px' && !!card; }); await page.context().close(); }
// ② 運転者の一覧
{ const page = await open({ viewport: { width: 1366, height: 900 } });
  await page.evaluate(([iso, yIso]) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.diarySettings.cars = [{ id: 'cS', name: 'シエンタ', type: '', cap: '5' }];
    d.diarySettings.staff = [...(d.diarySettings.staff || []), { id: 'sA', name: '応援 午前', role: '介護職員', ampm: 'AM', _tempHelp: true, _helpDate: iso }, { id: 'sB', name: '応援 両方', role: '介護職員', ampm: 'both', _tempHelp: true, _helpDate: iso }, { id: 'sP', name: '応援 午後', role: '介護職員', ampm: 'PM', _tempHelp: true, _helpDate: iso }, { id: 'sY', name: '応援 昨日', role: '介護職員', ampm: 'both', _tempHelp: true, _helpDate: yIso }];
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); }, [iso, yIso]);
  await go(page, 'transport', { date: iso, ampm: 'AM' });
  const cnt = await page.evaluate(() => { const sels = [...document.querySelectorAll('select[data-testid^="tp-driver-"]')]; const c = (n) => sels.filter(s => [...s.options].some(o => o.value === n)).length; return { total: sels.length, am: c('応援 午前'), both: c('応援 両方'), pm: c('応援 午後'), yday: c('応援 昨日') }; });
  console.log('driver lists', JSON.stringify(cnt));
  const yInWeek = ![0, 1].includes(today.getDay()); // 週は月曜から。昨日の方は昨日の列(午前・午後)にだけ出る
  r.drvAmOnly = cnt.am === 1 && cnt.pm === 1 && cnt.both === 2 && cnt.yday === (yInWeek ? 2 : 0);
  await page.context().close(); }
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
