import { chromium } from 'playwright';
const OUT = '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad';
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
const dialogs = []; page.on('dialog', d => { dialogs.push(d.message().slice(0, 60)); d.accept(); }); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
const pdfs = []; await page.route('**/api/pdf**', async (route) => { try { pdfs.push(JSON.parse(route.request().postData() || '{}')); } catch {} await route.fulfill({ status: 200, contentType: 'application/pdf', body: '%PDF-1.4\n%%EOF' }); });
await page.goto('http://localhost:4185/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const today = new Date(); const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
const pid = await page.evaluate((iso) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const p = d.patients.find(x => x.status === '利用中'); p.cmName = '見本 太郎'; p.cmOffice = '見本居宅';
  p.personalFile = { ...(p.personalFile || {}), meetings: [{ id: 'm1', date: iso, dateLabel: '令和8年10月16日', dayOfWeek: '金', timeStart: '', timeEnd: '', location: '事業所', attendees: 'ご本人/妹様/見本CM', reason: '介護保険更新(', content: '更新結果要支援2\n' + ('長い文。'.repeat(40) + '\n').repeat(12) }] };
  d.scheduleEvents = [...(d.scheduleEvents || []), { id: 'ev1', date: iso, start: '11:00', end: '11:30', title: '担当者会議', patientId: p.id, color: '#3b82f6' }];
  d.initialReports = (d.initialReports || []).filter(r => r.patientId !== p.id);
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); sessionStorage.setItem('tsumugiReopenPF', JSON.stringify({ patientId: p.id, tab: 'cat_3' })); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'master', pid: p.id, t: Date.now() })); return p.id; }, iso);
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
const M = page.locator('[data-testid="personal-file-modal"]'); console.log('pf modal', await M.count());
if (!(await M.count())) { await page.locator('button', { hasText: '個人ファイル' }).first().click(); await page.waitForTimeout(800); }
await page.locator('[data-testid="personal-file-modal"] button', { hasText: /ケアプラン・担当者会議/ }).first().click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(500); console.log('tab btns', await page.locator('[data-testid="personal-file-modal"] button', { hasText: /^小窓$|ダウンロード/ }).count());
// ダウンロード → すぐ PDF
const n0 = pdfs.length; await page.getByTestId('meeting-dl-m1').click(); await page.waitForTimeout(2500);
const h = pdfs.length > n0 ? pdfs.at(-1).html : ''; console.log('pdf direct', pdfs.length > n0, 'title at top', h.indexOf('サービス担当者会議録') > 0 && h.indexOf('サービス担当者会議録') < h.indexOf('介護区分'), 'content fs', (h.match(/overflow:hidden;">/) ? (h.match(/font-size:([\d.]+)px;line-height:1\.75/) || [])[1] : '?'), 'preview modal', await page.locator('text=サービス担当者会議録 プレビュー').count());
if (h) { const fs = await import('fs'); fs.writeFileSync(`${OUT}/meeting_pdf.html`, h); }
await page.keyboard.press('Escape').catch(() => {}); await page.locator('[data-testid="pdf-job"] button', { hasText: '閉じる' }).click({ timeout: 500 }).catch(() => {});
// 小窓で開く → 時間がカレンダーから入る・出席者チェック・開催理由の分解・ボタンの日本語
await page.locator('[data-testid="personal-file-modal"] button', { hasText: /^小窓$/ }).first().click(); await page.waitForTimeout(800);
const fl = page.getByTestId('meeting-float'); console.log('float', await fl.count());
const info = await fl.evaluate(el => { const r = el.getBoundingClientRect(); return { inView: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, btns: [...el.querySelectorAll('button')].map(b => b.innerText.trim()).filter(Boolean).join('|'), times: [...el.querySelectorAll('input[type=time]')].map(i => i.value).join('-'), checked: [...el.querySelectorAll('input[type=checkbox]:checked')].length, selects: [...el.querySelectorAll('select')].map(s => s.value).join('|'), title: (el.innerText.match(/担当者会議メモ — [^\n]+/) || [''])[0].replace(/見本 \S+/, '○○') }; });
console.log('float info', JSON.stringify(info));
console.log('layout', JSON.stringify(await fl.evaluate(el => { const ta = [...el.querySelectorAll('textarea')].pop(); const save = [...el.querySelectorAll('button')].find(b => b.innerText.trim() === '保存'); const end = [...el.querySelectorAll('button')].find(b => b.innerText.trim() === '終了'); const tr = ta.getBoundingClientRect(), sr = save.getBoundingClientRect(), er = end.getBoundingClientRect(); return { taH: Math.round(tr.height), overlap: sr.top < tr.bottom && sr.bottom > tr.top, endLeftOfSave: er.left < sr.left, saveAboveFields: sr.bottom < el.querySelector('input[type=date]').getBoundingClientRect().top }; })));
// 画面の外へ動かそうとする → 中に収まる
await fl.locator('span', { hasText: '担会メモ' }).first().hover(); const hb = await fl.locator('span', { hasText: '担会メモ' }).first().boundingBox();
await page.mouse.move(hb.x + 10, hb.y + 10); await page.mouse.down(); await page.mouse.move(2000, 1500, { steps: 5 }); await page.mouse.up(); await page.waitForTimeout(300);
console.log('after drag out', JSON.stringify(await fl.evaluate(el => { const r = el.getBoundingClientRect(); return { right: Math.round(r.right), bottom: Math.round(r.bottom), vw: innerWidth, vh: innerHeight }; })));
// 全画面 → 元の大きさ
await fl.locator('button', { hasText: '全画面' }).click(); await page.waitForTimeout(300); console.log('full', JSON.stringify(await fl.evaluate(el => { const r = el.getBoundingClientRect(); const ta = [...el.querySelectorAll('textarea')].pop(); const save = [...el.querySelectorAll('button')].find(b => b.innerText.trim() === '保存'); const tr = ta.getBoundingClientRect(), sr = save.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), taH: Math.round(tr.height), overlap: sr.top < tr.bottom && sr.bottom > tr.top, saveInside: sr.bottom <= r.bottom }; })));
await fl.screenshot({ path: `${OUT}/float_full.png` });
await fl.locator('button', { hasText: '元の大きさ' }).click(); await page.waitForTimeout(300);
// 開催理由を選ぶ → 介護度の変更欄 → 保存 → reason 文字列
await fl.locator('select').first().selectOption('介護認定の更新'); await page.waitForTimeout(200);
const sels = fl.locator('select'); console.log('selects after', await sels.count(), 'careBefore default', await sels.nth(1).inputValue());
await sels.nth(2).selectOption('要介護1'); await page.waitForTimeout(200);
await fl.locator('input[type=checkbox]').nth(1).check(); await page.waitForTimeout(200); // ご家族
const fam = fl.locator('input[placeholder^="ご家族のどなたか"]'); console.log('family input', await fam.count()); await fam.fill('長女 ○○様'); await page.waitForTimeout(200);
await fl.locator('button', { hasText: /^保存$/ }).click(); await page.waitForTimeout(400); console.log('pop', await page.evaluate(() => { const el = document.getElementById('tsu-pop-notice'); const save = [...document.querySelectorAll('[data-testid="meeting-float"] button')].find(b => b.innerText.trim() === '保存'); if (!el) return 'none'; const pr = el.getBoundingClientRect(), sr = save.getBoundingClientRect(); return el.textContent + ' near save: ' + (Math.abs((pr.left + pr.width / 2) - (sr.left + sr.width / 2)) < 20 && pr.bottom <= sr.top + 2); })); await page.waitForTimeout(400);
console.log('saved', JSON.stringify(await page.evaluate((pid) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const m = d.patients.find(p => p.id === pid).personalFile.meetings[0]; return { reason: m.reason, type: m.reasonType, att: m.attendees.replace(/見本 \S+/g, '○○'), t: m.timeStart + '-' + m.timeEnd }; }, pid)));
// 小窓を出したまま 個人ファイル→編集 → 小窓が閉じて入力画面だけ・入力画面は全画面・右上の×なし
await page.locator('button', { hasText: '個人ファイル' }).first().click(); await page.waitForTimeout(1000);
await page.locator('[data-testid="personal-file-modal"] button', { hasText: /ケアプラン・担当者会議/ }).first().click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(400);
await page.locator('[data-testid="personal-file-modal"] button', { hasText: /^編集$/ }).first().click(); await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/form_dbg.png` }); console.log('dialogs so far', JSON.stringify(dialogs)); console.log('form open → float', await fl.count(), 'form', JSON.stringify(await page.evaluate(() => { const t = [...document.querySelectorAll('div')].find(d => d.innerText && d.innerText.startsWith('サービス担当者会議記録表')); const box = t && t.closest('.bg-white.shadow-2xl'); const r = box && box.getBoundingClientRect(); const ta = box && [...box.querySelectorAll('textarea')].pop(); return r ? { w: Math.round(r.width), h: Math.round(r.height), vw: innerWidth, vh: innerHeight, xBtn: !!box.querySelector('svg.lucide-x'), taH: ta ? Math.round(ta.getBoundingClientRect().height) : 0 } : null; })));
await page.locator('button', { hasText: /^終了$/ }).last().click(); await page.waitForTimeout(400);
console.log('closed', await fl.count(), 'dialogs', dialogs.length);
// 初回ご利用報告: 別の場所で保管
if (!(await page.locator('[data-testid="personal-file-modal"]').count())) { await page.locator('button', { hasText: '個人ファイル' }).first().click(); await page.waitForTimeout(1000); }
const irTab = page.locator('[data-testid="personal-file-modal"] button', { hasText: /初回ご利用報告/ }).first(); console.log('irTab', await irTab.count(), await irTab.isVisible().catch(() => false)); await irTab.scrollIntoViewIfNeeded().catch(() => {}); await irTab.click({ timeout: 3000, force: true }).catch(e => console.log('irTab click fail', e.message.slice(0, 80))); await page.waitForTimeout(800); await page.screenshot({ path: `${OUT}/ir_dbg.png` });
const ext = page.getByTestId('ir-external'); console.log('ir-external', await ext.count(), 'ir texts', await page.evaluate(() => [...document.querySelectorAll('[data-testid="personal-file-modal"] button, [data-testid="personal-file-modal"] label')].map(b => b.innerText.trim().slice(0, 14)).filter(t => /初回|手入力|添付|別の場所/.test(t)).join('|')));
if (await ext.count()) { await ext.click(); await page.waitForTimeout(800); console.log('ir done', await page.locator('text=別の場所で保管').count() > 0, JSON.stringify(await page.evaluate((pid) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const e = (d.initialReports || []).find(r => r.patientId === pid); return e ? { ext: e.byExternal } : null; }, pid))); }
await b.close();
