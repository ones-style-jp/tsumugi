// 2026-11-08 trial530: スマホの利用者マスタで、利用者名(ID・フリガナ・氏名)が左から始まる(前は「ml-auto を持つ折返しバーは右寄せ」の全体CSSで真ん中に寄っていた)
//   実行: node scripts/chk_1108mhead.mjs [port]
import { chromium } from 'playwright';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
const OUT = process.env.S || '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad';
const b = await chromium.launch(); const r = {};
const run = async (phone) => {
  const ctx = await b.newContext(phone ? { viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' } : { viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
  const page = await ctx.newPage(); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const p = d.patients.find(p => p.status === '利用中' && !p.endDate && p.cmOffice) || d.patients[0]; sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'master', pid: p.id, t: Date.now() })); });
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
  if (phone && await page.getByText('利用者名で検索', { exact: false }).count()) { await page.mouse.click(420, 700); await page.waitForTimeout(400); } // 自動テストでは名簿の引き出しが開いて始まるので閉じる
  const m = await page.getByTestId('master-head').evaluate(el => { const row = el.firstElementChild; const name = row.firstElementChild; return { rowX: row.getBoundingClientRect().x, nameX: name.getBoundingClientRect().x, jc: getComputedStyle(row).justifyContent, txt: (name.textContent || '').slice(0, 3) }; });
  if (phone) await page.getByTestId('master-head').screenshot({ path: `${OUT}/mhead_phone_after.png` });
  await ctx.close(); return m; };
const ph = await run(true); const pc = await run(false);
r.phoneLeft = ph.txt.startsWith('ID:') && Math.abs(ph.nameX - ph.rowX) < 2 && /^(flex-start|flow-start|start|normal)$/.test(ph.jc); // Chromium は flow-start と返すことがある
r.pcLeft = pc.txt.startsWith('ID:') && Math.abs(pc.nameX - pc.rowX) < 2;
console.log({ ph, pc }); console.log(r); const ok = Object.values(r).every(Boolean); console.log(ok ? 'PASS' : 'FAIL'); await b.close(); process.exit(ok ? 0 : 1);
