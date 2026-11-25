// 2026-11-25 1125c: 検索のカナ1文字は頭文字だけに一致(ケアマネ事業所・担当者で「サ」→ 名前のどこかに サ がある事業所・担当者が出ていた)
//   使い方: node chk/chk_1125search.mjs 4173
import { chromium } from 'playwright';
const PORT = process.argv[2] || '4173'; const BASE = `http://localhost:${PORT}`;
const b = await chromium.launch(); const R = []; const ok = (n, c, d) => { R.push([n, !!c]); console.log((c ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? ' ' + JSON.stringify(d) : '')); };
const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.systemSettings = d.systemSettings || {};
  d.systemSettings.cmOffices = [ { name: '東京介護サービス居宅', kana: 'トウキョウカイゴサービスキョタク', corporateName: '株式会社サンプル', phone: '03-0000-0001' }, { name: 'さくら居宅', kana: 'サクラキョタク', corporateName: '', phone: '03-0000-0002' }, { name: '中央ケアプラン', kana: 'チュウオウケアプラン', corporateName: '', phone: '03-0000-0003' } ];
  d.systemSettings.careManagers = [ { office: '東京介護サービス居宅', name: '田中 一郎', kana: 'タナカ イチロウ' }, { office: 'さくら居宅', name: '佐藤 花子', kana: 'サトウ ハナコ' }, { office: '中央ケアプラン', name: '阿佐田 実', kana: 'アサダ ミノル' } ];
  // 利用者の名前検索も(姓・名の頭文字)
  const ps = d.patients.filter(p => p.status === '利用中').slice(0, 3); ps[0].name = '佐藤 太郎'; ps[0].kana = 'サトウ タロウ'; ps[1].name = '浅田 花'; ps[1].kana = 'アサダ ハナ'; ps[2].name = '田中 実'; ps[2].kana = 'タナカ ミノル';
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'cmmaster', pid: null, t: Date.now() })); });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
const inputs = page.locator('input[name="tsu-q"]:visible'); ok('1 ケアマネ事業所・担当者に検索欄が2つ', await inputs.count() >= 2, await inputs.count());
const offIn = inputs.nth(0), mgrIn = inputs.nth(1);
const body = async () => (await page.locator('main, #tsuContentScroller, body').first().innerText());
await offIn.fill('サ'); await page.waitForTimeout(500); let t = await body();
ok('2 事業所の検索「サ」: さくら居宅 は出る', /さくら居宅/.test(t));
ok('3 事業所の検索「サ」: 東京介護サービス居宅(途中の サ)は出ない', !/東京介護サービス居宅/.test(t));
ok('4 事業所の検索「サ」: 担当者も さくら居宅 の人だけ(田中は出ない)', /佐藤 花子/.test(t) && !/田中 一郎/.test(t));
await offIn.fill('サー'); await page.waitForTimeout(500); t = await body();
ok('5 2文字「サー」は部分一致(東京介護サービス居宅 が出る)', /東京介護サービス居宅/.test(t));
await offIn.fill(''); await page.waitForTimeout(300); await mgrIn.fill('さ'); await page.waitForTimeout(500); t = await body();
ok('6 担当者の検索「さ」(ひらがな): 佐藤 花子 だけ(阿佐田・田中は出ない)', /佐藤 花子/.test(t) && !/阿佐田 実/.test(t) && !/田中 一郎/.test(t));
await mgrIn.fill('サダ'); await page.waitForTimeout(500); t = await body();
ok('7 2文字「サダ」は途中でも一致(阿佐田 実)', /阿佐田 実/.test(t));
await mgrIn.fill('田'); await page.waitForTimeout(500); t = await body();
ok('8 漢字1文字「田」は今までどおり部分一致(田中・阿佐田)', /田中 一郎/.test(t) && /阿佐田 実/.test(t));
await mgrIn.fill(''); await page.waitForTimeout(300);
// 利用者マスタの名前検索
await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'master', pid: null, t: Date.now() }))); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
const q = page.locator('input[name="tsu-q"]:visible').first(); await q.fill('サ'); await page.waitForTimeout(600); t = await body();
ok('9 利用者の検索「サ」: 佐藤 太郎 は出る・浅田 花(アサダ)は出ない', /佐藤 太郎/.test(t) && !/浅田 花/.test(t));
await q.fill('ハ'); await page.waitForTimeout(600); t = await body();
ok('10 利用者の検索「ハ」: 名の頭文字(浅田 花=ハナ)でも出る', /浅田 花/.test(t));
await b.close();
const bad = R.filter(x => !x[1]); console.log(bad.length ? `FAIL ${bad.length}: ${bad.map(x => x[0]).join(' / ')}` : 'ALL PASS'); process.exit(bad.length ? 1 : 0);
