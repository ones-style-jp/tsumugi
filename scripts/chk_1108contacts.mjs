// 2026-11-08 trial530: 利用者連絡先一覧を A4縦・1列(氏名・住所・携帯・固定・緊急連絡先)
//   ① 連絡先一覧のみ → pageSize は 210mm 297mm・名前付き @page tsuP・見出しに 携帯/固定/緊急連絡先
//   ② 本人の携帯と固定が別の欄に入る。送迎の連絡先がご家族の方は、その方の携帯・固定と名前。緊急連絡先はそれとは別の方
//   ③ 退所済みは出ない・その週に休みの方も出る
//   ④ 運行表＋連絡先一覧 → 用紙は横のまま、連絡先のページだけ page:tsuP(縦)
//   ⑤ 紙面を 794px 幅(=210mm)で描いて画面写真 contacts_a4p.png(目で確認用)
//   実行: node scripts/chk_1108contacts.mjs [port]
import { chromium } from 'playwright';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
const OUT = process.env.S || '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad';
const b = await chromium.launch(); const r = {};
const page = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
const S = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const t = new Date(); if (t.getDay() === 0) t.setDate(t.getDate() + 1); const dow = t.getDay(); const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  d.systemSettings = d.systemSettings || {}; d.systemSettings.facilityInfo = { ...(d.systemSettings.facilityInfo || {}), closedDays: [] }; d.holidays = []; d.transportPlans = {}; d.monthlyShifts = {};
  const act = d.patients.filter(p => p.status === '利用中' && !p.endDate); const names = {};
  const set = (k, i, sl) => { const p = act[i]; p.pauseHistory = []; p.scheduleAmPm = ['', '', '', '', '', '', '']; if (sl) p.scheduleAmPm[dow] = sl; p.scheduleChangeHistory = []; p.startDate = '2025-01-01'; p.name = `検${k}四郎`; p.kana = `けん${k}`; p.pickupCallTo = ''; p.emergencyContacts = []; p.familyName = ''; p.familyRelation = ''; p.familyPhone = ''; p.familyPhoneMobile = ''; names[k] = p.name; return p; };
  const A = set('A', 0, 'AM'); A.phoneMobile = '090-1111-2222'; A.phone = '03-3333-4444'; A.familyName = '検A 長女'; A.familyRelation = '長女'; A.familyPhoneMobile = '080-5555-6666';
  const B = set('B', 1, 'AM'); B.phoneMobile = '090-2222-3333'; B.phone = ''; B.pickupCallTo = 'family'; B.familyName = '検B 太郎'; B.familyRelation = '長男'; B.familyPhoneMobile = '090-7777-8888'; B.familyPhone = '03-9999-0000'; B.emergencyContacts = [{ name: '検B 花子', relation: '長女', phone: '03-1212-3434' }];
  const F = set('F', 2, ''); F.phone = '03-5555-6666'; F.phoneMobile = ''; // 利用中・今週はいない(休み)
  const G = set('G', 3, ''); G.endDate = '2026-10-01'; // 退所済み
  act.slice(4).forEach(p => { p.scheduleAmPm = ['', '', '', '', '', '', '']; });
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiTpDriveAck', String(Date.now()));
  sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, date: iso(t), t: Date.now(), ampm: 'AM' })); return { names }; });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
const cap = async (content) => { await page.evaluate(() => { window.__pd = null; window.addEventListener('setPrintHtml', e => { window.__pd = { html: (e.detail && e.detail.html) || '', pageSize: e.detail && e.detail.pageSize, title: e.detail && e.detail.title }; }, { once: true }); });
  await page.locator('button:visible', { hasText: /^ダウンロード$/ }).first().click(); await page.waitForTimeout(400);
  await page.locator('button:visible, label:visible', { hasText: content }).first().click(); await page.waitForTimeout(200);
  await page.locator('button:visible', { hasText: /^ダウンロード$/ }).last().click(); await page.waitForTimeout(1500);
  const pd = await page.evaluate(() => window.__pd); await page.keyboard.press('Escape').catch(() => {}); await page.locator('button:visible', { hasText: /^(閉じる|×|✕)$/ }).last().click().catch(() => {}); await page.waitForTimeout(400); return pd; };
const rowOf = (html, name) => { const i = html.indexOf(name); if (i < 0) return ''; const s = html.lastIndexOf('<tr', i), e = html.indexOf('</tr>', i); return html.slice(s, e); };
const cells = (row) => [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
const c = await cap(/^利用者連絡先一覧のみ$/);
r.portrait = c.pageSize === '210mm 297mm' && c.html.includes('@page tsuP{size:210mm 297mm') && c.html.includes('page:tsuP;');
r.headers = ['携帯', '固定', '緊急連絡先', '住所（待ち合わせ場所）'].every(h => c.html.includes(`>${h}</th>`));
const ra = cells(rowOf(c.html, S.names.A)); // [頭文字?, 氏名, 住所, 携帯, 固定, 緊急]
const tail = (cs) => cs.slice(-3);
r.selfBoth = tail(ra)[0] === '090-1111-2222' && tail(ra)[1] === '03-3333-4444';
r.selfEmg = /長女 検A 長女 080-5555-6666/.test(tail(ra)[2]);
const rb = cells(rowOf(c.html, S.names.B));
r.familyPair = /長男 検B 太郎 090-7777-8888/.test(tail(rb)[0]) && tail(rb)[1] === '03-9999-0000';
r.familyEmgOther = /長女 検B 花子 03-1212-3434/.test(tail(rb)[2]);
r.absentShown = c.html.includes(S.names.F) && tail(cells(rowOf(c.html, S.names.F)))[1] === '03-5555-6666';
r.retiredHidden = !c.html.includes(S.names.G);
if (!r.selfBoth || !r.selfEmg || !r.familyPair || !r.familyEmgOther) console.log('A', ra, '\nB', rb);
const both = await cap(/^運行表 ＋ 利用者連絡先一覧$/);
r.bothMixed = both.pageSize === '297mm 210mm' && both.html.includes('page:tsuP;') && both.html.includes('@page tsuP{') && both.html.includes('運行表');
// 紙面を描いて写真(210mm=794px 幅)
const pv = await (await b.newContext({ viewport: { width: 794, height: 1123 } })).newPage();
await pv.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;}</style></head><body>${c.html}</body></html>`); await pv.waitForTimeout(300);
const ov = await pv.evaluate(() => { const pg = document.querySelector('[data-page-break]'); const inner = pg && pg.firstElementChild; return inner ? inner.scrollHeight - inner.clientHeight : -1; });
r.fitsPage = ov <= 0; if (!r.fitsPage) console.log('overflow px', ov);
// ★ 2026-11-10 1110b: 行の高さは全員同じ(緊急連絡先・ご家族の名前がある2段の行も)。欄の中身がはみ出ていない
const rh = await pv.evaluate(() => { const trs = [...document.querySelectorAll('tbody tr')]; const hs = trs.map(t => Math.round(t.getBoundingClientRect().height)); const over = [...document.querySelectorAll('td > div')].filter(d => d.scrollHeight > d.clientHeight + 1).length; return { min: Math.min(...hs), max: Math.max(...hs), n: hs.length, over }; });
r.sameRowHeight = rh.max - rh.min <= 1; r.noCellOverflow = rh.over === 0; console.log('rows', rh);
await pv.screenshot({ path: `${OUT}/contacts_a4p.png`, fullPage: false });
console.log(r); const ok = Object.values(r).every(Boolean); console.log(ok ? 'PASS' : 'FAIL'); await b.close(); process.exit(ok ? 0 : 1);
