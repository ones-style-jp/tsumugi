// 2026-11-25 trial639: ①ケアマネ担当者の編集は姓・名の2欄 ②担当者の改名が利用者の変更履歴にも反映 ③履歴の編集小窓は事業所・担当者がプルダウン・日付欄の高さ
//   使い方: node chk/chk_1125cmhist.mjs 4175
import { chromium, devices } from 'playwright';
const PORT = process.argv[2] || '4175'; const BASE = `http://localhost:${PORT}`;
const b = await chromium.launch(); const R = []; const ok = (n, c, d) => { R.push([n, !!c]); console.log((c ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? ' ' + JSON.stringify(d) : '')); };
const boot = async (ctx, view, pid) => { const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  const ids = await page.evaluate(([view, pid]) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const A = d.patients.filter(p => p.status === '利用中')[0];
    d.systemSettings = d.systemSettings || {}; d.systemSettings.cmOffices = [{ name: 'さくら居宅', kana: 'サクラキョタク', phone: '03-0000-0002' }, { name: '中央ケアプラン', kana: 'チュウオウケアプラン', phone: '03-0000-0003' }];
    d.systemSettings.careManagers = [{ office: 'さくら居宅', name: '齋藤', kana: 'サイトウ', kanaLast: 'サイトウ', kanaFirst: '' }, { office: '中央ケアプラン', name: '阿佐田 実', kana: 'アサダ ミノル', kanaLast: 'アサダ', kanaFirst: 'ミノル' }];
    A.cmOffice = 'さくら居宅'; A.cmName = '齋藤'; A.cmHistory = [{ office: '中央ケアプラン', name: '阿佐田 実', from: '2026-01-01', to: '2026-03-31', note: '' }, { office: 'さくら居宅', name: '齋藤', from: '2026-04-01', to: null, note: '' }];
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view, pid: pid === 'A' ? A.id : null, t: Date.now() })); return { A: A.id }; }, [view, pid]);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2200); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {}); return { page, ids }; };

// ===== ① ② ケアマネ事業所・担当者 → 編集 =====
{ const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const { page, ids } = await boot(ctx, 'cmmaster', null);
  // 担当者「齋藤」の行の鉛筆(title=編集)
  const idx = await page.evaluate(() => { const bs = [...document.querySelectorAll('button[title="編集"]')].filter(b => b.offsetParent); return bs.findIndex(b => { let e = b; for (let i = 0; i < 5 && e; i++, e = e.parentElement) { const t = (e.innerText || '').replace(/\s+/g, ' '); if (t.length > 80) return false; if (/齋藤/.test(t) && !/阿佐田/.test(t)) return true; } return false; }); });
  ok('0 担当者の行に編集ボタン', idx >= 0, idx); await page.locator('button[title="編集"]:visible').nth(Math.max(idx, 0)).click(); await page.waitForTimeout(600);
  ok('1 担当者の編集に 姓・名 の2欄', await page.getByTestId('cm-edit-sei').count() === 1 && await page.getByTestId('cm-edit-mei').count() === 1);
  ok('2 既存の「齋藤」は姓に入り、名は空', (await page.getByTestId('cm-edit-sei').inputValue()) === '齋藤' && (await page.getByTestId('cm-edit-mei').inputValue()) === '');
  await page.getByTestId('cm-edit-mei').fill(' 花子 '); await page.getByTestId('cm-edit-mei').press('Tab'); await page.waitForTimeout(300);
  ok('3 名に入れた前後の空白は残らない', (await page.getByTestId('cm-edit-mei').inputValue()) === '花子');
  await page.locator('button:visible', { hasText: /^(保存|更新|保存する)$/ }).last().click(); await page.waitForTimeout(1200);
  const after = await page.evaluate((pid) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const c = (d.systemSettings.careManagers || []).find(x => x.office === 'さくら居宅'); const p = d.patients.find(x => x.id === pid); return { cm: c && c.name, pcm: p.cmName, hist: (p.cmHistory || []).map(h => h.name) }; }, ids.A);
  ok('4 名簿は「齋藤 花子」(半角1つ)', after.cm === '齋藤 花子', after.cm);
  ok('5 利用者の担当ケアマネも「齋藤 花子」', after.pcm === '齋藤 花子', after.pcm);
  ok('6 ケアマネ変更履歴の行も「齋藤 花子」に(前の担当者の行は変わらない)', JSON.stringify(after.hist) === JSON.stringify(['阿佐田 実', '齋藤 花子']), after.hist);
  await ctx.close(); }

// ===== ③ 変更履歴の編集小窓(スマホ) =====
{ const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const { page } = await boot(ctx, 'master', 'A');
  await page.locator('button:visible', { hasText: /変更履歴/ }).first().click(); await page.waitForTimeout(700);
  const sec = page.locator('div', { hasText: /^ケアマネ 変更履歴/ }).last();
  const target = (await page.getByTestId('hist-edit-cm-1').count()) ? page.getByTestId('hist-edit-cm-1') : ((await page.locator('[data-testid^="hist-edit-cm-"]').count()) ? page.locator('[data-testid^="hist-edit-cm-"]').first() : null);
  ok('7 ケアマネ変更履歴の編集ボタンがある', !!target);
  if (target) { await target.click(); await page.waitForTimeout(600);
    ok('8 事業所はプルダウン', await page.getByTestId('hist-cm-office').count() === 1);
    ok('9 担当者はプルダウン(その事業所の人)', await page.getByTestId('hist-cm-name').count() === 1 && (await page.getByTestId('hist-cm-name').locator('option').allInnerTexts()).some(t => /阿佐田 実|齋藤/.test(t)));
    const h = await page.getByTestId('hist-to').evaluate(e => e.getBoundingClientRect()); ok('10 終了日の欄が細くならない(高さ 40 以上・幅 200 以上)', h.height >= 40 && h.width >= 200, { w: Math.round(h.width), h: Math.round(h.height) });
    await page.getByTestId('hist-cm-office').click(); await page.waitForTimeout(300); await page.locator('[data-testid="hist-cm-office-opt"][data-value="さくら居宅"]').click(); await page.waitForTimeout(300); // ★ trial654: 事業所は検索つきの選ぶ欄
    ok('11 事業所を変えると担当者はその事業所の人だけ', !(await page.getByTestId('hist-cm-name').locator('option').allInnerTexts()).some(t => /阿佐田 実/.test(t)));
  }
  await ctx.close(); }
await b.close();
const bad = R.filter(x => !x[1]); console.log(bad.length ? `FAIL ${bad.length}: ${bad.map(x => x[0]).join(' / ')}` : 'ALL PASS'); process.exit(bad.length ? 1 : 0);
