// 2026-11-02 全画面の自動点検(見本ビルド): サイドバーの全項目を PC/iPad/スマホで開き、ページのエラー・コンソールのエラー・横はみ出し・空表示を記録し、画面写真を残す
//   実行: node audit_views.mjs [--port 4175] [--out DIR]
import { chromium } from 'playwright'; import fs from 'node:fs'; import path from 'node:path';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const PORT = arg('--port', '4175'); const OUT = arg('--out', '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad/chkrun/shots'); fs.mkdirSync(OUT, { recursive: true });
const VIEWPORTS = [['pc', 1366, 900], ['ipad', 1024, 768], ['phone', 390, 844]];
const b = await chromium.launch(); const results = [];
for (const [name, w, h] of VIEWPORTS) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', isMobile: name === 'phone', hasTouch: name !== 'pc' }); const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push('PAGEERROR ' + e.message.slice(0, 140))); page.on('console', m => { if (m.type() === 'error') { const t = m.text(); if (!/favicon|manifest|net::ERR|Failed to load resource|supabase|fetch/i.test(t)) errs.push('console ' + t.slice(0, 140)); } }); page.on('dialog', d => d.dismiss().catch(() => {}));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  await page.evaluate(() => { localStorage.setItem('tsumugiSidebarOpen', '1'); sessionStorage.setItem('tsumugiActiveRecorder', JSON.stringify({ id: 'demo_rec', name: '見本 職員', roleLabel: '管理者' })); });
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  // サイドバーの項目を集める(開閉のある親は開く)
  const openMenu = async () => { if (name === 'phone' || name === 'ipad') { const h = page.locator('button[aria-label*="メニュー"], button:has-text("☰"), [data-testid="hamburger"]').first(); if (await h.count()) { await h.click().catch(() => {}); await page.waitForTimeout(400); } } };
  await openMenu();
  // ★ 2026-11-04: サイドバーは nav/aside ではないので、「各種設定」のボタンを含み「ホーム」のボタンも含む一番内側の div を探す
  const side = page.locator('button', { hasText: /^各種設定/ }).first().locator('xpath=ancestor::div[.//button[contains(., "ホーム")]][1]');
  const names = await side.locator('button').allInnerTexts().catch(() => []);
  const items = [...new Set(names.map(t => t.replace(/\s+/g, ' ').replace(/\d+$/, '').trim()).filter(t => t && t.length <= 16 && !/ログアウト|スタッフ切替|全画面|変更ログ/.test(t)))];
  console.log(`[${name}] サイドバー項目 ${items.length}:`, items.join(' / '));
  for (const label of items) {
    errs.length = 0;
    await openMenu();
    const btn = side.locator('button', { hasText: new RegExp('^' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\d*$') }).first();
    if (!(await btn.count())) { results.push({ vp: name, label, skipped: true }); continue; }
    try { await btn.click({ timeout: 4000 }); } catch { results.push({ vp: name, label, skipped: 'click' }); continue; }
    await page.waitForTimeout(1500);
    // 親項目(計画書・連絡(FAX)・分析)は子が開く → 子も押す
    const sub = await side.locator('button').allInnerTexts().catch(() => []);
    const after = [...new Set(sub.map(t => t.replace(/\s+/g, ' ').replace(/\d+$/, '').trim()).filter(t => t && !items.includes(t) && t.length <= 18 && !/ログアウト|スタッフ切替/.test(t)))];
    const targets = after.length ? after : [null];
    for (const child of targets) {
      if (child) { errs.length = 0; await openMenu(); const cb = side.locator('button', { hasText: new RegExp('^' + child.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\d*$') }).first(); try { await cb.click({ timeout: 4000 }); } catch { continue; } await page.waitForTimeout(1500); }
      const m = await page.evaluate(() => { const de = document.documentElement; const main = document.getElementById('appMainArea') || document.body; return { sw: de.scrollWidth, iw: window.innerWidth, text: (main.innerText || '').length, title: (document.querySelector('header h1, header .title, header')?.innerText || '').slice(0, 40).replace(/\n/g, ' ') }; });
      const key = `${name}_${(child || label).replace(/[\/\s（）()・]/g, '_')}`;
      await page.screenshot({ path: path.join(OUT, key + '.png'), fullPage: false }).catch(() => {});
      results.push({ vp: name, label: child ? `${label} > ${child}` : label, overflow: m.sw > m.iw + 2 ? m.sw - m.iw : 0, textLen: m.text, errs: errs.slice(0, 3), shot: key + '.png' });
      const flag = (m.sw > m.iw + 2 ? ' 横はみ出し+' + (m.sw - m.iw) : '') + (errs.length ? ' ERR:' + errs[0] : '') + (m.text < 40 ? ' 空?' : '');
      console.log(`  ${name} ${child ? label + ' > ' + child : label}${flag}`);
    }
  }
  await ctx.close();
}
await b.close();
fs.writeFileSync(path.join(OUT, '..', 'audit_views.json'), JSON.stringify(results, null, 1));
const bad = results.filter(r => r.overflow || (r.errs && r.errs.length) || (r.textLen != null && r.textLen < 40));
console.log('\n=== 要確認', bad.length, '/', results.length); bad.forEach(r => console.log(' ', r.vp, r.label, r.overflow ? `横はみ出し+${r.overflow}` : '', r.errs && r.errs[0] ? r.errs[0] : '', r.textLen < 40 ? '空?' : ''));
