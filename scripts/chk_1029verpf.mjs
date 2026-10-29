// 2026-10-29 ユーザー要望:
//   「スマホで左下のアプリ版がずっとあるのは邪魔・iPad も」→ 画面の左下に出し続けない・サイドバー(メニュー)のいちばん下に出す
//   「個人ファイルの項目名がダブっていて画面が狭い・左上の行の右が空いていてもったいない」→ iPad・PC は見出しと説明を上の行(pf-cat-head)へ・中の見出しの段はなくす
//   ①パソコン・iPad・スマホ: fixed の「アプリ版」がない・サイドバーに「アプリ版: upd-…」がある
//   ②パソコン・iPad: 上の行に見出し(支援経過表)が出る・中に同じ見出しの段がない ③スマホ: 上の行の見出しは出さない(横のタブにある)・中の見出しの段もない
//   実行: node scripts/chk_1029verpf.mjs [--port 4175]
import { chromium, webkit } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4175'; })();
const r = {};
const cases = [['パソコン', chromium, { width: 1366, height: 900 }, {}],
  ['iPad', webkit, { width: 1080, height: 810 }, { isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1' }],
  ['スマホ', webkit, { width: 390, height: 844 }, { isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1' }]];
for (const [lab, eng, vp, opts] of cases) {
  const b = await eng.launch(); const ctx = await b.newContext({ viewport: vp, screen: vp, locale: 'ja-JP', ...opts }); const page = await ctx.newPage(); page.on('dialog', d => d.accept());
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const P = d.patients.find(p => p.status === '利用中'); localStorage.setItem('tsumugiSidebarOpen', '0');
    sessionStorage.setItem('tsumugiActiveRecorder', JSON.stringify({ id: 'demo_rec', name: '見本 職員', roleLabel: '介護職員' })); sessionStorage.setItem('tsumugiReopenPF', JSON.stringify({ patientId: P.id, tab: 'cat_9' })); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'master', pid: P.id, t: Date.now() })); });
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 400 }).catch(() => {});
  const m = await page.evaluate(() => { const fixedVer = [...document.querySelectorAll('div')].some(d => /^アプリ版:/.test((d.innerText || '').trim()) && getComputedStyle(d).position === 'fixed');
    const head = document.querySelector('[data-testid="pf-cat-head"]'); const headVis = !!head && head.getClientRects().length > 0 && getComputedStyle(head).display !== 'none';
    const pc = document.querySelector('[data-testid="pf-content"]'); const dup = pc ? [...pc.querySelectorAll('div')].some(x => x.children.length === 0 && x.innerText.trim() === '支援経過表' && /text-slate-700/.test(x.className) && /text-sm/.test(x.className)) : null;
    const sv = document.querySelector('[data-testid="side-app-ver"]'); return { fixedVer, headVis, headText: head ? (head.innerText || '').split('\n')[0] : '', dup, side: sv ? sv.textContent : '' }; });
  console.log(lab, JSON.stringify(m));
  r[`${lab}_noFixed`] = !m.fixedVer; r[`${lab}_side`] = /^アプリ版: upd-/.test(m.side); r[`${lab}_noDup`] = m.dup === false;
  r[`${lab}_head`] = lab === 'スマホ' ? !m.headVis : (m.headVis && m.headText === '支援経過表');
  await b.close(); }
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
