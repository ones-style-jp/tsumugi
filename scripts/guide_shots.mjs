// ご家族向け・ケアマネ向け「つむぎのご紹介」用のスクリーンショット(見本＝架空データのみ・今日基準)
//   事前にデモ版を 4173 で配信: VITE_E2E_DEMO=1 npx vite build && python3 -m http.server 4173 -d dist
//   node scripts/guide_shots.mjs --out <dir>
import { chromium, devices } from 'playwright';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://localhost:4173');
const OUT = arg('--out', '/tmp/guide_img');
const log = (...a) => console.log('[guide]', ...a);

// 写真(見本)はブラウザで描いた簡単な絵(実在の人物・場所は写らない)
const makePhotos = () => {
  const mk = (bg, fg, label, draw) => { const c = document.createElement('canvas'); c.width = 960; c.height = 640; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 640); gr.addColorStop(0, bg[0]); gr.addColorStop(1, bg[1]); g.fillStyle = gr; g.fillRect(0, 0, 960, 640);
    draw(g); g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(24, 572, 330, 48); g.fillStyle = fg; g.font = 'bold 26px sans-serif'; g.fillText(label, 40, 606); return c.toDataURL('image/jpeg', 0.82); };
  const tree = (g, x, y, s, col) => { g.fillStyle = '#7c5a3a'; g.fillRect(x - 8 * s, y, 16 * s, 70 * s); g.fillStyle = col; g.beginPath(); g.arc(x, y - 10 * s, 60 * s, 0, Math.PI * 2); g.fill(); };
  return [
    mk(['#bfe3ff', '#e9f7d9'], '#365314', '秋の遠足（見本）', g => { g.fillStyle = '#9ccc65'; g.fillRect(0, 420, 960, 220); tree(g, 180, 330, 1.3, '#f59e0b'); tree(g, 760, 340, 1.1, '#ea580c'); tree(g, 470, 300, 1.5, '#facc15'); g.fillStyle = '#fff'; g.beginPath(); g.arc(820, 110, 50, 0, Math.PI * 2); g.fill(); }),
    mk(['#fff7ed', '#fde68a'], '#78350f', '体操の時間（見本）', g => { g.fillStyle = '#fbbf24'; g.fillRect(0, 470, 960, 170); g.strokeStyle = '#78350f'; g.lineWidth = 14; g.lineCap = 'round';
      [[260, 300], [480, 290], [700, 300]].forEach(([x, y]) => { g.fillStyle = '#f5d0a9'; g.beginPath(); g.arc(x, y - 90, 34, 0, Math.PI * 2); g.fill(); g.beginPath(); g.moveTo(x, y - 55); g.lineTo(x, y + 60); g.moveTo(x, y - 30); g.lineTo(x - 70, y - 90); g.moveTo(x, y - 30); g.lineTo(x + 70, y - 90); g.moveTo(x, y + 60); g.lineTo(x - 40, y + 140); g.moveTo(x, y + 60); g.lineTo(x + 40, y + 140); g.stroke(); }); }),
    mk(['#ecfeff', '#cffafe'], '#0e7490', '季節の手作り（見本）', g => { g.fillStyle = '#fca5a5'; for (let i = 0; i < 9; i++) { const x = 140 + (i % 3) * 300, y = 140 + Math.floor(i / 3) * 140; g.beginPath(); g.arc(x, y, 46, 0, Math.PI * 2); g.fill(); g.fillStyle = i % 2 ? '#fca5a5' : '#fdba74'; } }),
  ];
};

function demo(photos) {
  const P1 = 990001, P2 = 990002, P3 = 990003; const dows = ['日', '月', '火', '水', '木', '金', '土']; const today = new Date();
  const ymd = (b) => { const d = new Date(today); d.setDate(d.getDate() - b); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const recsFor = (pid, name, kana, base) => { const out = []; let i = 0;
    for (let back = 62; back >= 1; back--) { const d = new Date(today); d.setDate(d.getDate() - back); if (![1, 3, 5].includes(d.getDay())) continue;
      const moods = ['good', 'excellent', 'normal', 'good', 'good', 'excellent', 'normal', 'good'];
      out.push({ id: pid * 10 + i, patientId: pid, name, kana, date: `${d.getMonth() + 1}月${d.getDate()}日`, year: d.getFullYear(), dayOfWeek: dows[d.getDay()], status: i === 7 ? '欠席' : '出席',
        temp: (36.2 + ((i + base) % 5) * 0.1).toFixed(1), bpUpSt: String(124 + ((i + base) % 6) * 2), bpDnSt: String(74 + (i % 4) * 2), plSt: String(66 + (i % 5)), bpUpEn: String(118 + ((i + base) % 5) * 2), bpDnEn: String(70 + (i % 4) * 2), plEn: String(64 + (i % 4)),
        massage: '見本 職員', exercises: { u1: '10分', u2: '3分', u3: '3分', u4: '3分', u5: '3分', u6: '6分', heikobo: '10/20', fumidai: '15分', stepper: '50回' },
        tokki: i % 3 === 1 ? '体操に意欲的に取り組まれ、休憩中は笑顔で会話を楽しまれていました（見本）' : (i % 3 === 2 ? '入浴後もお変わりなく、昼食は完食されました（見本）' : ''), kibunArrival: moods[(i + base) % 8], kibunDeparture: moods[(i + base + 1) % 8], _savedAt: Date.now() }); i++; }
    // 最新の回には必ず様子を入れる
    const last = out[out.length - 1]; last.status = '出席'; last.tokki = '体操に意欲的に取り組まれ、休憩中は笑顔で会話を楽しまれていました（見本）';
    return out; };
  const pat = (id, name, kana, gender, birth, care) => ({ id, name, kana, status: '利用中', gender, birthDate: birth, careLevel: care, careLevelFrom: '2026-04-01', careLevelTo: '2027-03-31', startDate: '2024-04-01', endDate: '',
    scheduleAmPm: ['', '1日', '', '1日', '', '1日', ''], pickupTimes: ['', '8:40', '', '8:40', '', '8:40', ''], phone: '03-0000-0000', address: '東京都（見本）1-2-3',
    cmOffice: '（見本）つむぎケアプランセンター', cmName: '見本 ケア子', cmPhone: '03-0000-0000', cmFax: '03-0000-0001', doctor: '見本 医師', medicalInstitution: '見本クリニック',
    plannedExercises: { u1: '10分', u2: '3分', u3: '3分', u4: '3分', u5: '3分', u6: '6分', heikobo: '10/20', fumidai: '15分', stepper: '50回' }, kiou: '高血圧（見本）',
    ryui: '※ ご案内用の架空（見本）データです。', personalFile: { faceSheet: { chronicDiseases: '見本 医師', medicalInstitution: '見本クリニック', lifeHistory: '自宅での入浴が難しくなり、運動と入浴を目的に通所を開始（見本）', householdType: '高齢者のみ世帯', bikou: '（見本）' } } });
  const patients = [pat(P1, '見本 太郎', 'ミホン タロウ', '男性', '1945-05-15', '要介護2'), pat(P2, '架空 花子', 'カクウ ハナコ', '女性', '1941-09-02', '要介護1'), pat(P3, '例示 一男', 'レイジ カズオ', '男性', '1943-02-11', '要支援2')];
  const consents = { version: '2.0', termsVersion: '2.0', privacyVersion: '2.0', acceptedAt: new Date().toISOString() };
  const fit = (pid, k) => [ymd(150), ymd(60), ymd(5)].map((d, j) => ({ id: pid * 100 + j, patientId: pid, date: d, values: { height: '160', weight: String(56 + j * 0.5 + k), grip_r: String(22 + j), grip_l: String(20 + j), standup: String(10 + j), tug: String(11 - j * 0.6) } }));
  const acc = (o) => ({ consents, createdAt: new Date().toISOString(), ...o });
  return {
    systemSettings: { facilityInfo: { name: 'つむぎ デイサービス（見本）', phone: '03-0000-0000', address: '東京都（見本）', serviceTimeAM: '9:00〜16:00' } },
    patients, ticketRecords: [...recsFor(P1, '見本 太郎', 'ミホン タロウ', 0), ...recsFor(P2, '架空 花子', 'カクウ ハナコ', 2), ...recsFor(P3, '例示 一男', 'レイジ カズオ', 3)],
    fitnessRecords: [...fit(P1, 0), ...fit(P2, -6), ...fit(P3, 2)],
    monitoringRecords: [P1, P2].map((pid, j) => ({ id: `mon_${pid}`, patientId: pid, period: (() => { const d = new Date(today); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}年${d.getMonth() + 1}月`; })(), createdAt: Date.now() - 86400000 * 3, confirmed: true, status: 'final', finalizedAt: Date.now() - 86400000 * 3,
      summary: '週3回、休まず通所されています。体操への参加意欲が高く、血圧も安定して推移しています。引き続き下肢筋力の維持を目標に運動を継続します（見本）。' })),
    familyAnnouncements: [
      { id: 'news_9901', title: '秋の遠足に行ってきました（見本）', body: '近くの公園へ秋の遠足に出かけました。色づいた木々を眺めながら、皆さんで散策を楽しみました。写真をご覧ください。', date: ymd(2), postedAt: new Date(today - 2 * 864e5).toISOString(), audience: ['family', 'caremanager', 'related'], photos: photos.map((data, i) => ({ id: `ph_${i}`, data, caption: ['秋の遠足', '体操の時間', '季節の手作り'][i] })) },
      { id: 9902, title: '敬老会のご案内（見本）', body: '9月の敬老会では、皆さんで歌や手作りのお菓子を楽しみます。当日の様子は写真でお知らせします。', date: ymd(6), postedAt: new Date(today - 6 * 864e5).toISOString(), audience: ['family', 'caremanager', 'related'] },
    ],
    familyPersonalAnnouncements: [
      { id: 9911, patientId: P1, title: '次回の担当者会議のお知らせ（見本）', body: '来月10日 14時から担当者会議を予定しています。ご都合をお知らせください。', date: ymd(1), postedAt: new Date(today - 864e5).toISOString(), audience: ['family', 'caremanager'] },
    ],
    familyPhotos: [], familyInvites: [],
    familyAccounts: [
      acc({ id: 'fam_demo1', patientId: P1, username: 'mihon-family', password: 'mihon1234', kind: 'family', role: 'parent', relation: '長男', displayName: '見本 一郎', lastName: '見本', firstName: '一郎', kana: 'ミホン イチロウ', phone: '03-0000-0000', phoneMobile: '090-0000-0000', email: 'mihon@example.invalid' }),
      acc({ id: 'fam_demo2', patientId: P1, username: 'mihon-family2', password: 'mihon1234', kind: 'family', role: 'member', relation: '長女', displayName: '見本 二美', lastName: '見本', firstName: '二美', kana: 'ミホン フタミ', phoneMobile: '090-0000-0002', email: 'mihon2@example.invalid' }),
      ...[P1, P2, P3].map((pid, j) => acc({ id: `cm_demo${j + 1}`, patientId: pid, username: j === 0 ? 'mihon-cm' : `mihon-cm-${j}`, password: 'mihon1234', kind: 'caremanager', role: 'caremanager', relation: 'ケアマネージャー', displayName: '見本 ケア子', lastName: '見本', firstName: 'ケア子', kana: 'ミホン ケアコ', phone: '03-0000-0000', cmOffice: '（見本）つむぎケアプランセンター', officeName: '（見本）つむぎケアプランセンター', email: 'mihon-cm@example.invalid' })),
    ],
  };
}

const browser = await chromium.launch();
const prep = async (page) => {
  await page.goto(`${BASE}/?family`, { waitUntil: 'domcontentloaded' });
  const photos = await page.evaluate(`(${makePhotos.toString()})()`);
  await page.evaluate((d) => { localStorage.setItem('tsumugiFamilyAppData_v1', JSON.stringify(d)); sessionStorage.clear(); }, demo(photos));
};
const login = async (page, u) => {
  await prep(page);
  await page.goto(`${BASE}/?family`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(900);
  await page.locator('input[type="text"], input:not([type])').first().fill(u); await page.locator('input[type="password"]').first().fill('mihon1234');
  await page.getByRole('button', { name: /ログイン/ }).first().click(); await page.waitForTimeout(1600);
  for (let i = 0; i < 3; i++) { const cb = page.locator('input[type="checkbox"]').first(); if (await cb.isVisible().catch(() => false)) await cb.check().catch(() => {}); const btn = page.getByRole('button', { name: /同意して/ }).first(); if (await btn.isVisible().catch(() => false)) { await btn.click().catch(() => {}); await page.waitForTimeout(1000); } else break; }
  // 患者を選ぶ画面(ケアマネ複数担当)なら最初の方
  const pick = page.locator('button', { hasText: '見本 太郎' }).first(); if (await pick.isVisible().catch(() => false)) { await pick.click().catch(() => {}); await page.waitForTimeout(1200); }
};
const closeAll = async (page) => { for (let k = 0; k < 3; k++) { await page.keyboard.press('Escape').catch(() => {}); const ax = page.locator('button[aria-label="閉じる"]').last(); if (await ax.isVisible().catch(() => false)) await ax.click().catch(() => {}); const c = page.locator('button', { hasText: /^(閉じる|キャンセル)$/ }).last(); if (await c.isVisible().catch(() => false)) await c.click().catch(() => {}); await page.waitForTimeout(250); } };
const shot = async (page, name, opt = {}) => { await page.waitForTimeout(500); await page.screenshot({ path: `${OUT}/${name}.png`, ...opt }); log('ok', name); };
// 見出しの文字を持つ「カード」を撮る
const card = async (page, text, name, minW = 280) => { const ok = await page.evaluate(([text, name, minW]) => {
  const leaf = [...document.querySelectorAll('div,span,h2,h3,p,button')].find(e => e.children.length === 0 && (e.textContent || '').trim().startsWith(text) && e.getBoundingClientRect().width > 0);
  if (!leaf) return 'no-leaf'; let el = leaf; for (let i = 0; i < 9 && el.parentElement; i++) { el = el.parentElement; const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); if (r.width >= minW && (cs.borderRadius !== '0px' || cs.boxShadow !== 'none') && r.height > 80) break; }
  el.setAttribute('data-shot', name); el.scrollIntoView({ block: 'center' }); return 'ok'; }, [text, name, minW]);
  if (ok !== 'ok') { log('skip', name, ok); return false; } await page.waitForTimeout(450); await page.locator(`[data-shot="${name}"]`).screenshot({ path: `${OUT}/${name}.png` }); log('ok', name); return true; };
const clickText = async (page, re, t = 2500) => page.locator('button', { hasText: re }).first().click({ timeout: t }).then(() => true).catch(() => false);

const setPeriod3 = async (page) => { const b = page.locator('button', { hasText: /日別・1ヶ月/ }).first(); if (await b.click({ timeout: 2500 }).then(() => true).catch(() => false)) { await page.waitForTimeout(300); await page.locator('button', { hasText: /^3ヶ月$/ }).first().click().catch(() => {}); await page.waitForTimeout(900); } };
// 通所記録の見出しボタン(基本情報・今回の記録・気分…)を押して、その位置の画面を撮る
const chip = async (page, label, name, dy = 0) => { const b = page.locator('button', { hasText: new RegExp('^' + label + '$') }).first();
  if (!(await b.click({ timeout: 2500 }).then(() => true).catch(() => false))) { log('skip', name); return false; }
  await page.waitForTimeout(900); if (dy) { await page.mouse.wheel(0, dy); await page.waitForTimeout(500); } await shot(page, name); return true; };
// ---------- ご家族(スマホ) ----------
{ const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage();
  await prep(page); await page.goto(`${BASE}/?family`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(900); await shot(page, 'guide_fam_login');
  await login(page, 'mihon-family'); await setPeriod3(page);
  await shot(page, 'guide_fam_news');
  const t = page.locator('img[src^="data:image/jpeg"]').first(); if (await t.isVisible().catch(() => false)) { await t.click().catch(() => {}); await page.waitForTimeout(900); await shot(page, 'guide_fam_photo'); await closeAll(page); }
  await clickText(page, /^通所記録$/); await page.waitForTimeout(1500);
  await shot(page, 'guide_fam_record_top');
  // スマホは見出しボタンが無いので、見出しの文字までスクロールして撮る(見出しが開閉式なら開く)
  const spAt = async (text, name, dy = -8) => { const ok = await page.evaluate(([text, dy]) => { const els = [...document.querySelectorAll('div,span,h2,h3,p,button')].filter(e => e.children.length === 0 && (e.textContent || '').trim() === text && e.getBoundingClientRect().height > 0);
      const el = els[0]; if (!el) return false;
      const st = [...document.querySelectorAll('*')].find(e => { const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); return (cs.position === 'sticky' || cs.position === 'fixed') && r.top <= 1 && r.height > 120 && r.height < 500; });
      const hb = st ? st.getBoundingClientRect().height : 0;
      const y = el.getBoundingClientRect().top + window.scrollY - hb + dy; window.scrollTo(0, Math.max(0, y)); return true; }, [text, dy]);
    if (!ok) { log('skip', name); return; } await page.waitForTimeout(700);
    // 上の緑の帯(固定表示)より下だけを切り出す
    const hb = await page.evaluate(() => { const el = [...document.querySelectorAll('*')].find(e => { const cs = getComputedStyle(e); return (cs.position === 'sticky' || cs.position === 'fixed') && e.getBoundingClientRect().top <= 1 && e.getBoundingClientRect().height > 120 && e.getBoundingClientRect().height < 500; }); return el ? Math.ceil(el.getBoundingClientRect().bottom) : 0; });
    const vp = page.viewportSize(); await page.screenshot({ path: `${OUT}/${name}.png`, clip: { x: 0, y: hb, width: vp.width, height: Math.min(560, vp.height - hb) } }); log('ok', name, 'hb', hb); };
  const opens = await page.locator('text=タップで開く').count(); for (let k = 0; k < opens; k++) { await page.locator('text=タップで開く').first().click().catch(() => {}); await page.waitForTimeout(250); }
  await spAt('今回の記録', 'guide_fam_today');
  await spAt('今回の運動メニュー', 'guide_fam_exercise', -40);
  await spAt('気分トレンド（通所時/帰宅時）', 'guide_fam_mood');
  await spAt('体温（日別）', 'guide_fam_temp');
  await spAt('血圧（日別）', 'guide_fam_bp');
  await page.locator('button', { hasText: /^握力（右）$/ }).first().click().catch(() => {}); await page.waitForTimeout(500);
  await spAt('体力測定', 'guide_fam_fitness');
  await spAt('通所率', 'guide_fam_rate');
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
  for (const [re, n] of [[/家族一覧/, 'guide_fam_members'], [/利用者・登録者情報/, 'guide_fam_myinfo'], [/フェイスシート/, 'guide_fam_facesheet']]) { if (await clickText(page, re)) { await page.waitForTimeout(1000); await shot(page, n); await closeAll(page); } else log('skip', n); }
  await ctx.close(); }
// ---------- ケアマネ(パソコン) ----------
{ const ctx = await browser.newContext({ locale: 'ja-JP', timezoneId: 'Asia/Tokyo', viewport: { width: 980, height: 740 }, deviceScaleFactor: 2 }); const page = await ctx.newPage();
  await prep(page); await page.goto(`${BASE}/?family`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(900); await shot(page, 'guide_cm_login');
  await login(page, 'mihon-cm');
  // 複数の利用者を担当している状態(クラウドのアカウント情報から作られる切替一覧)を手元で再現
  await page.evaluate(() => { sessionStorage.setItem('familyLinkedAccounts', JSON.stringify([990001, 990002, 990003].map((pid, j) => ({ id: `cm_demo${j + 1}`, patientId: pid, storeId: null, patientName: ['見本 太郎', '架空 花子', '例示 一男'][j], facilityName: 'つむぎ デイサービス（見本）', relation: 'ケアマネージャー' })))); });
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1500); await setPeriod3(page);
  await shot(page, 'guide_cm_home');
  await clickText(page, /^通所記録$/); await page.waitForTimeout(1500);
  await shot(page, 'guide_cm_record_top');
  for (const [l, n] of [['今回の記録', 'guide_cm_today'], ['通所', 'guide_cm_rate'], ['気分', 'guide_cm_mood'], ['バイタルトレンド', 'guide_cm_vital'], ['体力測定', 'guide_cm_fitness'], ['モニタリング', 'guide_cm_monitoring'], ['詳細記録', 'guide_cm_detail']]) await chip(page, l, n);
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
  for (const [re, n] of [[/保険証・アセスメント/, 'guide_cm_docs'], [/フェイスシート/, 'guide_cm_facesheet'], [/関係者一覧/, 'guide_cm_related']]) { if (await clickText(page, re)) { await page.waitForTimeout(1100); await shot(page, n); await closeAll(page); } else log('skip', n); }
  if (await clickText(page, /利用者切替/)) { await page.waitForTimeout(1200); await shot(page, 'guide_cm_switch'); } else log('skip', 'guide_cm_switch');
  await ctx.close(); }
await browser.close(); log('done');
