// 提供記録: マスを押して入力中にしたとき、その行に青(選んだマスの青い枠・青い背景・名前のマスの青)が残らず黄色だけになる(iPad 横・スマホ)
import { chromium } from 'playwright';
const OUT = '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad';
const b = await chromium.launch(); const r = {};
const BLUE = ['rgb(239, 246, 255)', 'rgb(219, 234, 254)', 'rgb(59, 130, 246)', 'rgb(147, 197, 253)', 'rgb(37, 99, 235)'];
const blueIn = (sel) => `(() => { const BL = ${JSON.stringify(BLUE)}; const root = document.querySelector('${sel}'); if (!root) return ['(no row)']; const out = []; [root, ...root.querySelectorAll('*')].forEach(e => { if (e.closest('button') && /出席|欠席|振替|臨時|休止|休業/.test((e.closest('button').innerText || ''))) return; if (e.tagName === 'SELECT') return; const cs = getComputedStyle(e); ['backgroundColor', 'borderTopColor'].forEach(k => { if (BL.includes(cs[k]) && (k !== 'borderTopColor' || parseFloat(cs.borderTopWidth) > 0)) out.push(e.tagName + '.' + String(e.className).slice(0, 40) + ' ' + k + '=' + cs[k]); }); const sh = cs.boxShadow || ''; if (/59, 130, 246|147, 197, 253/.test(sh)) out.push(e.tagName + ' shadow'); }); return out.slice(0, 6); })()`;
{ const page = await (await b.newContext({ viewport: { width: 1180, height: 820 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.goto('http://localhost:4185/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'record', pid: null, t: Date.now() }))); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800);
  const row = page.locator('#record-table tr[data-rv-pid][data-rv-status="出席"]').nth(1); const pid = await row.getAttribute('data-rv-pid');
  // 運動のマスを押す(数字の入力パネルが開く)→ 選んでいるマスになる
  const ex = row.locator('td input[type="text"]').nth(3); await ex.click(); await page.waitForTimeout(500);
  const blue1 = await page.evaluate(blueIn(`#record-table tr[data-rv-pid="${pid}"]`)); r.exerciseCellYellow = blue1.length === 0; if (blue1.length) console.log('blue(ex)', blue1);
  const act = await page.evaluate((pid) => { const el = [...document.querySelectorAll(`#record-table tr[data-rv-pid="${pid}"] input`)].find(i => /amber-500/.test(i.className)); return el ? getComputedStyle(el).borderTopColor : ''; }, pid); r.activeCellAmber = act === 'rgb(245, 158, 11)';
  await page.screenshot({ path: `${OUT}/rvyellow_ipad.png` });
  await page.keyboard.press('Escape').catch(() => {}); await page.mouse.click(5, 5); await page.waitForTimeout(300);
  // 血圧のマス
  const bpc = row.locator('[data-testid^="bp-cell-"]').first(); if (await bpc.count()) { await bpc.click(); await page.waitForTimeout(400); const blue2 = await page.evaluate(blueIn(`#record-table tr[data-rv-pid="${pid}"]`)); r.bpCellYellow = blue2.length === 0; if (blue2.length) console.log('blue(bp)', blue2); await page.screenshot({ path: `${OUT}/rvyellow_ipad_bp.png` }); }
  await page.context().close(); }
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close();
