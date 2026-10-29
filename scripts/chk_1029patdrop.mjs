// 2026-10-29 ユーザー報告「スマホとタブレットの縦でサービス提供記録を開き、下まで行って利用者の名前を押すと、一瞬プルダウンが出てすぐ消え、画面が固まる(キーボードを戻すと動く)」
//   原因: 外側を押したら閉じる透明の幕が「小窓」とみなされ、後ろの画面を止める仕組み(html.tsu-back-lock)が働く → スマホでは上の帯(sticky)が固定されなくなり、
//   下まで送っていると帯と一覧が画面の外へ消える。開いたときに検索欄へ自動で入る(キーボードが出る)
//   ①スマホ(390×844)・②タブレットの縦(810×1080): 下まで送ってから名前を押す → 一覧が画面の中に見えている・後ろの画面を止めていない・検索欄に自動で入らない・検索欄は16px
//   ③一覧から別の方を選ぶと切り替わる ④パソコン(Chromium)は今までどおり検索欄に自動で入る
//   実行: node scripts/chk_1029patdrop.mjs [--port 4175] [--base 4173]
import { webkit, chromium } from 'playwright';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const PORT = arg('--port', '4175'), BASE = arg('--base', '');
const IPH = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
const r = {};
const run = async (port, eng, vp, opts) => {
  const b = await eng.launch(); const ctx = await b.newContext({ viewport: vp, screen: vp, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', ...opts }); const page = await ctx.newPage(); page.on('dialog', d => d.accept());
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  const pid = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const p = d.patients.find(x => x.status === '利用中' && !x.endDate); localStorage.setItem('tsumugiSidebarOpen', '0');
    sessionStorage.setItem('tsumugiActiveRecorder', JSON.stringify({ id: 'demo_rec', name: '見本 職員', roleLabel: '介護職員' })); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'ticket', pid: p.id, t: Date.now() })); return p.id; });
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 500 }).catch(() => {});
  const btn = page.locator('.thp button', { has: page.locator('svg.lucide-chevron-down') }).first();
  const okView = await btn.count() > 0;
  // 下まで送る(スマホはページ全体・タブレットは中の枠)
  await page.evaluate(() => { window.scrollTo(0, document.documentElement.scrollHeight); document.querySelectorAll('.overflow-auto, .overflow-y-auto').forEach(el => { if (el.scrollHeight > el.clientHeight + 50) el.scrollTop = el.scrollHeight; }); });
  await page.waitForTimeout(600);
  const before = await btn.boundingBox().catch(() => null);
  if (opts.hasTouch) await btn.tap(); else await btn.click();
  await page.waitForTimeout(900); // 後ろを止める仕組みは0.12秒・0.48秒あとに見直す
  const st = await page.evaluate(() => { const inp = [...document.querySelectorAll('.thp input[placeholder="氏名で検索..."]')][0]; const pop = inp && inp.closest('div[style*="absolute"]');
    const rc = pop ? pop.getBoundingClientRect() : null;
    return { lock: document.documentElement.classList.contains('tsu-back-lock'), focused: !!inp && document.activeElement === inp, fs: inp ? getComputedStyle(inp).fontSize : null,
      popTop: rc ? Math.round(rc.top) : null, popBottom: rc ? Math.round(rc.bottom) : null, vh: window.innerHeight, opts: pop ? pop.querySelectorAll('button').length : 0 }; });
  // 別の方を選ぶ
  let switched = null;
  if (st.opts > 1) { const cur = (await btn.innerText()).trim(); const other = page.locator('.thp div[style*="absolute"] button').filter({ hasNotText: cur }).nth(1); const nm = (await other.innerText()).split('\n')[0].trim();
    if (opts.hasTouch) await other.tap(); else await other.click(); await page.waitForTimeout(700); switched = (await btn.innerText()).trim().startsWith(nm); }
  await b.close();
  return { okView, before: before ? Math.round(before.y) : null, ...st, switched }; };
const cases = [['スマホ', webkit, { width: 390, height: 844 }, { userAgent: IPH, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }],
  ['タブレットの縦', webkit, { width: 810, height: 1080 }, { userAgent: IPAD, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }],
  ['パソコン', chromium, { width: 1366, height: 900 }, {}]];
for (const [lab, eng, vp, opts] of cases) {
  const now = await run(PORT, eng, vp, opts); let line = `${lab} 直した後 ${JSON.stringify(now)}`;
  const inView = now.popTop != null && now.popTop >= 0 && now.popTop < now.vh - 80;
  r[`${lab}_view`] = now.okView; r[`${lab}_inView`] = inView; r[`${lab}_switch`] = now.switched === true;
  if (lab === 'パソコン') r[`${lab}_focus`] = now.focused === true; else { r[`${lab}_noLock`] = !now.lock; r[`${lab}_noFocus`] = !now.focused; r[`${lab}_16px`] = now.fs === '16px'; }
  if (BASE) { const old = await run(BASE, eng, vp, opts); line += `\n   直す前 ${JSON.stringify(old)}`; }
  console.log(line);
}
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
