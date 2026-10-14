// ケアマネ向け「災害時の安否連絡のご案内」(public/cm-saigai.html)用のスクリーンショット(見本＝架空データのみ・今日基準)
//   事前にデモ版を 4173 で配信: VITE_E2E_DEMO=1 npx vite build && python3 -m http.server 4173 -d dist
//   node scripts/saigai_shots.mjs --out <dir>   (出力は png。資料用は sips で jpg に縮小して public/manual/img/saigai_*.jpg へ)
import { chromium, devices } from 'playwright';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://localhost:4173');
const OUT = arg('--out', '/tmp/saigai_img');
const log = (...a) => console.log('[saigai]', ...a);
const FAC = 'つむぎ デイサービス（見本）', TEL = '03-0000-0000', PLACE = '見本小学校 体育館';
const today = new Date(); const md = `${today.getMonth() + 1}月${today.getDate()}日`;
const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
// 事業所が「避難完了・全員無事」の定型文で送ったときの本文(EmergencyNoticeView の TEMPLATES と同じ文)
const BODY = `${md}、災害の発生に伴い、${FAC}をご利用中の皆さまは全員無事で、${PLACE}へ避難しました。\n現在は職員が付き添い、安全を確認しております。\nお迎え・ご帰宅については、状況が落ち着き次第あらためてご連絡いたします。\n\nご不明な点は下記までお電話ください。\n${FAC}　TEL ${TEL}`;
const SUBJ = '【重要】避難完了と皆さまの無事のご連絡';
const browser = await chromium.launch();

// ---------- 1. 事業所の画面(災害時 → 緊急連絡) ----------
{ const ctx = await browser.newContext({ locale: 'ja-JP', timezoneId: 'Asia/Tokyo', viewport: { width: 1180, height: 900 }, deviceScaleFactor: 2 }); const page = await ctx.newPage();
  page.on('dialog', d => d.dismiss()); page.on('pageerror', e => log('PAGEERROR', e.message.slice(0, 160)));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  await page.evaluate(({ FAC, TEL, PLACE }) => {
    const d = JSON.parse(localStorage.getItem('daycareAppData_v3'));
    const ss = d.systemSettings = d.systemSettings || {};
    ss.facilityInfo = { ...(ss.facilityInfo || {}), name: FAC, phone: TEL, email: '' };
    ss.bcp = { ...(ss.bcp || {}), evacTemp: [{ id: 'ev1', name: '見本公園', address: '（見本）1-2-3', note: '徒歩3分' }], evacMain: [{ id: 'ev2', name: PLACE, address: '（見本）4-5-6', note: '' }] };
    ss.careManagers = [{ office: '（見本）つむぎケアプランセンター', name: '見本 ケア子', phone: '03-0000-0000', email: 'cm-mihon@example.com' }];
    // 今の時間帯に通所中の方を6名にする(月間スケジュールの今日の枠で決める)
    const now = new Date(); const slot = now.getHours() < 13 ? 'AM' : 'PM'; const mk = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const act = d.patients.filter(p => p.status === '利用中'); const pick = new Set(act.slice(0, 6).map(p => p.id));
    d.monthlyShifts = d.monthlyShifts || {}; d.monthlyShifts[mk] = d.monthlyShifts[mk] || {};
    act.forEach(p => { d.monthlyShifts[mk][p.id] = { ...(d.monthlyShifts[mk][p.id] || {}), [`${now.getDate()}_${slot}`]: pick.has(p.id) ? '〇' : '×' }; if (pick.has(p.id)) { p.cmOffice = '（見本）つむぎケアプランセンター'; p.cmName = '見本 ケア子'; } });
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d));
    sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'emergency', pid: null, t: Date.now() }));
    sessionStorage.setItem('tsumugiDisasterTab', 'notice'); sessionStorage.setItem('tsumugiEmergencyPreset', 'safe');
  }, { FAC, TEL, PLACE });
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 400 }).catch(() => {});
  await page.locator('button', { hasText: /^全員 避難済み$/ }).first().click(); await page.waitForTimeout(200);
  await page.locator('select').filter({ has: page.locator('option', { hasText: PLACE }) }).first().selectOption({ label: `指定避難所: ${PLACE}（（見本）4-5-6）` });
  await page.locator('button', { hasText: '避難完了・全員無事' }).first().click(); await page.waitForTimeout(400);
  await page.evaluate(() => { const ta = document.querySelector('textarea'); if (ta) ta.rows = 7; });
  await page.waitForTimeout(300);
  // 左の入力カード・右の送信先
  const left = page.locator('div.bg-white.rounded-2xl', { hasText: '定型文から始める' }).first();
  await left.screenshot({ path: `${OUT}/saigai_staff_input.png` }); log('ok saigai_staff_input');
  const right = page.locator('div.space-y-4', { hasText: '緊急連絡を送信する' }).last();
  await right.screenshot({ path: `${OUT}/saigai_staff_send.png` }); log('ok saigai_staff_send');
  await ctx.close(); }

// ---------- 2. ケアマネ・ご家族の画面(お知らせ) ----------
const demoFamily = ({ FAC, TEL, SUBJ, BODY, PLACE, iso }) => {
  const P1 = 990001, P2 = 990002;
  const consents = { version: '2.0', termsVersion: '2.0', privacyVersion: '2.0', acceptedAt: new Date().toISOString() };
  const acc = (o) => ({ consents, createdAt: new Date().toISOString(), ...o });
  const pat = (id, name, kana, care) => ({ id, name, kana, status: '利用中', gender: '男性', birthDate: '1944-04-01', careLevel: care, startDate: '2024-04-01', endDate: '', scheduleAmPm: ['', '1日', '', '1日', '', '1日', ''], cmOffice: '（見本）つむぎケアプランセンター', cmName: '見本 ケア子' });
  const later = new Date(Date.now() + 120000).toISOString(); // 「NEW」を付ける(ログイン時刻より後)
  return {
    systemSettings: { facilityInfo: { name: FAC, phone: TEL, address: '東京都（見本）' } },
    patients: [pat(P1, '見本 太郎', 'ミホン タロウ', '要介護2'), pat(P2, '架空 花子', 'カクウ ハナコ', '要介護1')],
    ticketRecords: [], fitnessRecords: [], monitoringRecords: [],
    familyAnnouncements: [{ id: 'news_9902', title: '敬老会のご案内（見本）', body: '敬老会では、皆さんで歌や手作りのお菓子を楽しみます。当日の様子は写真でお知らせします。', date: iso, postedAt: new Date(Date.now() - 5 * 864e5).toISOString(), audience: ['family', 'caremanager', 'related'] }],
    familyPersonalAnnouncements: [P1, P2].map((pid, j) => ({ id: `news_saigai_${pid}`, patientId: pid, title: SUBJ, body: `${['見本 太郎', '架空 花子'][j]} 様: 避難済み（無事）（避難先: ${PLACE}）\n\n${BODY}`, date: iso, postedAt: later, audience: ['family', 'caremanager', 'related'], photos: [], emergency: true })),
    familyPhotos: [], familyInvites: [],
    familyAccounts: [
      acc({ id: 'fam_demo1', patientId: P1, username: 'mihon-family', password: 'mihon1234', kind: 'family', role: 'parent', relation: '長男', displayName: '見本 一郎', lastName: '見本', firstName: '一郎', kana: 'ミホン イチロウ', phoneMobile: '090-0000-0001', email: 'family-mihon@example.com' }),
      acc({ id: 'cm_demo1', patientId: P1, username: 'mihon-cm', password: 'mihon1234', kind: 'caremanager', role: 'caremanager', relation: 'ケアマネージャー', displayName: '見本 ケア子', lastName: '見本', firstName: 'ケア子', kana: 'ミホン ケアコ', office: '（見本）つむぎケアプランセンター', email: 'cm-mihon@example.com' }),
    ],
  };
};
const login = async (page, u) => {
  await page.goto(`${BASE}/?family`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((d) => { localStorage.setItem('tsumugiFamilyAppData_v1', JSON.stringify(d)); sessionStorage.clear(); Object.keys(localStorage).filter(k => k.startsWith('familyReadAt_')).forEach(k => localStorage.removeItem(k)); }, demoFamily({ FAC, TEL, SUBJ, BODY, PLACE, iso }));
  await page.goto(`${BASE}/?family`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(900);
  await page.locator('input[type="text"], input:not([type])').first().fill(u); await page.locator('input[type="password"]').first().fill('mihon1234');
  await page.getByRole('button', { name: /ログイン/ }).first().click(); await page.waitForTimeout(1600);
  for (let i = 0; i < 3; i++) { const cb = page.locator('input[type="checkbox"]').first(); if (await cb.isVisible().catch(() => false)) await cb.check().catch(() => {}); const btn = page.getByRole('button', { name: /同意して/ }).first(); if (await btn.isVisible().catch(() => false)) { await btn.click().catch(() => {}); await page.waitForTimeout(900); } }
  const pick = page.locator('button', { hasText: '見本 太郎' }).first(); if (await pick.isVisible().catch(() => false)) { await pick.click().catch(() => {}); await page.waitForTimeout(1200); }
  // 新しいお知らせのポップアップが出ていれば閉じる
  const later = page.locator('button', { hasText: /^あとで$/ }).first(); if (await later.isVisible().catch(() => false)) { await later.click().catch(() => {}); await page.waitForTimeout(300); }
  const tab = page.locator('button', { hasText: /^お知らせ/ }).first(); if (await tab.isVisible().catch(() => false)) { await tab.click().catch(() => {}); await page.waitForTimeout(700); }
};
// お知らせのカード(件名の文字を含む角丸の箱)を撮る
const cardShot = async (page, name) => {
  const ok = await page.evaluate(([subj, name]) => {
    const leaf = [...document.querySelectorAll('div,span,h3,p')].find(e => e.children.length === 0 && (e.textContent || '').includes(subj) && e.getBoundingClientRect().width > 0);
    if (!leaf) return 'no-leaf'; let el = leaf;
    for (let i = 0; i < 8 && el.parentElement; i++) { el = el.parentElement; const cs = getComputedStyle(el); if (el.getBoundingClientRect().width >= 260 && (cs.borderRadius !== '0px') && (cs.borderTopWidth !== '0px' || cs.boxShadow !== 'none' || cs.backgroundColor !== 'rgba(0, 0, 0, 0)')) break; }
    el.setAttribute('data-shot', name); el.scrollIntoView({ block: 'center' }); return 'ok';
  }, [SUBJ, name]);
  if (ok !== 'ok') { log('skip', name, ok); return; }
  await page.waitForTimeout(400); await page.locator(`[data-shot="${name}"]`).screenshot({ path: `${OUT}/${name}.png` }); log('ok', name);
};
{ const ctx = await browser.newContext({ locale: 'ja-JP', timezoneId: 'Asia/Tokyo', viewport: { width: 980, height: 740 }, deviceScaleFactor: 2 }); const page = await ctx.newPage();
  page.on('pageerror', e => log('PAGEERROR', e.message.slice(0, 160)));
  await login(page, 'mihon-cm');
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/saigai_cm_news_full.png` }); log('ok saigai_cm_news_full');
  await cardShot(page, 'saigai_cm_card');
  await ctx.close(); }
{ const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage();
  await login(page, 'mihon-family');
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/saigai_fam_news.png` }); log('ok saigai_fam_news');
  await ctx.close(); }

// ---------- 3. ケアマネに届くメール(api/notify-batch.js と同じ組み立て) ----------
{ const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 700, height: 900 }, deviceScaleFactor: 2 }); const page = await ctx.newPage();
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const cmBody = `担当利用者様の状況\n・見本 太郎 様: 避難済み（無事）（避難先: ${PLACE}）\n・架空 花子 様: 避難済み（無事）（避難先: ${PLACE}）\n\n${BODY}`;
  const htmlOf = (body) => `<div style="font-family:'Hiragino Sans','Meiryo',sans-serif;font-size:15px;line-height:1.8;color:#1d2a22;max-width:640px;">
    <div style="background:#f4f8ed;border-left:5px solid #7daa3d;padding:10px 14px;margin-bottom:16px;font-weight:bold;">${esc(FAC)} からの緊急連絡</div>
    <div style="white-space:pre-wrap;">${esc(body)}</div>
    <hr style="border:none;border-top:1px solid #e3e8dd;margin:20px 0;">
    <div style="font-size:12px;color:#7c8a80;">このメールは ${esc(FAC)} の記録システム「つむぎ」から送信されています。ご返信は事業所へ直接お電話ください。</div>
  </div>`;
  await page.setContent(`<!doctype html><html><body style="margin:0;background:#fff;font-family:'Hiragino Sans',sans-serif">
    <div id="mail" style="width:660px;border:1px solid #d5dbd7;border-radius:10px;overflow:hidden">
      <div style="background:#f3f5f4;border-bottom:1px solid #d5dbd7;padding:12px 18px;font-size:13px;color:#33413a;line-height:1.7">
        <div><span style="color:#6b7a72;display:inline-block;width:4em">件名</span><b style="font-size:15px">【${esc(FAC)}】${esc(SUBJ)}</b></div>
        <div><span style="color:#6b7a72;display:inline-block;width:4em">差出人</span>${esc(FAC)}</div>
        <div><span style="color:#6b7a72;display:inline-block;width:4em">宛先</span>見本 ケア子 様</div>
      </div>
      <div style="padding:18px 20px">${htmlOf(cmBody)}</div>
    </div></body></html>`);
  await page.locator('#mail').screenshot({ path: `${OUT}/saigai_mail_cm.png` }); log('ok saigai_mail_cm');
  await ctx.close(); }
await browser.close(); log('done');
