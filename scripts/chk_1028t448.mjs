// 2026-10-28 夜(試験版 trial448) ユーザー指示: スマホの「印」の帯を上へ・「運行表を出した後に外れた」の表示を外す・全画面の「全員」は左・バイタルサイン基準値の上下の余白を詰める
//   ①スマホ: 名前を長押しで印 → 「印 1名」の帯が上の帯のすぐ下(画面の上の方)に出る・カードの位置は動かない・画面の下に浮かぶ帯はない・「外す」で消える
//   ②iPad: 基準値の欄の内側の上の余白 2px・下の間 4px
//   ③iPad の全画面: 倍率を変えると出る「全員」が 倍率(－ ○% ＋)の左
//   ④送迎表(パソコン): 運行表を出した後に外れた方がいても「運行表を出した後に外れた」の表示が出ない
//   実行: node scripts/chk_1028t448.mjs [--port 4175]
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4175'; })();
const b = await chromium.launch(); const r = {};
const open = async (vp, view, seed) => { const ctx = await b.newContext({ viewport: vp, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', ...(vp.width < 768 ? { hasTouch: true, isMobile: true } : {}) }); const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => d.accept());
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  const info = await page.evaluate(([view, seed]) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const t = new Date(); const iso = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; const dow = t.getDay();
    d.systemSettings = d.systemSettings || {}; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [] }; d.holidays = [];
    const act = d.patients.filter(p => p.status === '利用中' && !p.endDate); act.forEach((p, i) => { p.scheduleAmPm = ['', '', '', '', '', '', '']; if (i < (seed.n || 6)) p.scheduleAmPm[dow] = 'AM'; p.pauseHistory = []; p.scheduleChangeHistory = []; });
    let out = {};
    if (seed.tp) { const [A, B] = act; d.diarySettings = d.diarySettings || {}; d.diarySettings.cars = [{ id: 'c1', name: '1号車', type: '', cap: '8' }];
      const mk = iso.slice(0, 7); d.monthlyShifts = d.monthlyShifts || {}; d.monthlyShifts[mk] = d.monthlyShifts[mk] || {}; d.monthlyShifts[mk][B.id] = { [`${t.getDate()}_AM`]: '欠席' };
      d.transportPlans = { [`${iso}_AM`]: { cars: { c1: [{ pid: A.id, t: '8:30' }] }, walkers: [], others: [], un: [], _base: { cars: { c1: [{ pid: A.id, t: '8:30' }, { pid: B.id, t: '8:40' }] }, walkers: [], others: [] }, _baseAt: Date.now() - 86400000, _baseId: 'b1', _savedAt: Date.now() } }; out = { B: B.name }; }
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); localStorage.removeItem('tsumugiFsZoom');
    sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view, pid: null, ampm: 'AM', t: Date.now() })); return out; }, [view, seed]);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
  return { ctx, page, info }; };
// ① スマホの印
{ const { ctx, page } = await open({ width: 393, height: 820 }, 'record', { n: 6 });
  const card = page.locator('[data-rec-card]').first(); const cid = await card.getAttribute('data-rec-card');
  const nm = page.getByTestId(`rv-cname-${cid}`); const y0 = (await card.boundingBox()).y;
  await nm.evaluate(e => { const o = { bubbles: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: 10, clientY: 10, button: 0 }; e.dispatchEvent(new PointerEvent('pointerdown', o)); setTimeout(() => { e.dispatchEvent(new PointerEvent('pointerup', o)); e.dispatchEvent(new MouseEvent('click', { bubbles: true })); }, 700); }); await page.waitForTimeout(1100);
  for (let k = 0; k < 3; k++) { const ov = await page.evaluate(() => [...document.querySelectorAll('.fixed.inset-0,[style*="inset: 0"]')].filter(e => e.getBoundingClientRect().width > 300).length); if (!ov) break; await page.mouse.click(4, 4); await page.waitForTimeout(300); }
  const bar = page.getByTestId('rv-marks-bar-phone'); const bb = await bar.boundingBox().catch(() => null); const pin = await page.locator('.tsu-pin').first().boundingBox();
  const y1 = (await card.boundingBox()).y; console.log('印の帯', bb, '上の帯', pin, 'カード', y0, '->', y1);
  r.markBarTop = !!bb && bb.y < 200 && Math.abs(bb.y - (pin.y + pin.height)) < 4; r.cardSteady = Math.abs(y1 - y0) < 1;
  r.noBottomChip = await page.evaluate(() => ![...document.querySelectorAll('*')].some(e => getComputedStyle(e).position === 'fixed' && /印 \d+名/.test(e.textContent || '') && e.getBoundingClientRect().top > innerHeight / 2));
  if (bb) { await page.getByTestId('rv-marks-clear-phone').click(); await page.waitForTimeout(300); r.markClear = (await bar.count()) === 0; }
  await ctx.close(); }
// ② 基準値の余白
{ const { ctx, page } = await open({ width: 1180, height: 820 }, 'record', { n: 6 });
  const st = await page.getByTestId('vital-ref').evaluate(e => { const cs = getComputedStyle(e); return { pt: cs.paddingTop, pb: cs.paddingBottom, mb: cs.marginBottom, h: Math.round(e.getBoundingClientRect().height) }; }); console.log('基準値', st);
  r.vitalPad = st.pt === '2px' && st.pb === '2px' && st.mb === '4px';
  // ③ 全画面の「全員」は左
  await page.getByTestId('rec-act-fullscreen').click(); await page.waitForTimeout(800); await page.getByTestId('fs-zoom-plus').click(); await page.waitForTimeout(400);
  const fx = (await page.getByTestId('fs-zoom-fit').boundingBox()) || {}; const zx = (await page.getByTestId('fs-zoom').boundingBox()) || {}; console.log('全員', fx.x, '倍率', zx.x);
  r.fitLeft = fx.x != null && zx.x != null && fx.x + fx.width <= zx.x + 1;
  await ctx.close(); }
// ④ 送迎表
{ const { ctx, page, info } = await open({ width: 1280, height: 900 }, 'transport', { n: 2, tp: true });
  await page.locator('button', { hasText: /^あとで$/ }).first().click({ timeout: 1500 }).catch(() => {}); await page.waitForTimeout(500);
  const txt = await page.locator('body').innerText(); r.noRemovedBox = !txt.includes('運行表を出した後に外れた') && !txt.includes('確定時から外れた'); console.log('外れた表示なし', r.noRemovedBox, '休みに', txt.includes(info.B));
  await ctx.close(); }
await b.close();
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
