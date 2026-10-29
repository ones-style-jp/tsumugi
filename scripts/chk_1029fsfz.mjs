// 2026-10-29 ユーザー報告(iPad): 「さっきは体温は拡大されてたのに、今回は全て拡大されなくなっちゃってます」
//   iPad の Safari(2026年5月の WebKit の修正より前)は、表に zoom をかけても文字が拡大されない。_fsFz が表の中と外で文字の幅を測り、
//   足りない倍率を --tsu-fz にして表の文字に掛ける。パソコンの WebKit では文字は拡大されるので、測った幅をわざと「拡大されていない」値に
//   すり替えて(getBoundingClientRect の差し替え)、まねをする。
//   ①iPad(まね・180%): 表に tsu-fz-on と --tsu-fz=1.8 が付き、表の中の文字(名前・状態・体調・体温・血圧・脈・運動・特記…)が残らず1.8倍になる
//   ②iPad(修正後と同じ=すり替えなし): 付かない(二重に大きくならない) ③パソコン(Chromium): 付かない・文字の大きさは今までと同じ(14px)
//   実行: node scripts/chk_1029fsfz.mjs [--port 4175]
import { chromium, webkit } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4175'; })();
const r = {};
const UA = 'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
const open = async (eng, vp, opts = {}, { zoom = '1.8', fake = false } = {}) => {
  const b = await eng.launch(); const ctx = await b.newContext({ viewport: vp, screen: vp, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', ...opts }); const page = await ctx.newPage(); page.on('dialog', d => d.accept());
  if (fake) await page.addInitScript(() => {
    // 表の中の見本の文字(MMMMMMMMMM・20px)だけ、拡大されていない幅(÷倍率)を返す = 修正前の iPad のまね
    const orig = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () { const rc = orig.call(this);
      try { const t = this.closest && this.closest('#record-table'); if (t && this.textContent === 'MMMMMMMMMM' && /font-size:\s*20px/.test(this.getAttribute('style') || '')) { const z = parseFloat(t.style.zoom) || 1; return new DOMRect(rc.x, rc.y, rc.width / z, rc.height / z); } } catch {}
      return rc; };
  });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  await page.evaluate((z) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const t = new Date(); const dow = t.getDay(); d.systemSettings = d.systemSettings || {}; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [] }; d.holidays = [];
    d.patients.filter(p => p.status === '利用中' && !p.endDate).forEach((p, i) => { p.scheduleAmPm = ['', '', '', '', '', '', '']; if (i < 10) p.scheduleAmPm[dow] = 'AM'; p.pauseHistory = []; p.scheduleChangeHistory = []; });
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); localStorage.setItem('tsumugiFsZoom', z);
    sessionStorage.setItem('tsumugiActiveRecorder', JSON.stringify({ id: 'demo_rec', name: '見本 職員', roleLabel: '介護職員' })); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'record', pid: null, ampm: 'AM', t: Date.now() })); }, zoom);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
  return { b, page }; };
// 表の中の、文字を持つものの文字の大きさ(要素の順番で並べる)
const sizes = (page) => page.evaluate(() => { const t = document.getElementById('record-table'); const out = [];
  t.querySelectorAll('*').forEach((el, i) => { const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) || ((el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && el.type !== 'checkbox');
    if (!hasText || el.closest('[aria-hidden="true"]') || !el.getClientRects().length) return; out.push({ i, tag: el.tagName, txt: (el.value || el.textContent || '').trim().slice(0, 8), fs: parseFloat(getComputedStyle(el).fontSize) }); }); return out; });
const tableState = (page) => page.evaluate(() => { const t = document.getElementById('record-table'); return { on: t.classList.contains('tsu-fz-on'), fz: t.style.getPropertyValue('--tsu-fz'), zoom: t.style.zoom }; });

// ① iPad のまね: 通常の画面(倍率なし)の文字の大きさ → 全画面180%(すり替えあり)
{ const { b, page } = await open(webkit, { width: 1080, height: 810 }, { userAgent: UA, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }, { fake: true });
  const base = await sizes(page);
  await page.getByTestId('rec-act-fullscreen').click(); await page.waitForTimeout(1500);
  const st = await tableState(page); console.log('iPad(まね) 全画面', JSON.stringify(st)); r.fakeOn = st.on && Math.abs(parseFloat(st.fz) - 1.8) < 0.02;
  const fs = await sizes(page); globalThis.__fakeFs = fs;
  // 全画面は行の中身が通常の画面と同じ作り。同じ順番のもの同士で、文字の大きさが1.8倍か(パソコンの WebKit は zoom で拡大済みの値を返さないので、getComputedStyle は「指定の大きさ」= 1.8倍になっていれば足りている)
  const byKey = (a) => { const m = new Map(); a.forEach(x => { const k = x.tag + '|' + x.txt; if (!m.has(k)) m.set(k, x.fs); }); return m; };
  const mb = byKey(base), mf = byKey(fs); const bad = []; let n = 0;
  for (const [k, v] of mf) { if (!mb.has(k)) continue; n++; const ratio = v / mb.get(k); if (Math.abs(ratio - 1.8) > 0.06) bad.push(`${k} ${mb.get(k)}→${v}`); }
  console.log('比べた文字', n, '1.8倍になっていないもの', bad.length, bad.slice(0, 12)); r.fakeAllScaled = n >= 20 && bad.length === 0;
  // ＋－で倍率を変えると、埋め合わせも追いつく(170%)
  await page.getByTestId('fs-zoom-minus').click(); await page.waitForTimeout(600); const st2 = await tableState(page); console.log('－のあと', JSON.stringify(st2)); r.fakeFollow = st2.on && Math.abs(parseFloat(st2.fz) - 1.75) < 0.02;
  // 通常画面に戻すと外れる
  await page.locator('button', { hasText: '通常画面' }).first().click(); await page.waitForTimeout(800); const st3 = await tableState(page); console.log('通常画面', JSON.stringify(st3)); r.fakeOffNormal = !st3.on && !st3.fz;
  await b.close(); }
// ② iPad(すり替えなし = 修正の入った iPad と同じく文字も拡大される): 付かない
{ const { b, page } = await open(webkit, { width: 1080, height: 810 }, { userAgent: UA, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await page.getByTestId('rec-act-fullscreen').click(); await page.waitForTimeout(1500);
  const st = await tableState(page); console.log('iPad(修正後と同じ) 全画面', JSON.stringify(st)); r.realNoDouble = !st.on && !st.fz && st.zoom === '1.8';
  // 全画面の文字を一つ残らず: まね(埋め合わせあり)÷すり替えなし(埋め合わせなし)が1.8倍か(同じ見本・同じ並び)
  const real = await sizes(page); const fake = globalThis.__fakeFs || []; const bad = [];
  const mr = new Map(real.map(x => [x.i, x])); let n = 0;
  fake.forEach(x => { const y = mr.get(x.i); if (!y || y.tag !== x.tag) return; n++; const k = x.fs / y.fs; if (Math.abs(k - 1.8) > 0.06) bad.push(`${x.tag}|${x.txt} ${y.fs}→${x.fs}`); });
  console.log('全画面の文字 全部', n, '/', fake.length, '1.8倍でないもの', bad.length, bad.slice(0, 12)); r.fakeEveryText = n >= 100 && n >= fake.length * 0.95 && bad.length === 0;
  await b.close(); }
// ③ パソコン: 付かない・文字の大きさは今までと同じ
{ const { b, page } = await open(chromium, { width: 1920, height: 1080 }, {}, { zoom: '2', fake: true });
  const bp = await page.evaluate(() => { const el = document.querySelector('#record-table [data-testid^="bp-cell-"]'); return el ? getComputedStyle(el).fontSize : null; });
  await page.getByTestId('rec-act-fullscreen').click(); await page.waitForTimeout(1500);
  const st = await tableState(page); console.log('パソコン 全画面', JSON.stringify(st), '血圧の文字(通常の画面)', bp); r.pcNoComp = !st.on && !st.fz; r.pcSameSize = bp === '14px'; await b.close(); }
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
