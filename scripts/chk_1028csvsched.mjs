// 2026-10-28 ユーザー要望「基本利用曜日も取り込めるように(AMとPMで列を分けると分かりやすい)」
//   利用者マスタ → CSV入出力 で
//   ①テンプレート: 列に「基本利用曜日（午前）」「基本利用曜日（午後）」・見本の行は架空(実在の地名・番号なし)・列の数と見本の数が同じ
//   ②新しく登録する方: 「月、水、金」「月」+「月・木」(=月は1日)「月曜日 水曜日」「月水」・前の書き出しの1列「火:AM 金:午後」が入る・「毎日」は読めず入らない(知らせに出る)
//   ③すでに利用している方(記録あり)は変えない(知らせに出る) ④曜日も記録もない方は2回目の取り込みで入る
//   ⑤書き出し: 午前・午後の2列に「月、水、金」の形で出る(取り込み直しても同じ)
//   実行: node scripts/chk_1028csvsched.mjs [--port 4175]
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4175'; })();
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', acceptDownloads: true }); const page = await ctx.newPage();
const alerts = []; page.on('dialog', d => { alerts.push(d.message()); d.accept(); }); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
// 記録のある見本の方を1人(③用)
const E = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const p = (d.patients || []).find(x => x.status === '利用中' && !x.endDate && (x.name || '').trim()); if (!p) return null;
  if (!(p.scheduleAmPm || []).some(Boolean)) p.scheduleAmPm = ['', 'AM', '', '', '', '', ''];
  const t = new Date(); d.ticketRecords = [...(d.ticketRecords || []), { id: `tr_csvsched_${p.id}`, patientId: p.id, name: p.name, date: `${t.getMonth() + 1}月${t.getDate()}日`, year: t.getFullYear(), status: '出席', tokki: '', _savedAt: Date.now() }];
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); localStorage.setItem('tsumugiSidebarOpen', '0'); return { id: p.id, name: p.name, sched: (p.scheduleAmPm || []).join('|') }; });
const r = { seedE: !!E };
const go = async () => { await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'master', pid: null, t: Date.now() }))); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1800); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {}); await page.locator('button[title="CSV入出力"]').first().click(); await page.waitForTimeout(500); };
const dlText = async (label) => { const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('button', { hasText: label }).first().click()]); return fs.readFileSync(await dl.path(), 'utf8').replace(/^﻿/, ''); };
const parse = (t) => { const rows = []; let cur = [], buf = '', q = false; for (let i = 0; i < t.length; i++) { const c = t[i]; if (q) { if (c === '"') { if (t[i + 1] === '"') { buf += '"'; i++; } else q = false; } else buf += c; } else if (c === '"') q = true; else if (c === ',') { cur.push(buf); buf = ''; } else if (c === '\n') { cur.push(buf.replace(/\r$/, '')); rows.push(cur); cur = []; buf = ''; } else buf += c; } if (buf || cur.length) { cur.push(buf); rows.push(cur); } return rows; };
const imp = async (csv) => { const f = path.join(os.tmpdir(), `csvsched_${Date.now()}.csv`); fs.writeFileSync(f, '﻿' + csv); await page.locator('button', { hasText: 'CSV を貼り付けて一括追加' }).first().click(); await page.waitForTimeout(300);
  await page.locator('input[type="file"][accept=".csv,text/csv"]').setInputFiles(f); await page.waitForTimeout(600); await page.locator('button', { hasText: '取り込みを実行' }).click(); await page.waitForTimeout(1200);
  if (await page.locator('button', { hasText: 'この内容で取り込む' }).count()) { await page.locator('button', { hasText: 'この内容で取り込む' }).click(); await page.waitForTimeout(1200); } fs.unlinkSync(f); };
const sched = () => page.evaluate(() => Object.fromEntries((JSON.parse(localStorage.getItem('daycareAppData_v3')).patients || []).filter(p => /^曜日/.test(p.name || '') || true).map(p => [p.name, (p.scheduleAmPm || []).join('|')])));
// ① テンプレート
await go(); const tpl = parse(await dlText('テンプレート')); const H = tpl[0];
const iA = H.indexOf('基本利用曜日（午前）'), iP = H.indexOf('基本利用曜日（午後）');
console.log('列', H.length, '見本', tpl[1].length, '午前/午後の列', iA, iP, '見本の曜日', tpl[1][iA], '/', tpl[1][iP]);
r.tplCols = iA > 0 && iP === iA + 1 && tpl[1].length === H.length; r.tplFictional = !/扇橋|江東|ひかり|1234-5678/.test(tpl.map(x => x.join(',')).join('\n'));
// ② ③ 1回目の取り込み(前の書き出しの1列「基本利用曜日」も最後に足す)
const H2 = [...H, '基本利用曜日'];
const row = (o) => H2.map(h => o[h] ?? '');
const rows = [
  row({ '氏名': '曜日 一郎', '基本利用曜日（午前）': '月、水、金' }),
  row({ '氏名': '曜日 二郎', '基本利用曜日（午前）': '月', '基本利用曜日（午後）': '月・木' }),
  row({ '氏名': '曜日 三郎', '基本利用曜日': '火:AM 金:午後' }),
  row({ '氏名': '曜日 四郎', '基本利用曜日（午前）': '毎日' }),
  row({ '氏名': '曜日 五郎', '基本利用曜日（午前）': '月曜日 水曜日' }),
  row({ '氏名': '曜日 六郎', '基本利用曜日（午後）': '月水' }),
  row({ '利用者ID': String(E.id), '基本利用曜日（午前）': '土' }),
];
const esc = (v) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
await imp([H2, ...rows].map(x => x.map(esc).join(',')).join('\r\n'));
const s1 = await sched(); const m1 = alerts[alerts.length - 1] || ''; console.log('知らせ1:', JSON.stringify(m1));
const want = { '曜日 一郎': '|AM||AM||AM|', '曜日 二郎': '|1日|||PM||', '曜日 三郎': '||AM|||PM|', '曜日 四郎': '||||||', '曜日 五郎': '|AM||AM|||', '曜日 六郎': '|PM||PM|||' };
Object.entries(want).forEach(([n, w]) => { const ok = s1[n] === w; if (!ok) console.log('NG', n, 'want', w, 'got', s1[n]); r[`new_${n}`] = ok; });
r.existingKept = s1[E.name] === E.sched; r.msgSet = /基本利用曜日: 5名に入れました/.test(m1); r.msgKept = m1.includes(E.name) && /すでに利用している方は変えていません/.test(m1); r.msgErr = /読めず入れていません/.test(m1) && m1.includes('曜日 四郎');
// ④ 2回目: 曜日も記録もない「曜日 四郎」に入れる(同じ名前=更新)
await go(); await imp([H, row({ '氏名': '曜日 四郎', '基本利用曜日（午前）': '火' }).slice(0, H.length)].map(x => x.map(esc).join(',')).join('\r\n'));
const s2 = await sched(); console.log('知らせ2:', JSON.stringify(alerts[alerts.length - 1] || '')); r.emptyExistingSet = s2['曜日 四郎'] === '||AM||||'; console.log('四郎', s2['曜日 四郎']);
// ⑤ 書き出し
await go(); const ex = parse(await dlText('エクスポート').catch(async () => dlText('出力')));
const eh = ex[0]; const ea = eh.indexOf('基本利用曜日（午前）'), ep = eh.indexOf('基本利用曜日（午後）'); const ni = eh.indexOf('氏名');
const find = (n) => ex.find(x => x[ni] === n) || [];
console.log('書き出し 一郎', find('曜日 一郎')[ea], '/', find('曜日 一郎')[ep], ' 二郎', find('曜日 二郎')[ea], '/', find('曜日 二郎')[ep]);
r.exportCols = find('曜日 一郎')[ea] === '月、水、金' && find('曜日 一郎')[ep] === '' && find('曜日 二郎')[ea] === '月' && find('曜日 二郎')[ep] === '月、木';
await b.close();
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
