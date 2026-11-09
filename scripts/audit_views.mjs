// 2026-11-02 全画面の自動点検(見本ビルド): 画面の指定(tsumugi_resume_view)で全画面を PC/iPad/スマホで開き、エラー・横はみ出し・空表示を記録し、画面写真を残す
import { chromium } from 'playwright'; import fs from 'node:fs'; import path from 'node:path';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const PORT = arg('--port', '4175'); const OUT = arg('--out', '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad/chkrun/shots'); fs.mkdirSync(OUT, { recursive: true });
const VIEWS = { dashboard:'ホーム', schedule:'カレンダー', record:'提供記録入力', print:'連絡帳', diary:'日誌', transport:'送迎表', fitness:'体力測定', absence_fax:'休み連絡', general_fax:'各種連絡', tsusho_keikaku:'通所介護計画書', kinou_keikaku:'個別機能訓練計画書', seikatsu_kinou:'生活機能(3-2)', kyomi_kanshin:'興味関心(3-1)', kinou_yotei:'機能訓練予定', keikaku_yotei:'計画書予定', life_hub:'LIFE', monitoring:'モニタリング', jisseki:'実績', master:'利用者マスタ', cmmaster:'ケアマネ事業所', dash_personal:'分析(個人)', dash_operation:'分析(稼働)', family_admin:'お知らせ・閲覧管理', emergency:'災害時', settings:'各種設定', roster:'勤務表', class_roster:'クラス在籍表' };
const VIEWPORTS = [['pc', 1366, 900], ['ipad', 1024, 768], ['phone', 390, 844]];
const b = await chromium.launch(); const results = [];
for (const [name, w, h] of VIEWPORTS) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', isMobile: name === 'phone', hasTouch: name !== 'pc' }); const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push('PAGEERROR ' + e.message.slice(0, 140))); page.on('console', m => { if (m.type() === 'error') { const t = m.text(); if (!/favicon|manifest|net::ERR|Failed to load resource|supabase|fetch|404/i.test(t)) errs.push('console ' + t.slice(0, 140)); } }); page.on('dialog', d => d.dismiss().catch(() => {}));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  await page.evaluate(() => { localStorage.setItem('tsumugiSidebarOpen', '0'); sessionStorage.setItem('tsumugiActiveRecorder', JSON.stringify({ id: 'demo_rec', name: '見本 職員', roleLabel: '管理者' })); });
  for (const [key, label] of Object.entries(VIEWS)) {
    errs.length = 0;
    await page.evaluate((k) => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: k, pid: null, t: Date.now() })), key);
    await page.reload({ waitUntil: 'networkidle' }).catch(() => {}); await page.waitForTimeout(1800);
    const m = await page.evaluate(() => { const de = document.documentElement; const main = document.getElementById('appMainArea') || document.body; const hdr = document.querySelector('header'); return { sw: de.scrollWidth, iw: window.innerWidth, bw: document.body.scrollWidth, text: (main.innerText || '').replace(/\s+/g, '').length, title: (hdr ? hdr.innerText : '').replace(/\s+/g, ' ').slice(0, 30) }; });
    const shot = `${name}_${key}.png`; await page.screenshot({ path: path.join(OUT, shot), fullPage: false }).catch(() => {});
    const over = Math.max(m.sw, m.bw) - m.iw; const r = { vp: name, key, label, overflow: over > 2 ? over : 0, textLen: m.text, title: m.title, errs: errs.slice(0, 3), shot }; results.push(r);
    const flag = (r.overflow ? ` 横はみ出し+${r.overflow}` : '') + (errs.length ? ' ERR:' + errs[0] : '') + (m.text < 60 ? ' 空?' : '');
    console.log(`${name} ${label}(${key}) [${m.title}]${flag}`);
  }
  await ctx.close();
}
await b.close();
fs.writeFileSync(path.join(OUT, '..', 'audit_views.json'), JSON.stringify(results, null, 1));
const bad = results.filter(r => r.overflow || r.errs.length || r.textLen < 60);
console.log('\n=== 要確認', bad.length, '/', results.length); bad.forEach(r => console.log(' ', r.vp, r.label, r.overflow ? `横はみ出し+${r.overflow}` : '', r.errs[0] || '', r.textLen < 60 ? '空?' : ''));