// 2026-10-20 ユーザー要望6件の確認(デモの組み立て):
//  ①スケジュールの週表示がスマホの幅に収まる(はみ出さない) ②スマホの月表示が画面いっぱい・時刻が途中で改行されない
//  ③休み連絡: 今日は日にちが紫の丸・選んだ日が薄い紫(押すと移る) ④ログインとロックの設定: チェックが説明と同じ行の右端
//  ⑤運転者のその他は小窓で入力→運転者に入る・前週コピーで写らない(職員の運転者は写る) ⑥スマホの日誌: まとまりの枠・役割は左の列・文字14px・高さ44px
import { chromium } from 'playwright';
const OUT = '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad';
const W = Number(process.env.W || 440);
const b = await chromium.launch();
const today = new Date(); const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; const iso = ymd(today);
const prev = new Date(today); prev.setDate(prev.getDate() - 7); const prevIso = ymd(prev);
const r = {};
async function open(ctxOpt, init) {
  const page = await (await b.newContext({ locale: 'ja-JP', timezoneId: 'Asia/Tokyo', ...ctxOpt })).newPage();
  if (init) await page.addInitScript(init);
  page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.route('**/api/route-plan', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ configured: false }) }));
  await page.goto('http://localhost:4185/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  return page;
}
const go = async (page, view, extra = {}) => { await page.evaluate(([v, ex]) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: null, t: Date.now(), ...ex })), [view, extra]); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500); };
const phone = { viewport: { width: W, height: 900 }, isMobile: true, hasTouch: true };
// ①② スケジュール
{
  const page = await open(phone);
  await page.evaluate((iso) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3'));
    d.scheduleEvents = [{ id: 'e1', date: iso, start: '09:00', end: '10:00', title: 'かかりつけ医受診', color: '#f59e0b' }, { id: 'e2', date: iso, start: '13:30', end: '14:30', title: '担当者会議', color: '#3b82f6' }];
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); }, iso);
  await go(page, 'schedule');
  const card = page.getByTestId('sch-cal-card'); const cb = await card.boundingBox();
  r.monthFull = !!cb && cb.x <= 1 && Math.abs(cb.width - W) <= 2;
  const chip = page.getByTestId('sch-today').locator('div[title]').first();
  const tspan = chip.locator('span').first();
  r.monthTimeNoWrap = (await tspan.count()) === 1 && (await tspan.evaluate(e => getComputedStyle(e).whiteSpace)) === 'nowrap' && /^9:00/.test((await chip.innerText()).trim());
  await page.screenshot({ path: `${OUT}/ui2_month_${W}.png` });
  await page.locator('button', { hasText: /^週$/ }).first().click(); await page.waitForTimeout(600);
  const ov = await page.evaluate(() => { const els = [...document.querySelectorAll('*')].filter(e => { const cs = getComputedStyle(e); return (cs.overflowX === 'auto' || cs.overflowX === 'scroll') && e.scrollWidth > e.clientWidth + 1; }); return els.length; });
  const maxRight = await page.evaluate(() => Math.max(...[...document.querySelectorAll('[data-testid="sch-cal-card"] *')].map(e => e.getBoundingClientRect().right)));
  r.weekFits = ov === 0 && maxRight <= W + 1;
  await page.screenshot({ path: `${OUT}/ui2_week_${W}.png` });
  await page.context().close();
}
// ③ 休み連絡
{
  const page = await open(phone);
  await go(page, 'absence_fax');
  const num = page.getByTestId('abs-today-num');
  r.absTodayCircle = (await num.count()) === 1 && (await num.evaluate(e => getComputedStyle(e).backgroundColor)) === 'rgb(99, 102, 241)';
  r.absTodaySel = (await page.locator('[data-testid="abs-today"][data-sel="1"]').count()) === 1;
  const other = page.locator('[data-testid="abs-today"] ~ div').first();
  if (await other.count()) { await other.click({ position: { x: 5, y: 5 } }); await page.waitForTimeout(300); }
  const sel = page.locator('[data-sel="1"]');
  r.absSelMoves = (await sel.count()) === 1 && (await sel.getAttribute('data-testid')) !== 'abs-today' && (await sel.evaluate(e => getComputedStyle(e).backgroundColor)) === 'rgb(238, 242, 255)';
  await page.getByTestId('abs-today').scrollIntoViewIfNeeded(); await page.screenshot({ path: `${OUT}/ui2_abs_${W}.png` });
  await page.context().close();
}
// ④ ログインとロックの設定(スマホ幅とPC幅)
for (const vw of [W, 1280]) {
  const page = await open(vw === W ? phone : { viewport: { width: 1280, height: 900 } }, () => { window.__tsumugiE2E = { ...(window.__tsumugiE2E || {}), staffCtx: { enabled: true, kind: 'person', role: 'manager', displayName: '見本 管理', hasPin: false, membersWithoutAccount: ['見本 一郎', '見本 花子'], setPin: async () => {}, sharedDevice: async () => {} } }; });
  await go(page, 'settings');
  await page.locator('button', { hasText: /^システム$/ }).first().click().catch(() => {}); await page.waitForTimeout(600);
  let ok = true;
  for (const id of ['sec-row-pin', 'sec-row-storeid']) {
    const row = page.getByTestId(id); if (!(await row.count())) { ok = false; console.log('no row', id); continue; }
    const m = await row.evaluate(el => { const t = el.querySelector(':scope > div').getBoundingClientRect(); const c = el.querySelector('input[type=checkbox]').getBoundingClientRect(); return { tr: t.right, tt: t.top, tb: t.bottom, cl: c.left, cy: (c.top + c.bottom) / 2 }; });
    if (!(m.cl >= m.tr && m.cy > m.tt && m.cy < m.tb)) { ok = false; console.log(id, m); }
  }
  r[`secSameRow_${vw}`] = ok;
  if (vw === W) { await page.getByTestId('sec-row-pin').scrollIntoViewIfNeeded().catch(() => {}); await page.screenshot({ path: `${OUT}/ui2_sec_${W}.png` }); }
  await page.context().close();
}
// ⑤ 運転者のその他(小窓)と前週コピー
{
  const page = await open({ viewport: { width: 1366, height: 900 } });
  const staffName = await page.evaluate(([iso, prevIso]) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3'));
    d.diarySettings.cars = [{ id: 'cS', name: 'シエンタ', type: '', cap: '5' }, { id: 'cT', name: 'タント', type: '', cap: '3' }];
    const st = (d.diarySettings.staff || []).find(s => s && s.name && !s._tempHelp); const nm = st ? st.name : '';
    const act = d.patients.filter(p => p.status === '利用中').slice(0, 2); const dow = new Date(iso).getDay(); act.forEach(p => { p.scheduleAmPm = ['', '', '', '', '', '', '']; p.scheduleAmPm[dow] = 'AM'; });
    d.transportPlans = { [`${prevIso}_AM`]: { cars: { cS: [{ pid: act[0].id, t: '8:30' }], cT: [{ pid: act[1].id, t: '8:40' }] }, walkers: [], others: [], un: [], driver: { cS: '臨時 太郎', cT: nm }, _savedAt: Date.now() } };
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); return nm; }, [iso, prevIso]);
  await go(page, 'transport', { date: iso, ampm: 'AM' });
  await page.getByTestId('tp-copy-prev').click(); await page.waitForTimeout(400);
  const fill = page.getByTestId('tp-copy-fill'); if (await fill.isEnabled()) await fill.click(); else await page.getByTestId('tp-copy-all').click();
  await page.waitForTimeout(1500);
  const cp = await page.evaluate((iso) => (JSON.parse(localStorage.getItem('daycareAppData_v3')).transportPlans || {})[`${iso}_AM`], iso);
  r.copyNoOther = !!cp && !(cp.driver || {}).cS && (!staffName || (cp.driver || {}).cT === staffName);
  if (!r.copyNoOther) console.log('copied', JSON.stringify(cp && cp.driver), staffName);
  const sel = page.getByTestId('tp-driver-cS').first();
  await sel.selectOption('__other__'); await page.waitForTimeout(300);
  const pop = page.getByTestId('tp-driver-cS-other');
  r.popShown = (await pop.count()) === 1 && (await page.evaluate(() => document.documentElement.classList.contains('tsu-back-lock')));
  const inp = page.getByTestId('tp-driver-cS-other-input'); const ib = await inp.boundingBox();
  r.popInputWide = !!ib && ib.width >= 250 && (await inp.evaluate(e => getComputedStyle(e).fontSize)) === '16px';
  await inp.fill('臨時の運転者さん12345'); r.popMax10 = (await inp.inputValue()).length === 10;
  await page.getByTestId('tp-driver-cS-other-ok').click(); await page.waitForTimeout(800);
  r.popApplied = (await page.getByTestId('tp-driver-cS-other').count()) === 0 && (await sel.inputValue()) === '臨時の運転者さん12' && !(await page.evaluate(() => document.documentElement.classList.contains('tsu-back-lock')));
  { const saveBtn = page.locator('button', { hasText: /^保存$/ }).first(); if (await saveBtn.count()) await saveBtn.click().catch(() => {}); await page.waitForTimeout(2500); }
  const saved = await page.evaluate((iso) => (((JSON.parse(localStorage.getItem('daycareAppData_v3')).transportPlans || {})[`${iso}_AM`] || {}).driver || {}).cS, iso);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
  r.popSaved = (await page.getByTestId('tp-driver-cS').first().inputValue()) === '臨時の運転者さん12'; // 再読み込み後も残る(送迎表は下書きとして保存)
  if (!r.popSaved) console.log('saved(localStorage)=', saved);
  { const lab = page.getByTestId('tp-driver-cS-label').first(); const m = await lab.evaluate(e => { const t = e.querySelector('span'); return { txt: t.innerText, sw: t.scrollWidth, cw: t.clientWidth }; }); r.nameFull = m.txt.includes('臨時の運転者さん12') && m.sw <= m.cw + 1; if (!r.nameFull) console.log('label', m); await lab.scrollIntoViewIfNeeded(); }
  await page.screenshot({ path: `${OUT}/ui2_driver.png` });
  await page.context().close();
}
// ⑥ スマホの日誌
{
  const page = await open(phone);
  await go(page, 'diary');
  const box = page.getByTestId('diary-phone-checks');
  r.diarySecs = (await page.getByTestId('dpc-sec-staff').count()) === 1 && (await page.getByTestId('dpc-sec-mgr').count()) === 1;
  const c = box.locator('[data-testid^="dpc-staff-"]').first();
  if (await c.count()) { const m = await c.evaluate(e => { const b = e.getBoundingClientRect(); const lab = e.parentElement.previousElementSibling.getBoundingClientRect(); return { fs: getComputedStyle(e).fontSize, h: b.height, labRight: lab.right, left: b.left }; }); r.diaryChip = m.fs === '14px' && m.h >= 44 && m.labRight <= m.left; if (!r.diaryChip) console.log(m); } else r.diaryChip = false;
  await page.screenshot({ path: `${OUT}/ui2_diary_${W}.png` });
  await page.context().close();
}
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
