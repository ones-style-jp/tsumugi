// 2026-10-30 ユーザー要望:
//   「各種設定のサービス提供内容の左の並びに、特記の一言・音声入力が無い(項目管理まで)」→ 特記の一言の欄にも見出しの印(data-sec-title)
//   「日誌のカレンダーの下の説明で、完了の『了』だけ改行される」→ 説明は1つずつ折り返さない
//   ①PC: サービス提供内容の左の並びに「特記の一言・音声入力」がある・押すとその欄が上に来る・もう無い「体調の理由」は出ない(開く前の下書きにも)
//   ②スマホ・iPad・PC: 日誌のカレンダーの説明(AM+PM完了・AMのみ完了・PMのみ完了)がそれぞれ1行
//   実行: node scripts/chk_1030setnav.mjs [--port 4175]
import { chromium, webkit } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4175'; })();
const r = {};
const enter = async (page, view) => {
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  await page.evaluate((v) => { localStorage.setItem('tsumugiSidebarOpen', '0'); sessionStorage.setItem('tsumugiActiveRecorder', JSON.stringify({ id: 'demo_rec', name: '見本 職員', roleLabel: '介護職員' })); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: v, pid: null, t: Date.now() })); }, view);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2200); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 400 }).catch(() => {});
};
// ① 各種設定
{
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP' })).newPage(); page.on('dialog', d => d.accept());
  await enter(page, 'settings');
  const pre = await page.evaluate(() => { const n = document.querySelector('[data-testid="settings-secnav-record"]'); return n ? n.innerText : ''; });
  await page.getByTestId('settings-vtab-record').click(); await page.waitForTimeout(900);
  const items = await page.locator('[data-testid="settings-secnav-record"] button').allInnerTexts(); console.log('左の並び', JSON.stringify(items));
  r.has = items.includes('特記の一言・音声入力') && items[items.length - 1] === '特記の一言・音声入力';
  r.noOld = !items.some(x => /体調の理由/.test(x)) && !/体調の理由/.test(pre);
  await page.locator('[data-testid="settings-secnav-record"] button', { hasText: '特記の一言・音声入力' }).click(); await page.waitForTimeout(1200);
  const top = await page.evaluate(() => { const c = document.querySelector('[data-testid="tokki-preset-card"]'); const box = document.querySelector('[data-testid="settings-content"]'); if (!c || !box) return null; const bar = document.querySelector('[data-testid="settings-topbar"]'); const lim = bar ? bar.getBoundingClientRect().bottom : box.getBoundingClientRect().top; return Math.round(c.getBoundingClientRect().top - lim); });
  const scrolledToEnd = await page.evaluate(() => { const box = document.querySelector('[data-testid="settings-content"]'); return box ? box.scrollTop + box.clientHeight >= box.scrollHeight - 4 : false; });
  console.log('特記の欄の上端(上の帯から)', top, 'いちばん下まで', scrolledToEnd); r.jump = top != null && ((top >= -4 && top < 80) || scrolledToEnd);
  const cur = await page.evaluate(() => { const b = [...document.querySelectorAll('[data-testid="settings-secnav-record"] button')].find(x => /text-blue-700/.test(x.className)); return b ? b.innerText : ''; });
  console.log('印の付いた見出し', cur); r.cur = cur === '特記の一言・音声入力' || scrolledToEnd;
  await b.close();
}
// ② 日誌のカレンダーの説明
const cases = [['パソコン', chromium, { width: 1366, height: 900 }, {}],
  ['iPad', webkit, { width: 810, height: 1080 }, { isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1' }],
  ['スマホ', webkit, { width: 360, height: 780 }, { isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1' }]];
for (const [lab, eng, vp, opts] of cases) {
  const b = await eng.launch(); const page = await (await b.newContext({ viewport: vp, screen: vp, locale: 'ja-JP', ...opts })).newPage(); page.on('dialog', d => d.accept());
  await enter(page, 'diary');
  await page.evaluate(() => { document.querySelectorAll('details').forEach(d => { if (d.querySelector('[data-testid="diary-cal-legend"]')) d.open = true; }); }); await page.waitForTimeout(400);
  const m = await page.evaluate(() => { const L = document.querySelector('[data-testid="diary-cal-legend"]'); if (!L || !L.offsetParent) return null; return [...L.children].map(s => ({ t: s.textContent.trim(), lines: s.getClientRects().length, w: Math.round(s.getBoundingClientRect().width) })).concat([{ boxW: Math.round(L.getBoundingClientRect().width) }]); });
  console.log(lab, JSON.stringify(m));
  r[`${lab}_legend`] = !!m && m.filter(x => x.t).length === 3 && m.filter(x => x.t).every(x => x.lines === 1);
  // 画面の倍率・文字の大きさで説明が大きく出る端末(写真では本文くらい)も: 16px にしても1つずつは1行
  const big = await page.evaluate(() => { const L = document.querySelector('[data-testid="diary-cal-legend"]'); L.style.fontSize = '16px'; const out = [...L.children].map(s => s.getClientRects().length); L.style.fontSize = ''; return out; });
  console.log(lab, '16pxのとき', JSON.stringify(big)); r[`${lab}_legend16`] = big.length === 3 && big.every(n => n === 1);
  await b.close();
}
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
