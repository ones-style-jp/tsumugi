// 2026-11-18 trial588/1118b 分析(個人): 6か月以上(月平均の表示)のとき、最高・最低の箱が「月平均の中の最高・最低」になっていた
//   ① 1年の表示: 脈の最高 62・最低 58(日付つき)、血圧の最高 150・最低 100、体温の最高 37.2・最低 35.8(いずれも日ごとの実測)
//   ② グラフの印のラベルは月平均の表示では「月平均 最高/最低」、1ヶ月の表示では「最高/最低」
//   実行: node chk/chk_1118vital.mjs [port]   (見本データ VITE_E2E_DEMO=1 のビルド)
import { chromium } from 'playwright';
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '4175';
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
page.on('dialog', d => d.accept()); page.on('pageerror', e => { console.log('PAGEERROR', e.message.slice(0, 200)); fails++; });
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
const seed = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const p = d.patients.find(x => x.status === '利用中' && !x.endDate);
  p.scheduleAmPm = ['AM', 'AM', 'AM', 'AM', 'AM', 'AM', 'AM']; p.scheduleChangeHistory = []; p.pauseHistory = []; p.startDate = '2025-01-01'; d.holidays = [];
  d.ticketRecords = (d.ticketRecords || []).filter(r => r.patientId !== p.id);
  const t = new Date(); const months = []; for (let k = 0; k < 7; k++) { const x = new Date(t.getFullYear(), t.getMonth() - k, 1); months.push({ y: x.getFullYear(), m: x.getMonth() + 1, k }); }
  const special = {}; // k:day → {pl,bu,bd,tp}
  special['3:2'] = { pl: '58' }; special['1:3'] = { pl: '62' }; special['2:1'] = { bu: '150', bd: '95' }; special['4:2'] = { bu: '100', bd: '60' }; special['5:3'] = { tp: '37.2' }; special['6:1'] = { tp: '35.8' };
  let id = 1; const out = { pid: p.id, mon: {} };
  months.forEach(({ y, m, k }) => { out.mon[k] = m; for (let day = 1; day <= 3; day++) { const sp = special[`${k}:${day}`] || {}; d.ticketRecords.push({ id: `vt${id++}`, patientId: p.id, name: p.name, kana: p.kana || '', date: `${m}月${day}日`, year: y, dayOfWeek: '月', status: '出席', temp: sp.tp || '36.5', bpUpSt: sp.bu || '120', bpDnSt: sp.bd || '70', plSt: sp.pl || '60', bpUpEn: '', bpDnEn: '', plEn: '', massage: '', exercises: {}, tokki: '' }); } });
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'dash_personal', pid: p.id, t: Date.now() })); return out; });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
const sel = page.locator('select').first(); if (await sel.count()) { await sel.selectOption(String(seed.pid)).catch(() => {}); await page.waitForTimeout(800); }
const cardText = (title) => page.evaluate((title) => { const el = [...document.querySelectorAll('div')].find(x => x.children.length === 0 && x.textContent.trim() === title); return el ? el.parentElement.innerText.replace(/\s+/g, ' ') : ''; }, title);
const labels = () => page.evaluate(() => [...document.querySelectorAll('svg text')].map(t => t.textContent).filter(t => /最高|最低/.test(t)));
// ① 1年(月平均の表示)
await page.locator('button', { hasText: /^1年$/ }).first().click(); await page.waitForTimeout(1200);
const pl = await cardText('脈拍（日別）'); const bp = await cardText('血圧（日別）'); const tp = await cardText('体温（日別）');
ok(/最高 62回\/分 \d+月3日/.test(pl) && /最低 58回\/分 \d+月2日/.test(pl), `脈: 最高 62(日付つき)・最低 58(日付つき) (${pl.slice(0, 120)})`);
ok(/最高 150mmHg/.test(bp) && /最低 100mmHg/.test(bp), `血圧(上): 最高 150・最低 100 (${bp.slice(0, 140)})`);
ok(/最高 37\.2℃ \d+月3日/.test(tp) && /最低 35\.8℃ \d+月1日/.test(tp), `体温: 最高 37.2・最低 35.8(日付つき) (${tp.slice(0, 120)})`);
let lb = await labels(); ok(lb.length >= 2 && lb.every(t => /^月平均 (最高|最低)$/.test(t)), `月平均の表示: グラフの印は「月平均 最高/最低」(${[...new Set(lb)].join(',')})`);
// ② 1ヶ月(日別)
await page.locator('button', { hasText: /^1ヶ月$/ }).first().click(); await page.waitForTimeout(1200);
lb = await labels(); ok(lb.length >= 2 && lb.every(t => /^(最高|最低)$/.test(t)), `1ヶ月の表示: 印は「最高/最低」(${[...new Set(lb)].join(',')})`);
const pl1 = await cardText('脈拍（日別）'); ok(/最高 60回\/分/.test(pl1) && /最低 60回\/分/.test(pl1), `1ヶ月(今月は全部 60): 最高 60・最低 60 (${pl1.slice(0, 100)})`);
await b.close(); console.log(fails ? `FAIL ${fails}` : 'ALL PASS'); process.exit(fails ? 1 : 0);
