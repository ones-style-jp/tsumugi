// 2026-11-27 trial653 モニタリングの AI 下書き: 時系列(ユーザー「術後の痛みと手術前の血圧の平均が1文につながり、時系列が逆」)
//   AI に渡す文(/api/ai-draft を差し替えて受け取る)に、1 日ごとの記録が日付順(入力の順ではない) 2 休んだ日が間に入る
//   3 時系列の決まり 4 平均は「月全体の平均」と書いてある   --dump で渡す文を表示(名前は見本の架空の方)
import { chromium } from 'playwright';
const PORT = process.argv.find(a => /^\d{4}$/.test(a)) || '4175'; const DUMP = process.argv.includes('--dump');
const b = await chromium.launch(); const r = {};
const now = new Date(); const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERR', String(e).slice(0, 200)));
let sent = null;
await page.route('**/api/ai-draft', async (route) => {
  if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ configured: true }) });
  sent = JSON.parse(route.request().postData() || '{}');
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ s1: { sel: '', text: '検査の文1' }, goal: { sel: '', text: '検査の文2' }, s2: { sel: '', text: '検査の文3' }, s3: { sel: '', text: '検査の文4' }, s4: { sel: '', text: '検査の文5' } }) }] }) });
});
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(700); }
// 見本の1人に、基本利用日の 出席(数値あり)2日 → 欠席(手術) → 出席(数値なし・術後の特記) を、わざと逆の順で入れる
const info = await page.evaluate(([ym]) => {
  const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const Y = Number(ym.slice(0, 4)), M = Number(ym.slice(5, 7)); const today = new Date().getDate();
  const per = `${Y}年${M}月`; d.monitoringRecords = (d.monitoringRecords || []).filter(x => x.period !== per);
  d.ticketRecords = (d.ticketRecords || []).filter(t => !/^chk_montime/.test(String(t.id)));
  const baseDays = (p) => { const sc = p.scheduleAmPm || []; const out = []; for (let i = 1; i <= today; i++) { const dow = new Date(Y, M - 1, i).getDay(); const v = sc[dow]; if (v === 'AM' || v === 'PM' || v === '1日') out.push(i); } return out; };
  const p = (d.patients || []).find(x => x.status === '利用中' && !x.endDate && !(x.scheduleChangeHistory || []).length && baseDays(x).length >= 5 && !(d.ticketRecords || []).some(t => t.patientId === x.id && String(t.date || '').startsWith(`${M}月`) && Number(t.year) === Y));
  if (!p) return null; const bd = baseDays(p); const [d1, d2, d3, d4] = [bd[0], bd[1], bd[2], bd[3]];
  const mk = (i, day, o) => ({ id: 'chk_montime_' + i, patientId: p.id, date: `${M}月${day}日`, year: Y, ...o });
  d.ticketRecords.push(
    mk(4, d4, { status: '出席', tokki: '術後の痛みが残り、頭痛もあるとのこと', kibunArrival: 'bad', kibunArrivalReason: '術後の痛み' }),
    mk(3, d3, { status: '欠席', tokki: '手術のため' }),
    mk(2, d2, { status: '出席', bpUpSt: '118', bpDnSt: '72', plSt: '78', temp: '36.4', kibunArrival: 'good' }),
    mk(1, d1, { status: '出席', bpUpSt: '114', bpDnSt: '68', plSt: '74', temp: '36.5', kibunArrival: 'good', kibunDeparture: 'excellent' }),
  );
  localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); return { name: p.name, M, days: [d1, d2, d3, d4] };
}, [ym]);
if (!info) { console.log('NO PATIENT'); await b.close(); process.exit(1); }
await page.evaluate(([ym]) => { localStorage.setItem('tsumugiSidebarOpen', '0'); sessionStorage.setItem('tsumugiMonJump', JSON.stringify({ ym, filter: 'none' })); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'monitoring', pid: null, t: Date.now() })); }, [ym]);
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
const row = page.locator('.tsu-mon-table tbody tr', { hasText: info.name }).first(); r.row = await row.count() === 1;
await row.locator('input[type="checkbox"]').first().check(); await page.waitForTimeout(300);
await page.locator('button[title^="選んだ方（無ければ全員）をAIで下書き"]').first().click(); await page.waitForTimeout(400);
await page.locator('button', { hasText: /^OK$/ }).last().click(); await page.waitForTimeout(2500);
await page.locator('button', { hasText: /^OK$/ }).last().click({ timeout: 800 }).catch(() => {});
const prompt = (sent && sent.messages && sent.messages[0] && sent.messages[0].content) || '';
r.sent = !!prompt; if (DUMP) console.log(prompt);
const [d1, d2, d3, d4] = info.days; const M = info.M; const L = (day) => prompt.indexOf(`・${M}月${day}日 `, prompt.indexOf('日ごとの記録（日付順'));
const blk = prompt.slice(prompt.indexOf('日ごとの記録（日付順・通所した日'));
r.block = blk.length > 0 && prompt.includes('日ごとの記録（日付順・通所した日の数値と、休んだ日。当月に起きた順）');
r.order = L(d1) > 0 && L(d1) < L(d2) && L(d2) < L(d3) && L(d3) < L(d4);
r.day_vitals = blk.includes(`・${M}月${d1}日 出席: 血圧114/68、脈拍74、体温36.5℃、体調 通所時 良い→帰宅時 とても良い`);
r.day_absent = blk.includes(`・${M}月${d3}日 欠席（手術のため）`);
r.day_novitals = blk.includes(`・${M}月${d4}日 出席: 体調 通所時 イマイチ`);
r.rule = prompt.includes('■ 時系列（重要）') && prompt.includes('【出来事の前】と【出来事の後】を分けて書く') && prompt.includes('月の平均値を1文でつなげない');
r.avg_label = prompt.includes('バイタル(参考・月全体の平均): 血圧(開始)平均116/70');
// 特記も日付順(入力は逆の順)
const tk = prompt.slice(prompt.indexOf('特記（当月の記録')); r.tokki_dated = tk.includes(`・${M}月${d4}日: 術後の痛みが残り`);
r.saved = await page.evaluate(([nm]) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const p = d.patients.find(x => x.name === nm); const rec = (d.monitoringRecords || []).find(x => x.patientId === p.id && x.sheet); return !!(rec && JSON.stringify(rec.sheet).includes('検査の文')); }, [info.name]);
await b.close();
console.log(JSON.stringify(r, null, 1)); const ng = Object.entries(r).filter(([, v]) => v !== true).map(([k]) => k);
console.log(ng.length ? 'FAIL ' + ng.join(',') : 'ALL PASS');
