import { chromium } from 'playwright';
const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1366, height: 900 } }); page.on('dialog', d => d.accept());
await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' }); await page.waitForTimeout(1200);
const info = await page.evaluate(() => { const k = 'daycareAppData_v3'; const d = JSON.parse(localStorage.getItem(k)); const t = new Date(); const dow = t.getDay(); const ds = `${t.getMonth()+1}月${t.getDate()}日`; const dows = ['日','月','火','水','木','金','土']; const mk = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}`; const day = t.getDate();
  const off = d.patients.filter(p => p.status === '利用中' && !(p.scheduleAmPm||[])[dow] && !p.endDate); const onAM = d.patients.filter(p => p.status === '利用中' && ['AM','1日'].includes((p.scheduleAmPm||[])[dow]) && !p.endDate);
  const P = { s1: off[0], s2: off[1], s3: onAM[0], s4: onAM[1], s5: off[2], s6: off[3] };
  const ids = Object.values(P).map(p => p.id);
  d.ticketRecords = (d.ticketRecords||[]).filter(r => !(ids.includes(r.patientId) && r.date === ds));
  d.monthlyShifts = d.monthlyShifts || {}; d.monthlyShifts[mk] = d.monthlyShifts[mk] || {};
  const sh = (p, k, v) => { d.monthlyShifts[mk][p.id] = { ...(d.monthlyShifts[mk][p.id]||{}), [`${day}_${k}`]: v }; };
  const rec = (p, status, extra) => d.ticketRecords.push({ id: Date.now() + Math.floor(Math.random()*1e6), patientId: p.id, name: p.name, kana: p.kana, date: ds, year: t.getFullYear(), dayOfWeek: dows[dow], status, ...extra });
  sh(P.s1, 'AM', '振替');            // S1 月間のみ 振替AM (基本曜日外)
  sh(P.s2, 'PM', '臨時');            // S2 月間のみ 臨時PM (基本曜日外)
  sh(P.s3, 'AM', '欠席');            // S3 月間のみ 欠席 (基本AM)
  rec(P.s4, '欠席', { tokki: '体調不良' }); // S4 記録のみ 欠席 (基本AM)
  rec(P.s5, '振替', { furikaeAmpm: 'AM' }); // S5 記録のみ 振替AM (基本曜日外・シフト無し)
  rec(P.s6, '臨時', { furikaeAmpm: 'PM' }); // S6 記録のみ 臨時PM
  localStorage.setItem(k, JSON.stringify(d)); const o = {}; for (const [k2, p] of Object.entries(P)) o[k2] = p.name; return o; });
console.log('seed', JSON.stringify(info));
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
const text = async () => await page.evaluate(() => document.body.innerText);
const res = {};
// 提供記録入力: 検索で1人ずつ確認(状態ボタンの文字)
await page.locator('button, a', { hasText: /サービス提供記録/ }).first().click(); await page.waitForTimeout(1200);
for (const ap of ['AM', 'PM']) { await page.locator('button', { hasText: new RegExp('^' + ap + '$') }).first().click(); await page.waitForTimeout(500);
  for (const [k, n] of Object.entries(info)) { await page.fill('input[placeholder="氏名で検索"]', n); await page.waitForTimeout(400);
    const st = await page.evaluate((n) => { const leaf = [...document.querySelectorAll('div,span,td,button')].find(e => e.children.length === 0 && e.textContent.trim() === n); if (!leaf) return '—'; let c = leaf; for (let i = 0; i < 5; i++) { c = c.parentElement; if (!c) break; const btns = [...c.querySelectorAll('button,select')].map(b => (b.tagName === 'SELECT' ? b.value : b.innerText).trim()).filter(x => /(出席|欠席|振替|臨時|休止|休業)/.test(x)); if (btns.length) return btns[0].replace(/\s+/g, ' ').slice(0, 6); } return '?:' + c.innerText.replace(/\s+/g, ' ').slice(0, 40); }, n);
    res[`record_${ap}_${k}`] = st; }
  await page.fill('input[placeholder="氏名で検索"]', ''); }
// 連絡帳 AM/PM
await page.locator('button, a', { hasText: /^連絡帳$/ }).first().click(); await page.waitForTimeout(1200);
for (const ap of ['AM', 'PM']) { await page.locator('button', { hasText: new RegExp('^' + ap + '$') }).first().click(); await page.waitForTimeout(700); const tx = await text(); for (const [k, n] of Object.entries(info)) res[`renraku_${ap}_${k}`] = tx.includes(n); }
// 日誌 AM/PM
await page.locator('button, a', { hasText: /^日誌/ }).first().click(); await page.waitForTimeout(1500);
for (const ap of ['AM', 'PM']) { await page.locator('button', { hasText: new RegExp('^(午前|AM)$') }).first().click().catch(() => {}); if (ap === 'PM') await page.locator('button', { hasText: /^(午後|PM)$/ }).first().click().catch(() => {}); await page.waitForTimeout(800); const tx = await text(); for (const [k, n] of Object.entries(info)) res[`diary_${ap}_${k}`] = tx.includes(n); }
const keys = Object.keys(info);
for (const v of ['record_AM','record_PM','renraku_AM','renraku_PM','diary_AM','diary_PM']) console.log(v.padEnd(11), keys.map(k => `${k}:${res[v + '_' + k]}`).join('  '));
await b.close();
