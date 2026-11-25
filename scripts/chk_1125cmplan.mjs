// 2026-11-25 trial637: ケアマネの変更予定(変更履歴の先の日付)が 利用者マスタの担当ケアマネの欄・一覧の行・変更の小窓 に出る
//   使い方: node chk/chk_1125cmplan.mjs 4175
import { chromium } from 'playwright';
const PORT = process.argv[2] || '4175'; const BASE = `http://localhost:${PORT}`;
const b = await chromium.launch(); const R = []; const ok = (n, c, d) => { R.push([n, !!c]); console.log((c ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? ' ' + JSON.stringify(d) : '')); };
const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const ids = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const ps = d.patients.filter(p => p.status === '利用中'); const A = ps[0], B = ps[1];
  const t = new Date(); const nm = new Date(t.getFullYear(), t.getMonth() + 1, 1); const iso = `${nm.getFullYear()}-${String(nm.getMonth() + 1).padStart(2, '0')}-01`;
  d.systemSettings = d.systemSettings || {}; d.systemSettings.cmOffices = [{ name: 'さくら居宅', kana: 'サクラキョタク', phone: '03-0000-0002' }, { name: '中央ケアプラン', kana: 'チュウオウケアプラン', phone: '03-0000-0003' }];
  d.systemSettings.careManagers = [{ office: 'さくら居宅', name: '佐藤 花子', kana: 'サトウ ハナコ' }, { office: '中央ケアプラン', name: '阿佐田 実', kana: 'アサダ ミノル' }];
  A.cmOffice = 'さくら居宅'; A.cmName = '佐藤 花子'; A.cmHistory = [{ office: 'さくら居宅', name: '佐藤 花子', from: '2026-04-01', to: null, note: '' }, { office: '中央ケアプラン', name: '阿佐田 実', from: iso, to: null, note: '担当変更' }];
  B.cmOffice = 'さくら居宅'; B.cmName = '佐藤 花子'; B.cmHistory = [{ office: 'さくら居宅', name: '佐藤 花子', from: '2026-04-01', to: null, note: '' }];
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'master', pid: A.id, t: Date.now() })); return { A: A.id, B: B.id, iso, m: nm.getMonth() + 1 }; });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2200); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
ok('1 一覧の行に「CM変更予定 M/1〜」(予定のある方)', await page.getByTestId(`cm-planned-chip-${ids.A}`).count() === 1 && (await page.getByTestId(`cm-planned-chip-${ids.A}`).innerText()).includes(`${ids.m}/1`), await page.getByTestId(`cm-planned-chip-${ids.A}`).innerText().catch(() => ''));
ok('2 予定のない方の行には出ない', await page.getByTestId(`cm-planned-chip-${ids.B}`).count() === 0);
// A を開く(すでに pid=A で開いている想定。なければ行を押す)
if (await page.getByTestId('cm-planned-note').count() === 0) { await page.locator(`[data-testid="patient-row-${ids.A}"], button:has-text("CM変更予定")`).first().click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(800); }
const note = page.getByTestId('cm-planned-note'); ok('3 担当ケアマネジャーの欄に「ケアマネ変更予定: M/1〜 中央ケアプラン 阿佐田 実（担当変更）」', await note.count() === 1 && /中央ケアプラン 阿佐田 実/.test(await note.innerText()) && /担当変更/.test(await note.innerText()), (await note.innerText().catch(() => '')).slice(0, 60));
ok('4 今の担当はまだ 佐藤 花子 のまま', /佐藤 花子/.test(await page.locator('body').innerText()));
// 変更の小窓
const btn = page.locator('button', { hasText: /ケアマネ.*変更|変更.*ケアマネ|担当.*変更/ }).first(); await btn.click({ timeout: 5000 }); await page.waitForTimeout(600);
ok('5 変更の小窓に「すでに … の変更予定があります」', await page.getByTestId('cm-planned-modal-note').count() === 1 && /中央ケアプラン 阿佐田 実/.test(await page.getByTestId('cm-planned-modal-note').innerText()));
await page.locator('button', { hasText: /^キャンセル$/ }).last().click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(400);
await b.close();
const bad = R.filter(x => !x[1]); console.log(bad.length ? `FAIL ${bad.length}: ${bad.map(x => x[0]).join(' / ')}` : 'ALL PASS'); process.exit(bad.length ? 1 : 0);
