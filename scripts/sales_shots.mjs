import { chromium, devices } from 'playwright';
const OUT = '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad';
const BASE = 'http://localhost:4173';
function demo() {
  const PID = 990001; const dows = ['日','月','火','水','木','金','土']; const today = new Date();
  const recs = []; let i = 0;
  for (let back = 34; back >= 1; back--) { const d = new Date(today); d.setDate(d.getDate() - back); if (![1,3,5].includes(d.getDay())) continue;
    const moods = ['good','excellent','normal','good','good','excellent','normal','good'];
    recs.push({ id: 9900000 + i, patientId: PID, name: '見本 太郎', kana: 'ミホン タロウ', date: `${d.getMonth()+1}月${d.getDate()}日`, year: d.getFullYear(), dayOfWeek: dows[d.getDay()], status: i === 5 ? '欠席' : '出席',
      temp: (36.2 + (i % 5) * 0.1).toFixed(1), bpUpSt: String(124 + (i % 6) * 2), bpDnSt: String(74 + (i % 4) * 2), plSt: String(66 + (i % 5)), bpUpEn: String(118 + (i % 5) * 2), bpDnEn: String(70 + (i % 4) * 2), plEn: String(62 + (i % 5)),
      massage: '見本 職員', exercises: { u1:'10分', u2:'3分', u3:'3分', u4:'3分', u5:'3分', u6:'6分', heikobo:'10/20', fumidai:'15分', stepper:'50回' },
      tokki: i % 4 === 1 ? '体操に意欲的に取り組まれました（見本）' : '', kibunArrival: moods[i % 8], kibunDeparture: moods[(i + 1) % 8], _savedAt: Date.now() }); i++; }
  const patient = { id: PID, name: '見本 太郎', kana: 'ミホン タロウ', status: '利用中', gender: '男性', birthDate: '1945-05-15', careLevel: '要介護2', startDate: '2024-04-01', endDate: '', scheduleAmPm: ['','1日','','1日','','1日',''], phone: '03-0000-0000', address: '東京都（見本）1-2-3', cmOffice: '（見本）つむぎケアプランセンター', cmName: '見本 ケア子', cmPhone: '03-0000-0000', cmFax: '03-0000-0001', plannedExercises: { u1:'10分', u2:'3分', u3:'3分', u4:'3分', u5:'3分', u6:'6分', heikobo:'10/20', fumidai:'15分', stepper:'50回' }, ryui: '見本データ', faceSheet: { adlLevel: 'A1', dementiaLevel: 'Ⅰ' } };
  const consents = { version: '2.0', termsVersion: '2.0', privacyVersion: '2.0', acceptedAt: new Date().toISOString() };
  const ymd = (b) => { const d = new Date(today); d.setDate(d.getDate() - b); return d.toISOString().slice(0,10); };
  return { systemSettings: { facilityInfo: { name: 'つむぎ デイサービス（見本）', phone: '03-0000-0000', address: '東京都（見本）' } }, patients: [patient], ticketRecords: recs,
    familyAnnouncements: [ { id: 9901, title: '秋の遠足のご案内（見本）', body: '10月中旬に近くの公園へ秋の遠足を予定しています。持ち物など詳細は追ってご案内します。', date: ymd(3), postedAt: new Date(today - 3*864e5).toISOString(), audience: ['family','caremanager','related'] }, { id: 9902, title: 'インフルエンザ予防接種のお知らせ（見本）', body: '11月より接種を開始します。ご希望の方は職員までお申し出ください。', date: ymd(8), postedAt: new Date(today - 8*864e5).toISOString(), audience: ['family','caremanager','related'] } ],
    familyPersonalAnnouncements: [ { id: 9911, patientId: PID, title: '次回の担当者会議のお知らせ（見本）', body: '10月10日 14時から担当者会議を予定しています。', date: ymd(1), postedAt: new Date(today - 864e5).toISOString(), audience: ['family','caremanager'] } ],
    familyPhotos: [], familyInvites: [], 
    familyAccounts: [ { id: 'fam_demo1', patientId: PID, username: 'mihon-family', password: 'mihon1234', kind: 'family', role: 'parent', relation: '長男', displayName: '見本 一郎', lastName: '見本', firstName: '一郎', kana: 'ミホン イチロウ', phone: '03-0000-0000', phoneMobile: '090-0000-0000', email: 'mihon@example.com', createdAt: '2026-06-01', consents }, { id: 'cm_demo1', patientId: PID, username: 'mihon-cm', password: 'mihon1234', kind: 'caremanager', role: 'caremanager', relation: 'ケアマネージャー', displayName: '見本 ケア子', lastName: '見本', firstName: 'ケア子', kana: 'ミホン ケアコ', phone: '03-0000-0000', cmOffice: '（見本）つむぎケアプランセンター', officePhone: '03-0000-0000', officeFax: '03-0000-0001', email: 'mihon-cm@example.com', createdAt: '2026-06-01', consents } ] };
}
const b = await chromium.launch();
const IMG = OUT + '/sales_img';
const login = async (page, u) => {
  await page.goto(`${BASE}/?family`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((d) => { localStorage.setItem('tsumugiFamilyAppData_v1', JSON.stringify(d)); sessionStorage.clear(); }, demo());
  await page.goto(`${BASE}/?family`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(800);
  await page.locator('input[type="text"], input:not([type])').first().fill(u); await page.locator('input[type="password"]').first().fill('mihon1234');
  await page.getByRole('button', { name: /ログイン/ }).first().click(); await page.waitForTimeout(1500);
  for (let i = 0; i < 2; i++) { const cb = page.locator('input[type="checkbox"]').first(); if (await cb.isVisible().catch(() => false)) await cb.check().catch(() => {}); const btn = page.getByRole('button', { name: /同意して進む/ }).first(); if (await btn.isVisible().catch(() => false)) { await btn.click().catch(() => {}); await page.waitForTimeout(1000); } else break; }
};
const shotBlock = async (page, text, name, minW = 300) => { try {
  const ok = await page.evaluate(([text, name, minW]) => { const leaf = [...document.querySelectorAll('div,span,h2,h3,p')].find(e => e.children.length === 0 && e.textContent.trim().startsWith(text)); if (!leaf) return 'no leaf'; let el = leaf; for (let i = 0; i < 8 && el; i++) { el = el.parentElement; if (!el) break; const cs = getComputedStyle(el); if (parseFloat(cs.borderTopLeftRadius) >= 8 && el.getBoundingClientRect().width >= minW) break; } if (!el) return 'no card'; el.setAttribute('data-shot', name); el.scrollIntoView({ block: 'center' }); return 'ok'; }, [text, name, minW]);
  if (ok !== 'ok') { console.log('skip', name, ok); return; } await page.waitForTimeout(400); await page.locator(`[data-shot="${name}"]`).screenshot({ path: `${IMG}/${name}.png` }); console.log('ok', name); } catch (e) { console.log('skip', name, e.message.split('\n')[0]); } };
const block = (page, text) => page.locator(`[data-shot="${text}"]`);
// ---- 家族 PC ----
{ const ctx = await b.newContext({ locale: 'ja-JP', timezoneId: 'Asia/Tokyo', viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1.5 }); const page = await ctx.newPage();
  await login(page, 'mihon-family');
  // お知らせを開く
  await page.getByText(/年のお知らせ/).first().click().catch(() => {}); await page.waitForTimeout(500);
  await page.screenshot({ path: `${IMG}/family_pc_notice_open.png` });
  await page.locator('button', { hasText: '通所記録' }).first().click(); await page.waitForTimeout(1200);
  const labels = await page.evaluate(() => [...document.querySelectorAll('div,span,h2,h3')].filter(e => e.children.length === 0 && parseInt(getComputedStyle(e).fontWeight) >= 600).map(e => e.textContent.trim()).filter(t => t.length > 1 && t.length < 24));
  console.log('bold labels:', JSON.stringify([...new Set(labels)]));
  await shotBlock(page, '今回の記録', 'family_pc_today', 900);
  await shotBlock(page, '通所率', 'family_pc_rate', 300);
  await shotBlock(page, '気分トレンド', 'family_pc_mood', 600);
  await shotBlock(page, '体温（日別）', 'family_pc_temp', 500);
  await shotBlock(page, '血圧（日別）', 'family_pc_bp', 500);
  await shotBlock(page, '脈拍（日別）', 'family_pc_pulse', 500);
  for (const [k, n] of [['体温', 'family_pc_temp'], ['血圧', 'family_pc_bp'], ['運動', 'family_pc_exercise'], ['記録一覧', 'family_pc_list'], ['特記', 'family_pc_tokki']]) { const c = await page.getByText(k, { exact: false }).count(); console.log(k, c); }
  await page.screenshot({ path: `${IMG}/family_pc_record_top.png` });
  await ctx.close(); }
// ---- 家族 スマホ ----
{ const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage();
  await login(page, 'mihon-family');
  await page.getByText(/年のお知らせ/).first().click().catch(() => {}); await page.waitForTimeout(500);
  await page.screenshot({ path: `${IMG}/family_sp_notice_open.png` });
  await page.locator('button', { hasText: '通所記録' }).first().click(); await page.waitForTimeout(1200);
  const spScroll = async (text, name) => { await page.evaluate((text) => { const leaf = [...document.querySelectorAll('div,span,h2,h3,p')].find(e => e.children.length === 0 && e.textContent.trim().startsWith(text)); if (leaf) leaf.scrollIntoView({ block: 'start' }); const sc = leaf && leaf.closest('[class*="overflow-y"], [class*="overflow-auto"]'); if (sc) sc.scrollTop -= 8; }, text); await page.waitForTimeout(500); await page.screenshot({ path: `${IMG}/${name}.png` }); console.log('ok', name); };
  await spScroll('今回の様子', 'family_sp_today');
  await spScroll('気分トレンド', 'family_sp_mood');
  await spScroll('血圧（日別）', 'family_sp_bp');
  await ctx.close(); }
// ---- ケアマネ PC ----
{ const ctx = await b.newContext({ locale: 'ja-JP', timezoneId: 'Asia/Tokyo', viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1.5 }); const page = await ctx.newPage();
  await login(page, 'mihon-cm');
  await page.screenshot({ path: `${IMG}/cm_pc_home.png` });
  for (const [t, n] of [['保険証・アセスメント', 'cm_pc_docs'], ['関係者一覧', 'cm_pc_related'], ['フェイスシート', 'cm_pc_facesheet']]) {
    const btn = page.locator('button', { hasText: t }).first();
    if (await btn.click({ timeout: 3000 }).then(() => true).catch(e => { console.log('skip', n, e.message.split('\n')[0]); return false; })) { await page.waitForTimeout(900); await page.screenshot({ path: `${IMG}/${n}.png` }); console.log('ok', n);
      for (let k = 0; k < 3; k++) { const x = page.locator('button:has(svg.lucide-x)').last(); if (await x.isVisible().catch(() => false)) { await x.click().catch(() => {}); await page.waitForTimeout(300); } const c = page.locator('button', { hasText: /^(閉じる|キャンセル)$/ }).last(); if (await c.isVisible().catch(() => false)) { await c.click().catch(() => {}); await page.waitForTimeout(300); } }
      await page.keyboard.press('Escape'); await page.waitForTimeout(400); }
  }
  await ctx.close(); }
await b.close();
