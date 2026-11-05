// 2026-11-05 trial523→524: 担当者会議記録 — 新規作成・編集も小窓(全画面)で開く(拡大・縮小・折りたたみ)・全画面は隙間なし
//   開催日/開催時間/場所は名前の右に入力・検討した項目が枠からはみ出さない・1枚に入る量を超えたら「新しいページを作りますか」→2枚目
//   終了は変更があれば「保存せずに終了／保存して終了／戻る」・新規は保存まで記録に入らない・帯の題名「担当者会議記録」・窓の操作はマーク
//   写真が読めないときは「写真を読み込めません」・利用者マスタ(スマホ)は名前の右にケアマネ・下の1行にボタン・利用開始日が見切れない
//   実行: node scripts/chk_1105meet.mjs [port]
import { chromium, devices } from 'playwright';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
const SHOT = '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad/shots';
const b = await chromium.launch(); const all = {};
for (const [label, dev] of [['pc', { viewport: { width: 1366, height: 900 } }], ['phone', devices['iPhone 13']], ['phonemax', { ...devices['iPhone 13'], viewport: { width: 440, height: 956 } }]]) {
  const r = {};
  const ctx = await b.newContext({ ...dev, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage();
  page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
  const pid = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const p = d.patients.find(x => x.status === '利用中');
    p.personalFile = { ...(p.personalFile || {}), meetings: [] }; p.docBurden = [{ id: 'b1', name: 'image.jpg', type: 'image/jpeg', data: 'data:image/jpeg;base64,AAAA', uploadedAt: '2026年8月4日' }];
    p.startDate = '2025-01-27'; p.cmOffice = p.cmOffice || '見本ケアプラン'; p.cmName = p.cmName || '見本 花子';
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); Object.keys(localStorage).filter(k => k.startsWith('tsumugi_meet_draft')).forEach(k => localStorage.removeItem(k)); sessionStorage.removeItem('tsumugi_resume_meeting_float'); return p.id; });
  const openPF = async (tab) => { await page.evaluate(([pid, tab]) => { sessionStorage.setItem('tsumugiReopenPF', JSON.stringify(tab ? { patientId: pid, tab } : { patientId: pid })); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'master', pid, t: Date.now() })); }, [pid, tab]); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2200); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {}); };
  const M = page.locator('[data-testid="personal-file-modal"]');
  const nMeet = () => page.evaluate((pid) => (JSON.parse(localStorage.getItem('daycareAppData_v3')).patients.find(p => p.id === pid).personalFile.meetings || []).length, pid);
  const fl = page.getByTestId('meeting-float');
  const openCM = async () => { if (!(await M.count())) await openPF('cat_3'); await page.locator('[data-testid="personal-file-modal"] button:visible', { hasText: /ケアプラン・担当者会議/ }).first().click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(300); };
  // 利用者マスタ(上の部分・利用開始日)
  await page.evaluate((pid) => { sessionStorage.removeItem('tsumugiReopenPF'); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'master', pid, t: Date.now() })); }, pid);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2200); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
  const mh = await page.evaluate(() => { const h = document.querySelector('[data-testid="master-head"]'); if (!h) return null; const cm = h.querySelector('[data-testid="master-head-cm"]'); const nm = h.querySelector('h2');
    const btns = [...h.querySelectorAll('.tsu-mhead-btns button')].filter(b => b.offsetParent).map(b => b.getBoundingClientRect());
    const yr = document.querySelector('input[aria-label="年"]'); const yOk = !!yr && yr.scrollWidth <= yr.clientWidth + 1;
    return { cmRight: cm && nm ? cm.getBoundingClientRect().left > nm.getBoundingClientRect().right - 2 && Math.abs(cm.getBoundingClientRect().top - nm.getBoundingClientRect().top) < 60 : null, btnOneRow: btns.length >= 3 && new Set(btns.map(x => Math.round(x.top))).size === 1, btnBelow: btns.length && nm ? btns[0].top > nm.getBoundingClientRect().bottom : false, yOk, sw: document.documentElement.scrollWidth <= window.innerWidth + 1 }; });
  if (label !== 'pc') { r.master_cm_right = !!mh && mh.cmRight === true; r.master_btn_row = !!mh && mh.btnOneRow && !!mh.btnBelow; }
  r.start_date_not_cut = !!mh && mh.yOk; r.master_no_hscroll = !!mh && mh.sw;
  await page.screenshot({ path: `${SHOT}/master_head_${label}.png` });
  // 新規作成 → 全画面の小窓(隙間なし)
  await openPF('cat_3'); await openCM(); await page.getByTestId('meet-new').click(); await page.waitForTimeout(600);
  r.new_is_float_full = await fl.count() === 1 && await fl.evaluate(el => { const q = el.getBoundingClientRect(); return q.left <= 0.5 && q.top <= 0.5 && Math.abs(q.right - window.innerWidth) <= 1 && Math.abs(q.bottom - window.innerHeight) <= 1; });
  r.title_ok = (await page.getByTestId('meeting-float-title').innerText()).trim() === '担当者会議記録' && await page.locator('text=担会メモ').count() === 0;
  r.icons = await page.getByTestId('meeting-float-min').locator('svg').count() === 1 && await page.getByTestId('meeting-float-size').locator('svg').count() === 1;
  // 開催日・時間・場所は名前の右
  const geo = await page.evaluate(() => { const g = (id) => { const w = document.querySelector(`[data-testid="${id}"]`); const lb = w.children[0].getBoundingClientRect(), ip = w.children[1].getBoundingClientRect(); return { right: ip.left >= lb.right - 1, same: Math.abs((ip.top + ip.bottom) / 2 - (lb.top + lb.bottom) / 2) < 14, top: Math.round(w.getBoundingClientRect().top) }; };
    const a = g('meet-when-date'), t = g('meet-when-time'), p = g('meet-when-place'); const ta = document.querySelector('[data-testid="meet-content"]').getBoundingClientRect(); const cc = document.querySelector('[data-testid="meet-content-card"]').getBoundingClientRect();
    return { inline: [a, t, p].every(x => x.right && x.same), oneRowPc: a.top === t.top && t.top === p.top, taIn: ta.top >= cc.top - 1 && ta.bottom <= cc.bottom + 1, sw: document.documentElement.scrollWidth <= window.innerWidth + 1 }; });
  r.when_inline = geo.inline; if (label === 'pc') r.when_one_row = geo.oneRowPc; r.content_in_card = geo.taIn; r.no_hscroll = geo.sw;
  await page.screenshot({ path: `${SHOT}/meet_new_${label}.png` });
  // 拡大・縮小・折りたたみ
  const fs0 = await page.getByTestId('meet-content').evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  await fl.locator('button', { hasText: /^拡大$/ }).click(); await page.waitForTimeout(200);
  r.zoom_full = (await page.getByTestId('meet-content').evaluate(el => parseFloat(getComputedStyle(el).fontSize))) > fs0;
  await fl.locator('button', { hasText: /^縮小$/ }).click(); await page.waitForTimeout(200);
  await page.getByTestId('meeting-float-min').click(); await page.waitForTimeout(200); r.fold = await fl.count() === 0 && await page.locator('button', { hasText: /担当者会議記録: .* 様（タップで開く）/ }).count() === 1;
  await page.locator('button', { hasText: /（タップで開く）/ }).click(); await page.waitForTimeout(300);
  // 文字数: 1枚に入る量を超えたら → 新しいページ
  const big = ('長い文の確認。'.repeat(9) + '\n').repeat(40);
  await page.getByTestId('meet-content').fill(big); await page.waitForTimeout(300);
  r.page_ask = await page.getByTestId('meet-page-ask').count() === 1;
  await page.getByTestId('meet-page-yes').click(); await page.waitForTimeout(300);
  const pg = await page.evaluate(() => ({ p1: document.querySelector('[data-testid="meet-content"]').value.length, p2: (document.querySelector('[data-testid="meet-content-1"]') || {}).value || '' }));
  r.page2_made = pg.p2.length > 0 && pg.p1 + pg.p2.length + 1 >= big.length - 2; r.room_shown = await page.getByTestId('meet-room-0').count() === 1;
  // 新規は保存まで記録に入らない → 開催日なしで保存は止まる → 日付を入れて保存
  r.not_saved_yet = await nMeet() === 0;
  await fl.locator('button', { hasText: /^保存$/ }).click(); await page.waitForTimeout(300); r.need_date = await nMeet() === 0;
  await page.getByTestId('meet-when-date').locator('input').fill('2026-11-05'); await page.waitForTimeout(200);
  await fl.locator('button', { hasText: /^保存$/ }).click(); await page.waitForTimeout(500);
  const saved = await page.evaluate((pid) => (JSON.parse(localStorage.getItem('daycareAppData_v3')).patients.find(p => p.id === pid).personalFile.meetings || [])[0] || null, pid);
  r.saved_pages = !!saved && (saved.contentMore || []).length === 1 && saved.location === '事業所';
  // 終了(変更なし)はそのまま閉じる
  await page.getByTestId('meeting-float-close').click(); await page.waitForTimeout(300); r.close_clean = await fl.count() === 0;
  // 印刷(ダウンロード)は2枚
  await openCM(); const pdfHtml = await page.evaluate(() => new Promise(res => { const h = (e) => { window.removeEventListener('setPrintHtml', h, true); res(e.detail && e.detail.html || ''); }; window.addEventListener('setPrintHtml', h, true); const bt = document.querySelector('[data-testid^="meeting-dl-"]'); bt ? bt.click() : res(''); setTimeout(() => res(''), 3000); }));
  r.print_2pages = (pdfHtml.match(/class="p-page"/g) || []).length === 2 && /2枚目/.test(pdfHtml);
  await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(300);
  // 編集 → 変更 → 終了 → 確かめ → 保存せずに終了
  await openPF('cat_3'); await openCM();
  await page.locator('[data-testid^="meet-edit-"]').first().click(); await page.waitForTimeout(600);
  r.edit_full = await fl.count() === 1 && await page.getByTestId('meet-content-1').count() === 1;
  await page.getByTestId('meet-content-1').fill('2枚目を直した'); await page.getByTestId('meeting-float-close').click(); await page.waitForTimeout(300);
  r.ask_close = await page.getByTestId('meet-close-ask').count() === 1; await page.getByTestId('meet-close-discard').click(); await page.waitForTimeout(300);
  r.discard_kept_old = await page.evaluate((pid) => { const m = JSON.parse(localStorage.getItem('daycareAppData_v3')).patients.find(p => p.id === pid).personalFile.meetings[0]; return m.contentMore[0] !== '2枚目を直した'; }, pid);
  // 写真が読めないとき(基本情報の負担割合証)
  await openPF(null); await page.getByTestId('personal-file-modal').getByText('基本情報', { exact: true }).locator('visible=true').first().click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(800);
  r.img_missing_shown = await page.getByTestId('stored-image-missing').count() >= 1;
  all[label] = r; console.log(label, r);
  await ctx.close();
}
await b.close();
const ok = Object.values(all).every(r => Object.values(r).every(Boolean)); console.log(ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
