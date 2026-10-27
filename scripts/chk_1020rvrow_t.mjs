// 提供記録: 押した行に青い枠(1行)・名前の長押しで印(複数・普通に押すと利用者情報)・目安の字が濃い・特記の一言・マイク(偽の音声認識)・各種設定の一言カード
import { chromium } from 'playwright';
const OUT = '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad';
const b = await chromium.launch(); const r = {};
const fakeSR = () => { window.SpeechRecognition = window.webkitSpeechRecognition = class { start() { setTimeout(() => { if (window.__srMode === 'stream') { const parts = ['今日は', '今日は元気', '今日は元気でした']; parts.forEach((t, i) => setTimeout(() => { this.onresult && this.onresult({ results: { 0: { 0: { transcript: t }, length: 1, isFinal: false }, length: 1 } }); }, i * 500)); setTimeout(() => { this.onend && this.onend(); }, parts.length * 500 + 300); return; } if (window.__srMode === 'interim') { /* iPhone の Safari のように確定した結果を返さず途中の結果だけで終わる */ const r0 = { 0: { transcript: '歩くのがゆっくり' }, length: 1, isFinal: false }; this.onresult && this.onresult({ results: { 0: r0, length: 1 } }); setTimeout(() => { this.onend && this.onend(); }, 120); return; } this.onresult && this.onresult({ results: [[{ transcript: 'よく笑っていました' }]] }); this.onend && this.onend(); }, 150); } stop() { this.onend && this.onend(); } abort() {} }; };
async function open(opt) { const ctx = await b.newContext({ locale: 'ja-JP', timezoneId: 'Asia/Tokyo', ...opt }); await ctx.addInitScript(fakeSR); const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.goto('http://localhost:4185/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); } return page; }
const go = async (page, v) => { await page.evaluate((v) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: null, t: Date.now() })), v); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); };
const longPress = async (page, loc) => { const bb = await loc.boundingBox(); await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down(); await page.waitForTimeout(750); await page.mouse.up(); await page.waitForTimeout(300); };
const overlays = (page) => page.evaluate(() => [...document.querySelectorAll('div')].filter(d => { const cs = getComputedStyle(d); return cs.position === 'fixed' && parseInt(cs.zIndex || '0') >= 50 && d.getBoundingClientRect().width > 300; }).length);
// ---- iPad 横 ----
{ const page = await open({ viewport: { width: 1180, height: 820 } }); await go(page, 'record');
  const rows = page.locator('#record-table tr[data-rv-pid]:not([data-rv-status="欠席"]):not([data-rv-status="休業"])');
  r.hasRows = (await rows.count()) >= 3;
  const pid = async (i) => rows.nth(i).getAttribute('data-rv-pid');
  const p0 = await pid(0), p1 = await pid(1), p2 = await pid(2);
  // マスを押した合図(pointerdown)を行の中のマスに送る(気分などは押すと全画面の小窓が開くため、実際の押下は名前の長押しで確かめる)
  const tapCell = async (i) => { await rows.nth(i).locator('td').last().evaluate(td => td.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }))); await page.waitForTimeout(200); };
  await tapCell(0); let cur = await page.locator('#record-table tr[data-rv-cur]').evaluateAll(els => els.map(e => e.getAttribute('data-rv-pid')));
  const sh = await page.locator(`#record-table tr[data-rv-pid="${p0}"] > td`).nth(3).evaluate(e => getComputedStyle(e).boxShadow);
  r.curRow = cur.length === 1 && cur[0] === p0 && /rgb\(234, 179, 8\) 0px 2px/.test(sh) && /253, 224, 71, 0\.38/.test(sh); // 入力中=黄色の背景＋濃い黄色の枠
  await tapCell(1); cur = await page.locator('#record-table tr[data-rv-cur]').evaluateAll(els => els.map(e => e.getAttribute('data-rv-pid'))); r.curMoves = cur.length === 1 && cur[0] === p1;
  const ov0 = await overlays(page); const tblY0 = (await page.locator('#record-table').boundingBox()).y; const barVis0 = await page.getByTestId('rv-marks-bar').evaluate(e => getComputedStyle(e).visibility);
  await longPress(page, page.getByTestId(`rv-name-${p0}`)); await longPress(page, page.getByTestId(`rv-name-${p2}`));
  const marks = await page.locator('#record-table tr[data-rv-mark]').evaluateAll(els => els.map(e => e.getAttribute('data-rv-pid')));
  r.marks2 = marks.length === 2 && marks.includes(p0) && marks.includes(p2) && /2名/.test(await page.getByTestId('rv-marks-bar').innerText());
  r.longPressNoModal = (await overlays(page)) === ov0;
  r.tableNotShifted = Math.abs((await page.locator('#record-table').boundingBox()).y - tblY0) < 1 && barVis0 === 'hidden' && (await page.getByTestId('rv-marks-bar').evaluate(e => getComputedStyle(e).visibility)) === 'visible';
  const shm = await page.locator(`#record-table tr[data-rv-pid="${p0}"] > td`).nth(3).evaluate(e => getComputedStyle(e).boxShadow); r.markColor = /253, 224, 71, 0\.28/.test(shm) && !/0px 2px 0px/.test(shm); // 印=薄い黄色の背景だけ(枠なし)
  await page.screenshot({ path: `${OUT}/rvrow_ipad.png` });
  await longPress(page, page.getByTestId(`rv-name-${p2}`)); r.markToggleOff = (await page.locator('#record-table tr[data-rv-mark]').count()) === 1;
  await page.getByTestId('rv-marks-clear').click(); await page.waitForTimeout(200); r.marksCleared = (await page.locator('#record-table tr[data-rv-mark]').count()) === 0 && (await page.getByTestId('rv-marks-bar').evaluate(e => getComputedStyle(e).visibility)) === 'hidden';
  await page.getByTestId(`rv-name-${p1}`).click(); await page.waitForTimeout(500); r.shortClickModal = (await overlays(page)) > ov0; await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  for (let k = 0; k < 3 && (await overlays(page)) > ov0; k++) { await page.mouse.click(4, 4); await page.waitForTimeout(300); if ((await overlays(page)) > ov0) { const x = page.locator('div.fixed.inset-0 button:visible').filter({ hasText: /^(閉じる|×|✕|)$/ }).first(); if (await x.count()) await x.click().catch(() => {}); await page.waitForTimeout(300); } }
  r.modalClosed = (await overlays(page)) === ov0;
  const bp = await page.evaluate((pid) => { const row = document.querySelector(`#record-table tr[data-rv-pid="${pid}"]`); const pl = row && row.querySelector('input[inputmode="numeric"]'); const th = document.querySelector('[data-testid="rv-th-bpst"]'); const spans = th ? th.querySelectorAll('span') : []; const bpEl = row && (row.querySelector('[data-testid^="bp-cell-"]') || row.querySelector('input[placeholder="上/下"]'));
    if (!pl || !bpEl || spans.length < 2) return null; const c = (e) => { const r = e.getBoundingClientRect(); return (r.left + r.right) / 2; }; return { plBg: getComputedStyle(pl).backgroundColor, dBp: Math.abs(c(spans[0]) - c(bpEl)), dPl: Math.abs(c(spans[1]) - c(pl)) }; }, p1);
  r.pulseWhite = !!bp && bp.plBg === 'rgb(255, 255, 255)'; r.headerAligned = !!bp && bp.dBp <= 3 && bp.dPl <= 3; if (!r.pulseWhite || !r.headerAligned) console.log('bp', JSON.stringify(bp));
  // 目安の字の色
  const phc = await page.evaluate(() => { const el = [...document.querySelectorAll('#record-table input[placeholder]')].find(i => i.placeholder && i.className.includes('placeholder-slate-500')); return el ? getComputedStyle(el, '::placeholder').color : ''; });
  r.placeholderDark = phc === 'rgb(100, 116, 139)'; if (!r.placeholderDark) console.log('ph', phc);
  // 一言・マイク
  const ta = () => page.locator(`#record-table tr[data-rv-pid="${p1}"] textarea`).first();
  await page.getByTestId(`rv-tokki-pick-${p1}`).selectOption('体調不良'); await page.waitForTimeout(250);
  await page.getByTestId(`rv-tokki-pick-${p1}`).selectOption('歩行不安定'); await page.waitForTimeout(250);
  await page.getByTestId(`rv-tokki-pick-${p1}`).selectOption('体調不良'); await page.waitForTimeout(250);
  r.leftOfField = await page.evaluate((pid) => { const sel = document.querySelector(`[data-testid="rv-tokki-pick-${pid}"]`); const ta = document.querySelector(`#record-table tr[data-rv-pid="${pid}"] textarea`); return !!sel && !!ta && sel.getBoundingClientRect().right <= ta.getBoundingClientRect().left + 1; }, p1);
  r.pickAppend = (await ta().inputValue()) === '体調不良・歩行不安定' && (await page.getByTestId(`rv-tokki-pick-${p1}`).inputValue()) === '';
  await page.getByTestId(`rv-tokki-mic-${p1}`).click(); await page.waitForTimeout(1200);
  r.micAppend = (await ta().inputValue()) === '体調不良・歩行不安定・よく笑っていました'; if (!r.micAppend) console.log('ta', await ta().inputValue());
  await page.evaluate(() => { window.__srMode = 'interim'; }); await page.getByTestId(`rv-tokki-mic-${p1}`).click(); await page.waitForTimeout(800);
  r.micInterimOnly = (await ta().inputValue()) === '体調不良・歩行不安定・よく笑っていました・歩くのがゆっくり'; if (!r.micInterimOnly) console.log('ta2', await ta().inputValue());
  await page.evaluate(() => { window.__srMode = 'stream'; }); const baseT = await ta().inputValue();
  await page.getByTestId(`rv-tokki-mic-${p1}`).click(); await page.waitForTimeout(1100);
  const mid = await ta().inputValue(); r.liveInField = mid.startsWith(baseT + '・今日は') && mid !== baseT && (await page.getByTestId(`rv-tokki-mic-${p1}-live`).count()) === 0;
  await page.waitForTimeout(1500); r.liveCommitted = (await ta().inputValue()) === baseT + '・今日は元気でした'; if (!r.liveInField || !r.liveCommitted) console.log('live', mid, '|', await ta().inputValue());
  await page.evaluate(() => { window.__srMode = ''; });
  await page.getByTestId(`rv-tokki-pick-${p1}`).scrollIntoViewIfNeeded(); await page.screenshot({ path: `${OUT}/rvrow_tokki.png` });
  // 各種設定: 一言の追加・マイクを出さない
  await go(page, 'settings'); await page.locator('button', { hasText: /^サービス提供内容$/ }).first().click().catch(() => {}); await page.waitForTimeout(600);
  const card = page.getByTestId('tokki-preset-card'); r.settingsCard = (await card.count()) === 1;
  await card.locator('input[maxlength="15"]').fill('表情良好'); await card.locator('button', { hasText: /^追加$/ }).click(); await page.waitForTimeout(500);
  await page.getByTestId('tokki-voice-toggle').uncheck(); await page.waitForTimeout(500);
  await card.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${OUT}/rvrow_settings.png` });
  await go(page, 'record');
  r.newPreset = (await page.getByTestId(`rv-tokki-pick-${p0}`).locator('option', { hasText: '表情良好' }).count()) === 1;
  r.micHidden = (await page.locator(`[data-testid^="rv-tokki-mic-"]`).count()) === 0;
  await page.context().close(); }
// ---- スマホ ----
{ const page = await open({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await go(page, 'record');
  const card = page.locator('[data-rec-card]').first(); const cp = await card.getAttribute('data-rec-card');
  await card.locator('.mb-2\\.5').first().tap({ position: { x: 200, y: 4 } }).catch(async () => { await card.tap({ position: { x: 5, y: 5 } }); }); await page.waitForTimeout(250);
  r.cardCur = (await page.locator('[data-rec-card][data-rv-cur]').count()) === 1;
  { const m = await card.evaluate(e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { l: r.left, w: r.width, vw: window.innerWidth, pad: cs.paddingLeft, sh: cs.boxShadow }; }); r.cardFull = m.l <= 0.5 && Math.abs(m.w - m.vw) <= 1 && m.pad === '10px' && /inset/.test(m.sh) && /234, 179, 8/.test(m.sh); if (!r.cardFull) console.log('card', JSON.stringify(m)); }
  await page.getByTestId(`rv-ctokki-pick-${cp}`).selectOption('眠気あり'); await page.waitForTimeout(250);
  r.cardPick = /眠気あり/.test(await card.locator('input[type="text"]').last().inputValue());
  { const nm = page.getByTestId(`rv-cname-${cp}`); const bb = await nm.boundingBox(); const y0 = (await card.boundingBox()).y; await nm.evaluate(e => { const o = { bubbles: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: 10, clientY: 10, button: 0 }; e.dispatchEvent(new PointerEvent('pointerdown', o)); setTimeout(() => { e.dispatchEvent(new PointerEvent('pointerup', o)); e.dispatchEvent(new MouseEvent('click', { bubbles: true })); }, 700); }); await page.waitForTimeout(1100);
    for (let k = 0; k < 3 && (await overlays(page)) > 0; k++) { await page.mouse.click(4, 4); await page.waitForTimeout(300); }
    r.phoneMarkChip = (await page.getByTestId('rv-marks-bar-phone').count()) === 1 && Math.abs((await card.boundingBox()).y - y0) < 1 && (await card.getAttribute('data-rv-mark')) === '1'; if (!r.phoneMarkChip) console.log('phone', await page.getByTestId('rv-marks-bar-phone').count(), await card.getAttribute('data-rv-mark'));
    await page.screenshot({ path: `${OUT}/rvrow_phone_mark.png` });
    if (r.phoneMarkChip) { await page.getByTestId('rv-marks-clear-phone').click(); await page.waitForTimeout(300); r.phoneMarkClear = (await page.getByTestId('rv-marks-bar-phone').count()) === 0; } }
  r.cardMicShown = (await page.getByTestId(`rv-ctokki-mic-${cp}`).count()) === 1;
  r.cardLeft = await page.evaluate((cp) => { const sel = document.querySelector(`[data-testid="rv-ctokki-pick-${cp}"]`); const mic = document.querySelector(`[data-testid="rv-ctokki-mic-${cp}"]`); const inp = sel && sel.parentElement.querySelector('input[type="text"]'); if (!sel || !inp) return false; const a = sel.getBoundingClientRect(), m = mic ? mic.getBoundingClientRect() : a, i = inp.getBoundingClientRect(); return a.right <= m.left + 1 && m.right <= i.left + 1 && Math.abs(a.top - i.top) < 6; }, cp);
  await page.getByTestId(`rv-ctokki-pick-${cp}`).scrollIntoViewIfNeeded(); await page.screenshot({ path: `${OUT}/rvrow_phone.png` });
  await page.context().close(); }
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
