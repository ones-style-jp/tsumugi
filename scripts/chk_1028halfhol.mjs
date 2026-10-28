// 2026-10-28 半日休業(ユーザー「全日と、雪などで午前だけ・午後だけも選べるように」「月間スケジュールで休業にしたら事業所情報の休業日一覧に出て、そこで直せるように」)
//   見本の3人を 午前だけ(A)・午後だけ(B)・1日(C) の利用にし、今日を「午前のみ」の休業日にする
//   ①提供記録入力: A=休業・B/C=休業にならない ②月間スケジュール(A): 今日の午前のマス=休業で押せない・午後のマスは押せる
//   ③月間スケジュールで別の日の午後を「休業（施設休業日の設定へ）」→ 各種設定の施設休業日へ移り、その日と「午後のみ」が登録欄に入っている → 登録 → その日の午後のマスが休業
//   ④各種設定→事業所情報の施設休業日: 一覧に「午前のみ」「午後のみ」・登録で「午後のみ」を選んで入れられる ⑤送迎表の見出しに「午前休業」
//   実行: node scripts/chk_1028halfhol.mjs [--port 4175] [--shots 出力フォルダ]
import { chromium } from 'playwright';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const PORT = arg('--port', '4175'); const SHOTS = arg('--shots', '');
const b = await chromium.launch(); const r = {};
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage();
page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const iso = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
const now = new Date(); const T = iso(now); const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
const D2 = now.getDate() < last ? now.getDate() + 1 : now.getDate() - 1; const D3 = D2 === now.getDate() + 1 && D2 + 1 <= last ? D2 + 1 : (now.getDate() > 2 ? now.getDate() - 2 : D2);
const isoD = (dn) => iso(new Date(now.getFullYear(), now.getMonth(), dn));
const info = await page.evaluate(([T, d2, d3]) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const mk = T.slice(0, 7);
  d.systemSettings = d.systemSettings || {}; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [] };
  const ps = (d.patients || []).filter(p => p.status === '利用中' && !p.endDate && (p.name || '').trim()).slice(0, 3); if (ps.length < 3) return null;
  ['AM', 'PM', '1日'].forEach((v, i) => { const p = ps[i]; p.scheduleAmPm = [v, v, v, v, v, v, v]; p.scheduleChangeHistory = []; p.pauseHistory = []; if (p.startDate && p.startDate > T.slice(0, 8) + '01') p.startDate = T.slice(0, 8) + '01'; });
  const ids = ps.map(p => p.id); d.monthlyShifts = d.monthlyShifts || {}; d.monthlyShifts[mk] = d.monthlyShifts[mk] || {}; ids.forEach(id => { d.monthlyShifts[mk][id] = {}; });
  const md = (s) => `${+s.slice(5, 7)}月${+s.slice(8, 10)}日`; const dates = [T, d2, d3].map(md);
  d.ticketRecords = (d.ticketRecords || []).filter(t => !(ids.includes(t.patientId) && dates.includes(t.date)));
  d.holidays = [{ date: T, name: '雪のため', ampm: 'AM' }]; delete d._holTs;
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0');
  return { A: { id: ps[0].id, name: ps[0].name }, B: { id: ps[1].id, name: ps[1].name }, C: { id: ps[2].id, name: ps[2].name } }; }, [T, isoD(D2), isoD(D3)]);
r.seed = !!info; if (!info) { console.log('NO SEED'); process.exit(1); }
const go = async (view) => { await page.evaluate((v) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: null, t: Date.now() })), view); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2200); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {}); };
const hol = () => page.evaluate(() => (JSON.parse(localStorage.getItem('daycareAppData_v3')).holidays || []));
// ① 提供記録入力
//   午前の表: A=休業・B/C は出ない(C=1日の方は午後に来る) / 午後の表: B・C=休業でない・A は出ない
await go('record');
const rows = () => page.evaluate((ids) => ids.map(id => { const tr = document.querySelector(`[data-rv-pid="${id}"]`); return tr ? tr.getAttribute('data-rv-status') : null; }), [info.A.id, info.B.id, info.C.id]);
await page.locator('button:visible', { hasText: /^AM$/ }).first().click(); await page.waitForTimeout(600);
const stA = await rows(); await page.locator('button:visible', { hasText: /^PM$/ }).first().click(); await page.waitForTimeout(600); const stP = await rows();
console.log('record AM', stA, 'PM', stP);
r.recAmTab = stA[0] === '休業' && stA[1] === null && stA[2] === null;
r.recPmTab = stP[0] === null && !!stP[1] && stP[1] !== '休業' && !!stP[2] && stP[2] !== '休業';
await page.locator('button:visible', { hasText: /^AM$/ }).first().click(); await page.waitForTimeout(300);
// ② 月間スケジュール(A)
await go('master');
await page.locator('button:visible').filter({ hasText: new RegExp('^' + info.A.name) }).first().click(); await page.waitForTimeout(1200);
await page.locator('button:visible', { hasText: /^サービス提供内容$/ }).first().click(); await page.waitForTimeout(800);
const cell = async (dn, ap) => { const c = page.getByTestId(`ms-cell-${dn}-${ap}`); await c.scrollIntoViewIfNeeded(); return { t: (await c.innerText()).trim(), dis: await c.isDisabled() }; };
const am = await cell(now.getDate(), 'AM'), pm = await cell(now.getDate(), 'PM'); console.log('cells today', am, pm);
r.cellAmKyugyo = am.t === '休業' && am.dis; r.cellPmOpen = pm.t !== '休業' && !pm.dis;
// ③ 別の日の午後を「休業（施設休業日の設定へ）」→ 各種設定の施設休業日へ移る・押した日と「午後のみ」が登録欄に入っている → 名称を書いて登録
await page.getByTestId(`ms-cell-${D2}-PM`).click(); await page.waitForTimeout(400);
await page.locator('button:visible', { hasText: /^休業（施設休業日の設定へ）$/ }).first().click(); await page.waitForTimeout(1500);
r.jumped = await page.locator('text=施設休業日の設定').first().isVisible().catch(() => false);
const dIn = page.locator('input[type="date"]:visible'); const pf = [await dIn.nth(0).inputValue().catch(() => ''), await dIn.nth(1).inputValue().catch(() => '')];
r.prefillDate = pf[0] === isoD(D2) && pf[1] === isoD(D2); r.prefillPM = /bg-slate-800/.test(await page.getByTestId('hol-add-ap-PM').getAttribute('class') || ''); console.log('prefill', pf, r.prefillPM);
if (SHOTS) await page.screenshot({ path: `${SHOTS}/halfhol_jump.png` });
await page.locator('input[placeholder="例: 夏季休暇"]:visible').first().fill('雪のため（午後）'); await page.locator('button:visible', { hasText: /^登録$/ }).first().click(); await page.waitForTimeout(1200);
const h2 = (await hol()).find(h => h && h.date === isoD(D2)); console.log('saved', h2); r.savedPM = !!h2 && h2.ampm === 'PM' && h2.name === '雪のため（午後）';
// ④ 一覧の印・登録で「午後のみ」
const badges = await page.getByTestId('hol-ampm-badge').allInnerTexts(); console.log('badges', badges); r.listBadges = badges.includes('午前のみ') && badges.includes('午後のみ');
await dIn.nth(0).fill(isoD(D3)); await dIn.nth(1).fill(isoD(D3));
await page.locator('input[placeholder="例: 夏季休暇"]:visible').first().fill('研修');
await page.getByTestId('hol-add-ap-PM').click(); await page.locator('button:visible', { hasText: /^登録$/ }).first().click(); await page.waitForTimeout(1200);
const h3 = (await hol()).find(h => h && h.date === isoD(D3)); console.log('added', h3); r.addPM = !!h3 && h3.ampm === 'PM' && h3.name === '研修';
if (SHOTS) await page.screenshot({ path: `${SHOTS}/halfhol_settings.png` });
// 月間スケジュールに戻って、その日の午後のマスが休業・午前は押せる
await go('master'); await page.locator('button:visible').filter({ hasText: new RegExp('^' + info.A.name) }).first().click(); await page.waitForTimeout(1200);
await page.locator('button:visible', { hasText: /^サービス提供内容$/ }).first().click(); await page.waitForTimeout(800);
const am2 = await cell(D2, 'AM'), pm2 = await cell(D2, 'PM'); console.log('cells D2', am2, pm2); r.cellD2 = pm2.t === '休業' && pm2.dis && am2.t !== '休業' && !am2.dis;
// ⑤ 送迎表の見出し
await go('transport');
const tph = await page.getByTestId(`tp-hol-${T}`).first().innerText().catch(() => ''); r.tpHeader = tph === '午前休業'; if (!r.tpHeader) console.log('transport header:', JSON.stringify(tph));
await b.close();
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); process.exit(Object.values(r).every(Boolean) ? 0 : 1);
