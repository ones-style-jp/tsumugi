// 2026-11-13 trial577: スマホの提供記録(1人1行→広げた欄)と虫眼鏡(拡大入力)にも特記の「家族 非表示」ボタン。PC の表と同じ控え familyTokkiOverrides[pid][M月D日] を読み書き
//   node chk/chk_1113famhide.mjs [port]   (見本データ VITE_E2E_DEMO=1 のビルド)
import { chromium } from 'playwright';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => { console.log('PAGEERROR', e.message.slice(0, 200)); fails++; });
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(900); }
const info = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const now = new Date(); const dow = now.getDay(); const dateStr = `${now.getMonth() + 1}月${now.getDate()}日`;
  const ps = (d.patients || []).filter(p => p.status === '利用中' && !p.endDate).slice(0, 2); (d.patients || []).forEach(p => { if (!ps.includes(p)) p.scheduleAmPm = ['', '', '', '', '', '', '']; });
  ps.forEach(p => { p.pauseHistory = []; p.scheduleAmPm = ['', '', '', '', '', '', '']; p.scheduleAmPm[dow] = 'AM'; p.startDate = '2025-01-01'; });
  d.ticketRecords = (d.ticketRecords || []).filter(r => !(r && String(r.date) === dateStr));
  // A: 特記あり(出席) / B: 欠席(理由あり) → B にはボタンを出さない
  d.ticketRecords.push({ id: `fh_a_${Date.now()}`, patientId: ps[0].id, date: dateStr, year: now.getFullYear(), status: '出席', tokki: '本日は笑顔が多く見られました', _savedAt: Date.now() });
  d.ticketRecords.push({ id: `fh_b_${Date.now()}`, patientId: ps[1].id, date: dateStr, year: now.getFullYear(), status: '欠席', tokki: '体調不良のためお休み', _savedAt: Date.now() });
  d.familyTokkiOverrides = {};
  d.holidays = []; d.systemSettings = d.systemSettings || {}; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [] };
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0');
  sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'record', pid: null, t: Date.now(), ampm: 'AM' })); return { ids: ps.map(p => p.id), dateStr }; });
const [A, B] = info.ids;
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2200); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
const expand = async (pid) => { const row = page.getByTestId(`rv-crow-${pid}`); if (await row.count()) { await row.first().click(); await page.waitForTimeout(600); } };
const ovOf = async (pid) => page.evaluate(([pid, dk]) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const o = ((d.familyTokkiOverrides || {})[pid] || {})[dk]; return o ? o.visible : null; }, [pid, info.dateStr]);
// --- 1人1行を広げた欄 ---
await expand(A);
const famA = page.getByTestId(`rv-ctokki-fam-${A}`);
ok(await famA.count() === 1, 'A(出席・特記あり): スマホの特記の欄に「家族 非表示」ボタンが出る');
ok((await famA.getAttribute('data-vis')) === '1', 'A: 最初は表示(押していない)');
await famA.click(); await page.waitForTimeout(500);
ok((await famA.getAttribute('data-vis')) === '0', 'A: 押すと「非表示中」になる');
ok((await ovOf(A)) === false, `A: 控え familyTokkiOverrides[pid][${info.dateStr}].visible=false が書かれる`);
await famA.click(); await page.waitForTimeout(500);
ok((await famA.getAttribute('data-vis')) === '1' && (await ovOf(A)) === true, 'A: もう一度押すと表示に戻る(控えも true)');
// 枠の最後まで送っても「たたむ」の帯が特記の行(ボタン)にかぶらない(trial577: sticky の基準 60px→0。Chrome は枠の padding を除いて数えるため二重になっていた)
await page.evaluate(() => { document.querySelectorAll('.record-view-scroll').forEach(el => { el.scrollTop = el.scrollHeight; }); }); await page.waitForTimeout(400);
const cover = await page.evaluate((A) => { const f = document.querySelector(`[data-testid="rv-ctokki-fam-${A}"]`); if (!f) return 'no-btn'; const r = f.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return (hit === f || f.contains(hit)) ? 'ok' : (hit && (hit.className || hit.tagName)).toString().slice(0, 40); }, A);
ok(cover === 'ok', `枠の最後まで送っても「たたむ」の帯が特記の行にかぶらない(押せる: ${cover})`);
await expand(B);
ok(await page.getByTestId(`rv-ctokki-fam-${B}`).count() === 0, 'B(欠席): 休みの理由は必ず表示なのでボタンを出さない');
// --- 虫眼鏡(拡大入力) ---
await expand(A);
const mag = page.locator(`[data-rec-card="${A}"] button[title*="大きな文字"], button[title*="大きな文字"]`).first();
if (await mag.count()) { await mag.click(); await page.waitForTimeout(800); }
const zfam = page.getByTestId('rv-ztokki-fam');
ok(await zfam.count() === 1, '虫眼鏡: 大きな入力画面にも「家族 非表示」ボタンが出る');
if (await zfam.count()) {
  const h = await zfam.evaluate(el => el.getBoundingClientRect().height); ok(h >= 44, `虫眼鏡: ボタンは押せる大きさ(高さ ${Math.round(h)}px ≧ 44)`);
  await zfam.click(); await page.waitForTimeout(500);
  ok((await zfam.getAttribute('data-vis')) === '0' && (await ovOf(A)) === false, '虫眼鏡: 押すと非表示中・控えは表と同じ鍵に書かれる');
  ok(/出していません/.test(await page.evaluate(() => document.body.innerText)), '虫眼鏡: 「ご家族の画面に出していません」の説明が出る');
  await page.locator('button:visible', { hasText: /^閉じる$/ }).first().click().catch(() => {}); await page.waitForTimeout(600);
  ok((await page.getByTestId(`rv-ctokki-fam-${A}`).getAttribute('data-vis')) === '0', '閉じると一覧側のボタンも「非表示中」(同じ控え)');
}
await b.close();
console.log(fails ? `FAIL ${fails}` : 'ALL PASS'); process.exit(fails ? 1 : 0);
