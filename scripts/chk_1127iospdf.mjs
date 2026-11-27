// 2026-11-27 1127c(ユーザー「iPad で連絡帳ダウンロードしてから PDF 作成してますで止まる」)
//   iPad(ホーム画面のアプリ)は、先に開いた別タブへ PDF を渡せない → 別タブは開かず、画面の中の小窓で「作成しています → PDFができました(共有・印刷／新しいタブで開く)」
//   実行: node scripts/chk_1127iospdf.mjs [--port 4175]   (/api/pdf は検査用の小さい PDF に差し替え)
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4175'; })();
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
const b = await chromium.launch();
const run = async (ipad) => {
  const tag = ipad ? 'iPad' : 'PC';
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', acceptDownloads: true, ...(ipad ? { hasTouch: true, userAgent: 'Mozilla/5.0 (iPad; CPU OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1' } : {}) });
  const page = await ctx.newPage(); const dialogs = []; page.on('dialog', d => { dialogs.push(d.message()); d.accept(); }); page.on('pageerror', e => { console.log('PAGEERROR', e.message.slice(0, 200)); fails++; });
  let popups = 0; ctx.on('page', () => { popups++; });
  let pdfCalls = 0, delay = 1500, fail = false;
  await ctx.route('**/api/pdf', async (route) => { pdfCalls++; await new Promise(r => setTimeout(r, delay)); if (fail) return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: '検査用の失敗' }) }); return route.fulfill({ status: 200, contentType: 'application/pdf', body: PDF }); });
  if (ipad) await page.addInitScript(() => { try { Object.defineProperty(navigator, 'standalone', { get: () => true, configurable: true }); } catch {} window.__shareCalls = []; navigator.share = async (d) => { window.__shareCalls.push((d.files || []).map(f => ({ name: f.name, size: f.size, type: f.type }))); }; navigator.canShare = () => true; });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  const T = new Date(); const D = `${T.getFullYear()}-${String(T.getMonth() + 1).padStart(2, '0')}-${String(T.getDate()).padStart(2, '0')}`;
  await page.evaluate((D) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3'));
    const [y, m, dd] = D.split('-').map(Number); const date = `${m}月${dd}日`;
    d.systemSettings = d.systemSettings || {}; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [] }; d.holidays = [];
    const ps = d.patients.filter(p => p.status === '利用中' && !p.endDate); d.patients.forEach(p => { p.scheduleAmPm = ['', '', '', '', '', '', '']; p.pauseHistory = []; p.scheduleChangeHistory = []; });
    const P = ps[0]; P.scheduleAmPm = ['AM', 'AM', 'AM', 'AM', 'AM', 'AM', 'AM']; d.monthlyShifts = {};
    d.ticketRecords = (d.ticketRecords || []).filter(x => x.date !== date);
    d.ticketRecords.push({ id: `tr_${P.id}_${y}_${m}_${dd}`, patientId: P.id, name: P.name, kana: P.kana || '', status: '出席', date, year: y, temp_AM: '36.5', bpUpSt_AM: '128', bpDnSt_AM: '70', plSt_AM: '66', _savedAt: Date.now() - 60000 });
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0');
    sessionStorage.setItem('tsumugiActiveRecorder', JSON.stringify({ id: 'demo_rec', name: '見本 職員', roleLabel: '介護職員' }));
    sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'print', pid: null, date: D, t: Date.now(), ampm: 'AM' })); }, D);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2200); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
  const dl = async () => { await page.getByTestId('cb-pdf').click(); await page.waitForTimeout(500);
    await page.locator('button', { hasText: /^このまま進む$/ }).click({ timeout: 500 }).catch(() => {}); await page.waitForTimeout(300);
    const go = page.locator('button', { hasText: /名をダウンロード/ }); if (await go.count()) { if (await go.isDisabled()) { await page.locator('button', { hasText: /全員|すべて選択|全て選択/ }).first().click().catch(() => {}); await page.waitForTimeout(200); } await go.click(); } };
  if (ipad) {
    ok(await page.evaluate(() => window.__tsuPdfJobHost === true), `[${tag}] 画面の中の小窓の受け口がある`);
    await dl(); await page.waitForTimeout(600);
    const busy = await page.getByTestId('pdf-job').innerText().catch(() => '');
    ok(/PDFを作成しています/.test(busy), `[${tag}] 作成中は画面の中の小窓に出る: ${busy.replace(/\s+/g, ' ').slice(0, 60)}`);
    ok(popups === 0, `[${tag}] 別タブを開かない(作成中) popups=${popups}`);
    await page.getByTestId('pdf-share').waitFor({ timeout: 8000 });
    const ready = await page.getByTestId('pdf-job').innerText();
    ok(/PDFができました/.test(ready) && /共有・印刷/.test(ready) && /新しいタブで開く/.test(ready), `[${tag}] できたら「PDFができました」+ 共有・印刷 / 新しいタブで開く`);
    ok(popups === 0 && pdfCalls === 1, `[${tag}] 別タブなし・PDF の作成は1回 popups=${popups} calls=${pdfCalls}`);
    ok(!(await page.getByTestId('cb-pdf').isDisabled()), `[${tag}] ダウンロードのボタンは作成中のままにならない`);
    await page.getByTestId('pdf-share').click(); await page.waitForTimeout(300);
    const sc = await page.evaluate(() => window.__shareCalls);
    ok(sc.length === 1 && sc[0].length === 1 && sc[0][0].type === 'application/pdf' && sc[0][0].size > 50, `[${tag}] 共有・印刷で PDF 付きの共有メニュー ${JSON.stringify(sc)}`);
    ok((await page.getByTestId('pdf-job').count()) === 0, `[${tag}] 共有のあと小窓は閉じる`);
    // 2回目(ホーム画面のアプリで2回目から開けない、の再発なし) → 新しいタブで開く
    await page.locator('button', { hasText: /^閉じる$|^OK$|^わかりました$/ }).first().click({ timeout: 400 }).catch(() => {});
    await dl(); await page.getByTestId('pdf-open').waitFor({ timeout: 8000 });
    ok(pdfCalls === 2 && popups === 0, `[${tag}] 2回目も小窓で出る calls=${pdfCalls} popups=${popups}`);
    await page.getByTestId('pdf-open').click(); await page.waitForTimeout(500);
    ok(popups === 1, `[${tag}] 「新しいタブで開く」は押したときだけ別タブ popups=${popups}`);
    // 失敗したとき: 小窓は消えて、案内が出る(止まったままにならない)
    await page.locator('button', { hasText: /^閉じる$|^OK$|^わかりました$/ }).first().click({ timeout: 400 }).catch(() => {});
    fail = true; delay = 300; dialogs.length = 0; await dl(); await page.waitForTimeout(1500);
    ok(dialogs.some(x => /PDFの作成に失敗しました/.test(x)) && (await page.getByTestId('pdf-job').count()) === 0 && !(await page.getByTestId('cb-pdf').isDisabled()), `[${tag}] 失敗したら小窓は消えて案内が出る ${JSON.stringify(dialogs).slice(0, 80)}`);
  } else {
    const [d] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), dl()]);
    ok(/\.pdf$/.test(d.suggestedFilename()) && popups === 0, `[${tag}] PC は今までどおりファイルのダウンロード ${d.suggestedFilename()}`);
    ok((await page.getByTestId('pdf-job').count()) === 0, `[${tag}] PC は小窓を出さない`);
  }
  await ctx.close();
};
await run(true); await run(false);
await b.close(); console.log(fails ? `FAILS ${fails}` : 'ALL PASS'); process.exit(fails ? 1 : 0);
