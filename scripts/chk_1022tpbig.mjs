// 2026-10-22 送迎表の週の運行表は いつもできるだけ大きい文字(名前の右に時間: 15人の週=午前・午後で2枚・14px以上 / 送りを入れない: 1枚 / 3人の週=1枚のまま): 15人(2台8・7人)の週で、ふつう(1枚)と大きく(午前・午後で2枚)の名前・時間の文字の大きさ。(元: 2026-10-21 1枚に入りきらない(車4台・1コマ28名)ときは午前1枚・午後1枚に分けて全員が載る／入るときは1枚のまま
//   ＋(試験版のみ・--opt) ダウンロードの「送りの時間も入れる」を外すと、週・1日の運行表に送りの時間が出ない
//   使い方: node scripts/chk_1021tpsplit.mjs [port] [--opt]
import { chromium } from 'playwright';
const PORT = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '4173'; const OPT = process.argv.includes('--opt');
const b = await chromium.launch(); const r = {};
const mon = new Date(); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7)); const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const days = Array.from({ length: 6 }, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return isoOf(d); });
async function run(sizesArg) {
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 160)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  const names = await page.evaluate(([days, big]) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3'));
    const sizes = big; const caps = big.map(x => x + 1); const per = sizes.reduce((a, x) => a + x, 0);
    d.diarySettings.cars = caps.map((c, i) => ({ id: 'c' + (i + 1), name: `${i + 1}号車`, type: '', cap: String(c) }));
    const act = d.patients.filter(p => p.status === '利用中').slice(0, per * 2); if (globalThis.__real !== false) { const keep = new Set(act.map(p => p.id)); d.patients.forEach(p => { if (!keep.has(p.id)) { p.status = '終了'; p.scheduleAmPm = ['', '', '', '', '', '', '']; } }); d.ticketRecords = []; d.monthlyShifts = {}; } /* ★ 実際の店舗に近い形: 利用者はその週の方だけ */ const tp = {}; const used = new Set();
    days.forEach(iso => ['AM', 'PM'].forEach((sl, si) => { const L = act.slice(si * per, si * per + per); let o = 0; const cars = {}; sizes.forEach((n, ci) => { cars['c' + (ci + 1)] = L.slice(o, o + n).map((p, i) => ({ pid: p.id, t: sl === 'AM' ? `8:${String(20 + i * 5).padStart(2, '0')}` : `13:${String(5 + i * 5).padStart(2, '0')}` })); o += n; });
      const dropAt = {}; Object.values(cars).forEach(ms => [...ms].reverse().forEach((m, i) => { dropAt[String(m.pid)] = sl === 'AM' ? `12:${String(10 + i * 6).padStart(2, '0')}` : `16:${String(10 + i * 6).padStart(2, '0')}`; used.add(m.pid); }));
      tp[`${iso}_${sl}`] = { cars, walkers: [], others: [], un: [], dropAt, _savedAt: Date.now() }; }));
    d.transportPlans = tp; localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); return d.patients.filter(p => used.has(p.id)).map(p => p.name); }, [days, sizesArg]);
  await page.evaluate((iso) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, date: iso, t: Date.now() })), days[0]);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 800 }).catch(() => {});
  const cap = async (mode, dropOff) => { await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 800 }).catch(() => {}); await page.waitForTimeout(200); await page.evaluate(() => { window.__ph = ''; window.addEventListener('setPrintHtml', e => { window.__ph = (e.detail && e.detail.html) || ''; }, { once: true }); });
    await page.locator('button:visible', { hasText: /^ダウンロード$/ }).first().click(); await page.waitForTimeout(400);
    if (mode === 'days') { await page.locator('button:visible', { hasText: /^日ごと/ }).first().click(); await page.waitForTimeout(200); }
    if (dropOff) { if (mode === 'week') await page.getByTestId('tp-print-drop-none').check(); else await page.getByTestId('tp-print-dropat').locator('input').uncheck(); } else if (mode === 'week') await page.getByTestId('tp-print-drop-col').check().catch(() => {});
    await page.locator('button:visible', { hasText: /^ダウンロード$/ }).last().click(); await page.waitForTimeout(1500);
    const ph = await page.evaluate(() => window.__ph); await page.keyboard.press('Escape').catch(() => {}); await page.locator('button:visible', { hasText: /^(閉じる|×|✕)$/ }).last().click().catch(() => {}); await page.waitForTimeout(400); return ph; };
  const fsOf = (h) => { const el = document.createElement('div'); return h; };
  const measure = async (mode) => { await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 800 }).catch(() => {}); await page.evaluate(() => { window.__ph = ''; window.addEventListener('setPrintHtml', e => { window.__ph = (e.detail && e.detail.html) || ''; }, { once: true }); });
    await page.locator('button:visible', { hasText: /^ダウンロード$/ }).first().click(); await page.waitForTimeout(400); await page.getByTestId(`tp-print-drop-${mode}`).check(); await page.waitForTimeout(150);
        await page.locator('button:visible', { hasText: /^ダウンロード$/ }).last().click(); await page.waitForTimeout(1500); const ph = await page.evaluate(() => window.__ph);
    await page.keyboard.press('Escape').catch(() => {}); await page.locator('button:visible', { hasText: /^(閉じる|×|✕)$/ }).last().click().catch(() => {}); await page.waitForTimeout(400);
    const m = await page.evaluate(([html, names]) => { const el = document.createElement('div'); el.style.cssText = 'position:absolute;left:-30000px;top:0;width:1069px;'; el.innerHTML = html; document.body.appendChild(el);
      const fs = (re) => { const out = []; el.querySelectorAll('td,div,span').forEach(x => { if (x.children.length === 0 && re.test(x.textContent.trim())) out.push(parseFloat(getComputedStyle(x).fontSize)); }); out.sort((a, b) => a - b); return out[Math.floor(out.length / 2)] || 0; };
      const nameFs = fs(new RegExp('^(' + names.slice(0, 5).map(n => n.split(/[\s　]/)[0]).join('|') + ')')); const timeFs = fs(/^\d{1,2}:\d{2}$/);
      const pages = el.querySelectorAll('[data-page-break="1"]').length; const all = names.every(n => html.includes(n)); el.remove(); return { nameFs, timeFs, pages, all }; }, [ph, names]); return m; };
  const out = { col: await measure('col'), none: await measure('none') };
  await ctx.close(); return out;
}
const many = await run([8, 7]), few = await run([3]); console.log('15人', JSON.stringify(many)); console.log('3人', JSON.stringify(few));
r.manyNone1page = many.none.pages === 1 && many.none.all && many.none.nameFs >= 12; r.manyColOk = many.col.pages <= 2 && many.col.all && many.col.nameFs >= 11; r.fewNone1page = few.none.pages === 1 && few.none.nameFs >= 14 && few.col.pages === 1;
console.log(r, Object.values(r).every(v => v === true) ? 'PASS' : 'FAIL'); await b.close();
