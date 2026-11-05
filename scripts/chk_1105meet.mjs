// 2026-11-05 trial523: 担当者会議 — 入力画面と小窓で同じ欄・開催日/時間/場所を1つの枠に横並び・検討した項目が枠からはみ出さない
//   終了は変更があれば「保存せずに終了／保存して終了／戻る」・「小窓」に切り替えても保存しない・小窓の帯は「全画面／小窓」
//   負担割合証などの写真が読めないときは「写真を読み込めません」
//   実行: node scripts/chk_1105meet.mjs [port]
import { chromium, devices } from 'playwright';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
const b = await chromium.launch(); const all = {};
for (const [label, dev] of [['pc', { viewport: { width: 1366, height: 900 } }], ['phone', devices['iPhone 13']]]) {
  const r = {};
  const ctx = await b.newContext({ ...dev, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage();
  page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
  const pid = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const p = d.patients.find(x => x.status === '利用中');
    p.personalFile = { ...(p.personalFile || {}), meetings: [] }; p.docBurden = [{ id: 'b1', name: 'image.jpg', type: 'image/jpeg', data: 'data:image/jpeg;base64,AAAA', uploadedAt: '2026年8月4日' }];
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); Object.keys(localStorage).filter(k => k.startsWith('tsumugi_meet_draft')).forEach(k => localStorage.removeItem(k)); sessionStorage.removeItem('tsumugi_resume_meeting_float');
    sessionStorage.setItem('tsumugiReopenPF', JSON.stringify({ patientId: p.id, tab: 'cat_3' })); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'master', pid: p.id, t: Date.now() })); return p.id; });
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
  const M = page.locator('[data-testid="personal-file-modal"]');
  if (!(await M.count())) { await page.locator('button', { hasText: '個人ファイル' }).first().click(); await page.waitForTimeout(800); }
  const nMeet = () => page.evaluate((pid) => (JSON.parse(localStorage.getItem('daycareAppData_v3')).patients.find(p => p.id === pid).personalFile.meetings || []).length, pid);
  const openPF = async (tab) => { await page.evaluate(([pid, tab]) => { sessionStorage.setItem('tsumugiReopenPF', JSON.stringify(tab ? { patientId: pid, tab } : { patientId: pid })); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'master', pid, t: Date.now() })); }, [pid, tab]); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2200); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {}); };
  const openNew = async () => { if (!(await M.count())) await openPF('cat_3'); await page.locator('[data-testid="personal-file-modal"] button:visible', { hasText: /ケアプラン・担当者会議/ }).first().click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(300); await page.locator('button', { hasText: '+ 新規作成' }).first().click(); await page.waitForTimeout(500); };
  await openNew();
  const body = page.getByTestId('meet-form-body');
  r.form_open = await body.count() === 1;
  r.btn_komado = await page.locator('button', { hasText: /^小窓$/ }).count() >= 1 && await page.locator('button', { hasText: '小窓にする' }).count() === 0;
  // 開催日・時間・場所は1つの枠。PC は1行(上端がそろう)・スマホは日付と時間が1行
  const geo = await page.evaluate(() => { const w = document.querySelector('[data-testid="meet-when"]'); if (!w) return null; const kids = [...w.children].map(c => c.getBoundingClientRect()); const ta = document.querySelector('[data-testid="meet-content"]').getBoundingClientRect(); const cc = document.querySelector('[data-testid="meet-content-card"]').getBoundingClientRect();
    return { tops: kids.map(k => Math.round(k.top)), inDate: !!w.querySelector('input[type=date]'), nTime: w.querySelectorAll('input[type=time]').length, taIn: ta.top >= cc.top - 1 && ta.bottom <= cc.bottom + 1 && ta.left >= cc.left - 1 && ta.right <= cc.right + 1, sw: document.documentElement.scrollWidth <= window.innerWidth + 1 }; });
  r.when_one_card = !!geo && geo.inDate && geo.nTime === 2;
  r.when_row = !!geo && (label === 'pc' ? new Set(geo.tops).size === 1 : geo.tops[0] === geo.tops[1]);
  r.content_in_card = !!geo && geo.taIn; r.no_hscroll = !!geo && geo.sw;
  await page.screenshot({ path: `/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad/shots/meet_form_${label}.png` });
  // 終了: 変更あり → 確かめ → 戻る → 保存せずに終了(記録は増えない)
  await page.getByTestId('meet-content').fill('テストの内容'); await page.locator('button', { hasText: /^終了$/ }).first().click(); await page.waitForTimeout(300);
  r.ask_shown = await page.getByTestId('meet-close-ask').count() === 1;
  await page.getByTestId('meet-close-back').click(); await page.waitForTimeout(200); r.back_keeps = await body.count() === 1 && await page.getByTestId('meet-content').inputValue() === 'テストの内容';
  await page.locator('button', { hasText: /^終了$/ }).first().click(); await page.waitForTimeout(200); await page.getByTestId('meet-close-discard').click(); await page.waitForTimeout(400);
  r.discard_closed = await body.count() === 0 && await nMeet() === 0;
  // 変更なしの終了は確かめなしで閉じる
  await openNew(); await page.locator('button', { hasText: /^終了$/ }).first().click(); await page.waitForTimeout(300); r.noask_when_clean = await page.getByTestId('meet-close-ask').count() === 0 && await body.count() === 0;
  // 小窓へ: 保存しない → 小窓の終了(保存せず) → 記録は増えない
  await openNew(); await page.getByTestId('meet-content').fill('小窓へ引き継ぐ内容'); await page.getByTestId('meet-to-float').click(); await page.waitForTimeout(700);
  const fl = page.getByTestId('meeting-float');
  r.float_open = await fl.count() === 1; r.float_not_saved = await nMeet() === 0;
  r.float_same_fields = await fl.locator('[data-testid="meet-when"]').count() === 1 && await fl.getByTestId('meet-content').inputValue() === '小窓へ引き継ぐ内容';
  await page.getByTestId('meeting-float-close').click(); await page.waitForTimeout(300); r.float_ask = await page.getByTestId('meet-close-ask').count() === 1;
  await page.getByTestId('meet-close-discard').click(); await page.waitForTimeout(400); r.float_discarded = await fl.count() === 0 && await nMeet() === 0;
  // 小窓で保存 → 記録が1件(場所も入る)。帯は 全画面 → 小窓
  await openNew(); await page.getByTestId('meet-content').fill('保存する内容'); await page.getByTestId('meet-to-float').click(); await page.waitForTimeout(700);
  await fl.locator('button', { hasText: '全画面' }).click(); await page.waitForTimeout(300);
  r.full_label = await fl.locator('button', { hasText: /^小窓$/ }).count() === 1 && await fl.locator('button', { hasText: '元の大きさ' }).count() === 0;
  await page.screenshot({ path: `/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad/shots/meet_floatfull_${label}.png` });
  await fl.locator('button', { hasText: /^保存$/ }).click(); await page.waitForTimeout(500);
  const saved = await page.evaluate((pid) => (JSON.parse(localStorage.getItem('daycareAppData_v3')).patients.find(p => p.id === pid).personalFile.meetings || [])[0] || null, pid);
  r.float_saved = !!saved && saved.content === '保存する内容' && saved.location === '事業所' && !!saved.dateLabel;
  await page.getByTestId('meeting-float-close').click(); await page.waitForTimeout(300); r.close_after_save = await fl.count() === 0 && await nMeet() === 1;
  // 写真が読めないとき(基本情報の負担割合証)
  await openPF(null); await page.getByTestId('personal-file-modal').getByText('基本情報', { exact: true }).locator('visible=true').first().click({ timeout: 3000 }).catch(e => console.log('tab', e.message.slice(0, 80))); await page.waitForTimeout(800);
  r.img_missing_shown = await page.getByTestId('stored-image-missing').count() >= 1;
  if (!r.img_missing_shown) await page.screenshot({ path: `/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad/shots/meet_img_${label}.png` });
  all[label] = r; console.log(label, r);
  await ctx.close();
}
await b.close();
const ok = Object.values(all).every(r => Object.values(r).every(Boolean)); console.log(ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
