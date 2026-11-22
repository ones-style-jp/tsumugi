// 2026-11-22 trial610 の検査(見本データ VITE_E2E_DEMO=1 のビルド・:4175)
//   A version.json: 組み立てで作られ、版が update-notes.json と同じ・minVersion/notesSig を持つ
//   B 束(JS)に更新内容の本文が焼き込まれていない(古いお知らせの題名が束の中に無い)・版の番号は焼き込まれている
//   C 定期確認が update-notes.json(本体)を何度も読まない: 起動後 12 秒で本体の取得は 1 回以下、version.json は 2 回以上(起動時+5秒後の確認)
//   D 計画書の作成予定(通所介護計画書)が 要介護／要支援 の見出しで区切られる(見本に両方いれば両方・少なくとも1つ)
//   実行: node chk/chk_1122trial610.mjs [port]   (dist は buildenv2/dist)
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
const DIST = process.env.DIST || path.resolve(process.cwd(), 'dist');
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
// ---- A
{
  const vj = JSON.parse(fs.readFileSync(path.join(DIST, 'version.json'), 'utf8'));
  const un = JSON.parse(fs.readFileSync(path.join(DIST, 'update-notes.json'), 'utf8'));
  ok(vj.version && vj.version === un.version, `A1 version.json の版 = update-notes.json の版 (${vj.version})`);
  ok('minVersion' in vj && typeof vj.notesSig === 'string' && vj.notesSig.length >= 8, `A2 minVersion/notesSig がある (min=${JSON.stringify(vj.minVersion)} sig=${vj.notesSig})`);
  ok(fs.statSync(path.join(DIST, 'version.json')).size < 2000 && fs.statSync(path.join(DIST, 'update-notes.json')).size > 100000, 'A3 version.json は小さい(2KB 未満)・本体は大きい');
  // ---- B
  const js = fs.readdirSync(path.join(DIST, 'assets')).filter(f => /^index-.*\.js$/.test(f)).map(f => fs.readFileSync(path.join(DIST, 'assets', f), 'utf8')).join('\n');
  const oldNote = (un.notes || []).slice(-1)[0]; // いちばん古いお知らせ
  const probe = String((oldNote && (oldNote.title || oldNote.body)) || '').slice(0, 24);
  ok(probe && !js.includes(probe), `B1 束に古いお知らせの本文が無い(焼き込みをやめた): 「${probe}」`);
  ok(js.includes(JSON.stringify(vj.version).slice(1, -1)), `B2 束に版の番号が焼き込まれている (${vj.version})`);
  const n = (js.match(/upd-2026-\d{4}[a-z]?/g) || []).length;
  ok(n < 20, `B3 束の中の upd-2026-… の数 ${n}(以前は 1000 超)`);
}
const b = await chromium.launch();
// ---- C
{
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
  const page = await ctx.newPage(); page.on('dialog', d => d.accept());
  let full = 0, small = 0;
  page.on('request', r => { const u = r.url(); if (/\/update-notes\.json/.test(u)) full++; if (/\/version\.json/.test(u)) small++; });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  // 起動 5 秒後の確認(version.json)まで実時間で待つ(起動時の読み込み 1 回 + 5 秒後の確認 1 回 = 2 回以上)
  await page.waitForTimeout(12 * 1000);
  ok(full <= 1, `C1 起動後 12 秒で update-notes.json(本体)の取得は ${full} 回(1回以下)`);
  ok(small >= 2, `C2 version.json の取得は ${small} 回(2回以上)`);
  await ctx.close();
}
// ---- D
{
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
  const page = await ctx.newPage(); page.on('dialog', d => d.accept());
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  await page.evaluate(() => { localStorage.setItem('tsumugiSidebarOpen', '0'); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'keikaku_yotei', pid: null, t: Date.now() })); });
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
  await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
  // 「直近」に無ければ月を順に押して、通所介護計画書の行がある月を探す
  let found = 0;
  for (const m of [null, ...Array.from({ length: 12 }, (_, i) => i + 1)]) {
    if (m) { const btn = page.locator('button:visible', { hasText: new RegExp(`^${m}月$`) }).first(); if (!(await btn.count())) continue; await btn.click(); await page.waitForTimeout(400); }
    found = await page.locator('[data-testid^="yotei-group-"]').count();
    if (found) { console.log('   月:', m || '直近', '見出し:', await page.locator('[data-testid^="yotei-group-"]').allInnerTexts()); break; }
  }
  const anyRows = await page.getByText('通所介護計画書', { exact: false }).count();
  ok(found >= 1 || anyRows === 0, `D1 通所介護計画書の作成予定に 要介護／要支援 の見出し(${found}件)`);
  if (found) {
    const t = (await page.locator('[data-testid^="yotei-group-"]').allInnerTexts()).join(' / ');
    ok(/要介護|要支援/.test(t) && /計画書/.test(t), `D2 見出しに区分と計画書の名前 → ${t.slice(0, 80)}`);
  }
  await ctx.close();
}
await b.close();
console.log(fails ? `FAIL ${fails}` : 'ALL PASS');
process.exit(fails ? 1 : 0);
