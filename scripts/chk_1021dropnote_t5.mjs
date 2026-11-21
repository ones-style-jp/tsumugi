// 2026-10-21 連絡帳「送り時間反映」: 次回来る日の送りの時間(送迎表)を、その日の連絡帳の連絡事項に1行で入れる(押した日だけ)
//   ＋ 座席表: 誰も乗っていない車には出発の目安を出さない・保存のとき消す／送りの車に乗っていない方の着く時間の目安は消す
import { chromium } from 'playwright';
const OUT = '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad';
const b = await chromium.launch(); const r = {};
const pad = (n) => String(n).padStart(2, '0'); const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = new Date(); const iso = isoOf(today);
async function open(opt) { const page = await (await b.newContext({ locale: 'ja-JP', timezoneId: 'Asia/Tokyo', ...opt })).newPage(); page.on('dialog', d => { console.log('DIALOG', d.message().slice(0, 80)); d.accept(); }); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.goto('http://localhost:4175/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  return page; }
const go = async (page, view, ex = {}) => { await page.evaluate(([v, ex]) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: null, t: Date.now(), ...ex })), [view, ex]); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); };
const data = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('daycareAppData_v3')));
// 今日(連絡帳の日)の方3名を、今日と「次回(今日+2日)」の両方に来る(AM)ことにし、次回の送迎表に送りの時間を入れる
const nx = new Date(today); nx.setDate(nx.getDate() + 2); while ([0].includes(nx.getDay())) nx.setDate(nx.getDate() + 1); const nIso = isoOf(nx);
const DOW = '日月火水木金土';
const seed = (page) => page.evaluate(([iso, nIso]) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.diarySettings.cars = [{ id: 'c1', name: '1号車', type: '', cap: '6' }, { id: 'c2', name: '2号車', type: '', cap: '4' }];
  d.systemSettings = d.systemSettings || {}; d.systemSettings.transportEnabled = true;
  const dw = new Date(iso + 'T00:00:00').getDay(), nw = new Date(nIso + 'T00:00:00').getDay();
  const act = d.patients.filter(p => p.status === '利用中' && !p.endDate).slice(0, 3);
  // 他の方は今日に来ない(連絡帳を3名にする)
  d.patients.forEach(p => { if (act.includes(p)) return; if (Array.isArray(p.scheduleAmPm)) { p.scheduleAmPm = [...p.scheduleAmPm]; p.scheduleAmPm[dw] = ''; } });
  act.forEach(p => { p.scheduleAmPm = ['', '', '', '', '', '', '']; p.scheduleAmPm[dw] = 'AM'; p.scheduleAmPm[nw] = 'AM'; p.scheduleChangeHistory = []; });
  // 今日と次回のあいだの曜日は来ない
  d.ticketRecords = (d.ticketRecords || []).filter(t => !act.some(p => p.id === t.patientId));
  d.monthlyShifts = {};
  d.transportPlans = { [`${nIso}_AM`]: { cars: { c1: act.slice(0, 2).map((p, i) => ({ pid: p.id, t: `8:${30 + i * 5}` })), c2: [] }, walkers: [{ pid: act[2].id, t: '徒歩' }], others: [], un: [], dropAt: { [String(act[0].id)]: '12:22', [String(act[1].id)]: '12:30' }, dropAtAuto: { [String(act[0].id)]: true }, _savedAt: Date.now() } };
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); return act.map(p => ({ id: p.id, name: p.name })); }, [iso, nIso]);

{ const page = await open({ viewport: { width: 1366, height: 900 } }); const P = await seed(page);
  await go(page, 'print', { date: iso, ampm: 'AM' });
  r.cardBefore = (await page.locator('[data-testid^="cb-dropnote-"]').count()) === 0;
  await page.locator('button:visible', { hasText: /^各種入力/ }).first().click(); await page.waitForTimeout(500);
  await page.getByTestId('cb-hub-renraku').click(); await page.waitForTimeout(600);
  r.btnShown = (await page.getByTestId('renraku-dropnote-btn').count()) === 1;
  await page.getByTestId('renraku-dropnote-btn').click(); await page.waitForTimeout(500);
  const m = page.getByTestId('cb-dropnote-modal'); r.modal = (await m.count()) === 1;
  const t0 = await page.getByTestId(`cb-dropnote-row-${P[0].id}`).innerText(); const t1 = await page.getByTestId(`cb-dropnote-row-${P[1].id}`).innerText(); const t2 = await page.getByTestId(`cb-dropnote-row-${P[2].id}`).innerText();
  const nLbl = `${nx.getMonth() + 1}月${nx.getDate()}日（${DOW[nx.getDay()]}）`;
  r.rowNext = t0.includes(nLbl) && /12時22分ごろ/.test(t0) && /12時30分ごろ/.test(t1); if (!r.rowNext) console.log(JSON.stringify([t0, t1, nLbl]));
  r.walkerNoTime = /送りの時間なし/.test(t2) && await page.getByTestId(`cb-dropnote-chk-${P[2].id}`).isDisabled();
  r.defaultChecked = await page.getByTestId(`cb-dropnote-chk-${P[0].id}`).isChecked() && await page.getByTestId(`cb-dropnote-chk-${P[1].id}`).isChecked();
  // 2人目は外して反映
  await page.getByTestId(`cb-dropnote-chk-${P[1].id}`).click(); await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT}/dropnote_modal.png` });
  await page.getByTestId('cb-dropnote-apply').click(); await page.waitForTimeout(900);
  r.modalLine = /次回のお送り：.*12時22分ごろ/.test(await page.getByTestId('renraku-dropnote-line').innerText().catch(() => ''));
  await page.locator('button', { hasText: /^キャンセル$/ }).last().click().catch(() => {}); await page.waitForTimeout(500);
  const card0 = page.getByTestId(`cb-dropnote-${P[0].id}`).first();
  r.cardShows = (await card0.count()) === 1 && (await card0.innerText()).includes(`次回のお送り：${nLbl} 12時22分ごろ`); if (!r.cardShows) console.log('card', await card0.innerText().catch(() => 'none'));
  r.cardOthersNo = (await page.getByTestId(`cb-dropnote-${P[1].id}`).count()) === 0;
  const d1 = await data(page); const rec = (d1.ticketRecords || []).find(t => t.patientId === P[0].id && t.renrakuDropAt === '1');
  r.saved = !!rec && !!(rec._fieldTs && rec._fieldTs.renrakuDropAt) && !(d1.ticketRecords || []).some(t => t.patientId === P[1].id && t.renrakuDropAt === '1');
  // 送迎表の時間を直すと連絡帳も合う
  await page.evaluate(([nIso, id]) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.transportPlans[`${nIso}_AM`].dropAt[String(id)] = '12:40'; d.transportPlans[`${nIso}_AM`]._savedAt = Date.now(); localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); }, [nIso, P[0].id]);
  await go(page, 'print', { date: iso, ampm: 'AM' });
  r.followsTp = /12時40分ごろ/.test(await page.getByTestId(`cb-dropnote-${P[0].id}`).first().innerText().catch(() => ''));
  await page.locator('button:visible', { hasText: /^各種入力/ }).first().click(); await page.waitForTimeout(500);
  r.badge = /送り1名/.test(await page.getByTestId('cb-hub-renraku-badge').innerText().catch(() => ''));
  await page.screenshot({ path: `${OUT}/dropnote_card.png` });
  // 次の連絡帳(次回の日)には入らない
  await page.keyboard.press('Escape').catch(() => {});
  await go(page, 'print', { date: nIso, ampm: 'AM' });
  r.nextDayBlank = (await page.locator('[data-testid^="cb-dropnote-"]').count()) === 0 && (await page.getByText(P[0].name, { exact: false }).count()) >= 1;
  if (!r.nextDayBlank) console.log('nextDay', await page.locator('[data-testid^="cb-dropnote-"]').count(), await page.locator(`[id="print-content-cb-${P[0].id}"]`).count(), await page.locator('input[type="date"]').first().inputValue().catch(() => '?'), nIso);
  // 外す
  await go(page, 'print', { date: iso, ampm: 'AM' });
  await page.locator('button:visible', { hasText: /^各種入力/ }).first().click(); await page.waitForTimeout(500);
  await page.getByTestId('cb-hub-renraku').click(); await page.waitForTimeout(500); await page.getByTestId('renraku-dropnote-btn').click(); await page.waitForTimeout(400);
  r.reopenState = await page.getByTestId(`cb-dropnote-chk-${P[0].id}`).isChecked() && !(await page.getByTestId(`cb-dropnote-chk-${P[1].id}`).isChecked());
  await page.getByTestId('cb-dropnote-none').click(); await page.getByTestId('cb-dropnote-apply').click(); await page.waitForTimeout(800);
  await page.locator('button', { hasText: /^キャンセル$/ }).last().click().catch(() => {}); await page.waitForTimeout(400);
  r.removed = (await page.locator('[data-testid^="cb-dropnote-"]').count()) === 0 && !(await data(page)).ticketRecords.some(t => t.renrakuDropAt === '1');
  // 送迎表を使わない店舗はボタンを出さない
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.systemSettings.transportEnabled = false; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); });
  await go(page, 'print', { date: iso, ampm: 'AM' });
  await page.locator('button:visible', { hasText: /^各種入力/ }).first().click(); await page.waitForTimeout(500); await page.getByTestId('cb-hub-renraku').click(); await page.waitForTimeout(500);
  r.offNoBtn = (await page.getByTestId('renraku-dropnote-btn').count()) === 0;
  await page.context().close(); }

// 座席表: 空の車の出発の目安は出さない・保存で消える／乗っていない方の着く時間の目安は消える(手で決めた時間は残る)
{ const page = await open({ viewport: { width: 1366, height: 900 } });
  const ids = await page.evaluate((iso) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.diarySettings.cars = [{ id: 'c1', name: '1号車', type: '', cap: '6' }, { id: 'c2', name: '2号車', type: '', cap: '4' }];
    const act = d.patients.filter(p => p.status === '利用中' && p.address).slice(0, 3); const dow = new Date(iso + 'T00:00:00').getDay(); act.forEach(p => { p.scheduleAmPm = ['', '', '', '', '', '', '']; p.scheduleAmPm[dow] = 'AM'; });
    d.transportPlans = { [`${iso}_AM`]: { cars: { c1: act.map((p, i) => ({ pid: p.id, t: `8:${30 + i * 5}` })), c2: [] }, walkers: [], others: [], un: [], dropMode: 'custom',
      drop: { cars: { c1: act.slice(0, 2).map((p, i) => ({ pid: p.id, seat: i })), c2: [] }, walkers: [], others: [], depart: { c1: '12:10', c2: '12:15' }, departAuto: { c1: true, c2: true } },
      dropAt: { [String(act[0].id)]: '12:20', [String(act[2].id)]: '12:40' }, dropAtAuto: { [String(act[0].id)]: true, [String(act[2].id)]: true }, _savedAt: Date.now() } };
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); return act.map(p => p.id); }, iso);
  await go(page, 'transport', { date: iso, ampm: 'AM' });
  await page.getByTestId(`tp-seatbtn-${iso}-AM`).first().click().catch(async () => { await page.getByTestId(`tp-fb-seatbtn-${iso}-AM`).first().click(); }); await page.waitForTimeout(800);
  const dep1 = await page.getByTestId('tp-seat-depart-c1').innerText(), dep2 = await page.getByTestId('tp-seat-depart-c2').innerText();
  const car2 = await page.getByTestId('tp-seatcar-c2').innerText();
  r.seatEmptyNoEst = /12:10/.test(dep1) && !/12:15/.test(dep2) && !/目安/.test(car2.split('\n').slice(0, 2).join(' ')); if (!r.seatEmptyNoEst) console.log(JSON.stringify([dep1, dep2, car2.slice(0, 80)]));
  // 何か1つ変える(1号車のメモ)→ 保存で消える
  const memo = page.getByTestId('tp-seat-memo-c1'); await memo.fill('前'); await memo.blur(); await page.waitForTimeout(800);
  const pl = (await data(page)).transportPlans[`${iso}_AM`];
  r.prunedDepart = pl.drop.depart.c1 === '12:10' && !pl.drop.depart.c2 && !(pl.drop.departAuto || {}).c2;
  r.prunedAt = pl.dropAt[String(ids[0])] === '12:20' && !pl.dropAt[String(ids[2])];
  // 手で入れた出発は、空の車でも残る
  await page.evaluate((iso) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const p = d.transportPlans[`${iso}_AM`]; p.drop.depart.c2 = '12:16'; p.drop.departAuto = { ...(p.drop.departAuto || {}), c2: false }; p._savedAt = Date.now(); localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); }, iso);
  await go(page, 'transport', { date: iso, ampm: 'AM' });
  await page.getByTestId(`tp-seatbtn-${iso}-AM`).first().click().catch(async () => { await page.getByTestId(`tp-fb-seatbtn-${iso}-AM`).first().click(); }); await page.waitForTimeout(800);
  r.manualDepShown = /12:16/.test(await page.getByTestId('tp-seat-depart-c2').innerText());
  await page.screenshot({ path: `${OUT}/dropnote_seat.png` });
  await page.context().close(); }
console.log(r, Object.values(r).every(v => v === true) ? 'PASS' : 'FAIL'); await b.close();
