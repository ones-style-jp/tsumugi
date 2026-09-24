// つむぎ マニュアル用スクリーンショット自動撮影 (2026-09-23)
//
// 目的: マニュアル(public/manual-*.html)の画像を、実際の画面から機械的に撮り直せるようにする。
//       機能を追加・変更したら、これを再実行して画像を更新する(手作業のイラスト差し替えをやめる)。
//
// 前提: デモ版(VITE_E2E_DEMO=1・Supabase無し・ログイン不要・架空データ)をビルドして 4173 で配信しておく。
//   1) VITE_E2E_DEMO=1 npm run build
//   2) npm run preview -- --port 4173 --strictPort   (または python3 -m http.server 4173 -d dist)
//   3) node scripts/manual_shots.mjs [--base http://localhost:4173] [--out public/manual/img] [--only staff|family|cm]
//
// 出力: public/manual/img/<key>.jpg (1366×900 のPC画面、家族向けはスマホ幅 390×844 も)
//       マニュアルHTMLからは <img src="/manual/img/<key>.jpg"> で参照する。
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://localhost:4173');
const OUT = arg('--out', 'public/manual/img');
const ONLY = arg('--only', '');
fs.mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log('[shots]', ...a);
const shot = async (page, key, opts = {}) => {
  const file = path.join(OUT, `${key}.jpg`);
  await page.waitForTimeout(opts.wait ?? 500);
  await page.screenshot({ path: file, type: 'jpeg', quality: 82, fullPage: !!opts.fullPage, clip: opts.clip });
  log('saved', file);
};
const clickText = async (page, text, opts = {}) => {
  const loc = page.getByText(text, { exact: opts.exact !== false }).first();
  await loc.waitFor({ state: 'visible', timeout: opts.timeout ?? 15000 });
  await loc.click();
};
const tryClick = async (page, text, opts = {}) => { try { await clickText(page, text, { ...opts, timeout: opts.timeout ?? 4000 }); return true; } catch { return false; } };

// ---------- 家族・ケアマネ向け: 架空データ(管理者プレビューと同じ「見本 太郎」) ----------
const FAM_LS_KEY = 'tsumugiFamilyAppData_v1';
function demoFamilyData() {
  const YEAR = 2026; const dows = ['日','月','火','水','木','金','土'];
  const days = [2,4,6,9,11,13,16,18,20,23];
  const moods = ['good','excellent','normal','good','bad','normal','good','excellent','normal','good'];
  const moodsDep = ['excellent','good','good','normal','good','good','excellent','good','good','excellent'];
  const temps = ['36.4','36.6','36.3','36.5','36.7','36.4','36.5','36.6','36.3','36.5'];
  const bpUpS = [128,132,124,130,138,126,129,134,122,131], bpDnS=[78,80,74,79,84,76,77,81,73,79], plS=[68,72,66,70,75,67,69,73,65,71];
  const bpUpE = [120,124,118,122,128,119,121,125,116,123], bpDnE=[72,75,70,73,78,71,72,76,69,74], plE=[64,68,62,66,70,63,65,69,61,67];
  const PID = 990001;
  const records = days.map((d,i) => ({
    id: 9900000 + i, patientId: PID, name: '見本 太郎', kana: 'みほん たろう',
    date: `6月${d}日`, year: YEAR, dayOfWeek: dows[new Date(YEAR,5,d).getDay()], status: '出席',
    temp: temps[i], bpUpSt: String(bpUpS[i]), bpDnSt: String(bpDnS[i]), plSt: String(plS[i]),
    bpUpEn: String(bpUpE[i]), bpDnEn: String(bpDnE[i]), plEn: String(plE[i]),
    massage: '見本 職員', exercises: { u1:'10分', u2:'3分', u3:'3分', u4:'3分', u5:'3分', u6:'6分', heikobo:'10/20', fumidai:'15分', stepper:'50回' },
    tokki: i===4 ? 'お変わりなくお過ごしです（見本）' : '', kibunArrival: moods[i], kibunDeparture: moodsDep[i], _savedAt: Date.now(),
  }));
  const patient = {
    id: PID, name: '見本 太郎', kana: 'みほん たろう', status: '利用中', gender: '男性',
    birthDate: '1945-05-15', careLevel: '要介護2', startDate: '2024-04-01', endDate: '',
    scheduleAmPm: ['','','1日','','','1日',''], phone: '03-0000-0000', address: '東京都（見本）1-2-3',
    cmOffice: '（見本）つむぎケアプランセンター', cmName: '見本 ケア子', cmPhone: '03-0000-0000', cmFax: '03-0000-0001',
    plannedExercises: { u1:'10分', u2:'3分', u3:'3分', u4:'3分', u5:'3分', u6:'6分', heikobo:'10/20', fumidai:'15分', stepper:'50回' },
    ryui: '※ これはマニュアル用の架空（見本）データです。実在の利用者ではありません。',
    faceSheet: { adlLevel: 'A1', dementiaLevel: 'Ⅰ' },
  };
  const consents = { version: '2.0', termsVersion: '2.0', privacyVersion: '2.0', acceptedAt: '2026-07-10T00:00:00.000Z' };
  return {
    systemSettings: { facilityInfo: { name: 'つむぎ デイサービス（見本）', phone: '03-0000-0000', address: '東京都（見本）' } },
    patients: [patient], ticketRecords: records,
    familyAnnouncements: [
      { id: 9901, title: '夏祭りを開催します（見本）', body: 'これはマニュアル用の架空のお知らせです。7月の夏祭りについてご案内します。', date: `${YEAR}-06-20`, postedAt: `${YEAR}-06-20T09:00:00.000Z`, audience: ['family','caremanager','related'] },
    ],
    familyPersonalAnnouncements: [
      { id: 9911, patientId: PID, title: '次回の担当者会議のお知らせ（見本）', body: '7月10日 14時から担当者会議を予定しています。', date: `${YEAR}-06-22`, postedAt: `${YEAR}-06-22T09:00:00.000Z`, audience: ['family','caremanager'] },
    ],
    familyPhotos: [],
    familyInvites: [ { id: 'inv_demo', code: 'DEMO1234', patientId: PID, storeId: null, createdAt: '2026-06-01T00:00:00.000Z', createdByAccountId: null, usedBy: null, usedAt: null, email: '', relation: '', expiresAt: '2099-12-31T00:00:00.000Z' } ],
    familyAccounts: [
      { id: 'fam_demo1', patientId: PID, username: 'mihon-family', password: 'mihon1234', kind: 'family', role: 'parent', relation: '長男', displayName: '見本 一郎', lastName: '見本', firstName: '一郎', kana: 'みほん いちろう', kanaLast: 'みほん', kanaFirst: 'いちろう', phone: '03-0000-0000', phoneMobile: '090-0000-0000', email: 'mihon@example.com', createdAt: '2026-06-01', consents },
      { id: 'cm_demo1', patientId: PID, username: 'mihon-cm', password: 'mihon1234', kind: 'caremanager', role: 'caremanager', relation: 'ケアマネージャー', displayName: '見本 ケア子', lastName: '見本', firstName: 'ケア子', kana: 'みほん けあこ', kanaLast: 'みほん', kanaFirst: 'けあこ', phone: '03-0000-0000', phoneMobile: '', cmOffice: '（見本）つむぎケアプランセンター', officePhone: '03-0000-0000', officeFax: '03-0000-0001', email: 'mihon-cm@example.com', createdAt: '2026-06-01', consents },
    ],
  };
}

async function familyLogin(page, username, password) {
  await page.goto(`${BASE}/?family`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((d) => { localStorage.setItem('tsumugiFamilyAppData_v1', JSON.stringify(d)); sessionStorage.clear(); }, demoFamilyData());
  await page.goto(`${BASE}/?family`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  const user = page.locator('input[type="text"], input:not([type])').first();
  const pw = page.locator('input[type="password"]').first();
  await user.fill(username); await pw.fill(password);
  await page.getByRole('button', { name: /ログイン/ }).first().click();
  await page.waitForTimeout(1500);
  // 同意ゲート(規約改定)が出たら、チェックを入れて「同意して進む」
  for (let i = 0; i < 2; i++) {
    const cb = page.locator('input[type="checkbox"]').first();
    if (await cb.isVisible().catch(() => false)) { await cb.check().catch(() => {}); }
    const btn = page.getByRole('button', { name: /同意して進む/ }).first();
    if (await btn.isVisible().catch(() => false)) { await btn.click().catch(() => {}); await page.waitForTimeout(1000); } else break;
  }
}

// ---------- 事業所(スタッフ)向け ----------
async function staffShots(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1.5, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.getByText('利用者マスタ管理', { exact: true }).first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(1200);
  await shot(page, 'staff_home');
  const nav = async (label, group) => {
    const item = page.getByText(label, { exact: true }).first();
    if (group && !(await item.isVisible().catch(() => false))) {
      const g = page.getByText(group, { exact: true }).first();
      if (await g.isVisible().catch(() => false)) { await g.click(); await page.waitForTimeout(300); }
    }
    await clickText(page, label);
    await page.waitForTimeout(700);
  };
  const views = [
    ['カレンダー', null, 'staff_schedule'],
    ['サービス提供記録 入力', null, 'staff_record'],
    ['連絡帳', null, 'staff_renraku'],
    ['日誌', null, 'staff_diary'],
    ['送迎表', null, 'staff_transport'],
    ['体力測定', null, 'staff_fitness'],
    ['休み連絡', '連絡（FAX）', 'staff_absence_fax'],
    ['各種連絡', '連絡（FAX）', 'staff_general_fax'],
    ['勤務表', '実績・モニタリング', 'staff_roster'],
    ['利用者実績', '実績・モニタリング', 'staff_jisseki'],
    ['モニタリング', '実績・モニタリング', 'staff_monitoring'],
    ['利用者マスタ管理', null, 'staff_master'],
    ['ケアマネ事業所・担当者', null, 'staff_cmmaster'],
    ['個人（バイタル・記録）', '分析', 'staff_dash_personal'],
    ['稼働（実績・月次）', '分析', 'staff_dash_operation'],
    ['お知らせ・閲覧管理', null, 'staff_family_admin'],
    ['災害時', null, 'staff_emergency'],
    ['各種設定', null, 'staff_settings'],
  ];
  for (const [label, group, key] of views) {
    try { await nav(label, group); await shot(page, key); } catch (e) { log('skip', key, String(e.message || e).slice(0, 80)); }
  }
  // 各種設定のタブ
  try {
    await nav('各種設定');
    for (const [tab, key] of [['事業所情報','staff_settings_facility'],['LIFE連携','staff_settings_life'],['サービス提供内容','staff_settings_record'],['日誌','staff_settings_diary'],['体力測定','staff_settings_fitness'],['気分の理由','staff_settings_kibun'],['アドオン','staff_settings_addon'],['システム','staff_settings_system'],['ケアマネ事業所・担当者','staff_settings_cm']]) {
      if (await tryClick(page, tab)) await shot(page, key);
    }
  } catch (e) { log('settings tabs skipped', e.message); }
  // 利用者マスタ: 1人目を開く
  try {
    await nav('利用者マスタ管理');
    if (await tryClick(page, '例示 花子', { exact: false })) {
      await page.waitForTimeout(800); await shot(page, 'staff_master_detail');
      // ※ 「個人ファイル」はモーダルを開くので最後に撮り、Escape で閉じる(閉じ忘れると以降のクリックが全て失敗する)
      for (const [tab, key] of [['サービス提供内容','staff_master_service'],['月間スケジュール','staff_master_monthly'],['変更履歴','staff_master_history'],['基本情報','staff_master_basic'],['個人ファイル','staff_master_file']]) {
        if (await tryClick(page, tab, { timeout: 2500 })) { await page.waitForTimeout(600); await shot(page, key); }
      }
      // 個人ファイルモーダルは Escape では閉じない → 右上の × (lucide X アイコン) を押す
      try { const xb = page.locator('button:has(svg.lucide-x)').last(); if (await xb.isVisible().catch(() => false)) await xb.click(); } catch {}
      await page.keyboard.press('Escape'); await page.waitForTimeout(500);
      // ★ ご家族のアカウント発行は 利用者マスタ→「アカウント管理」(2026-09-24 資料用)
      try {
        if (await tryClick(page, 'アカウント管理', { timeout: 2500 })) {
          await page.waitForTimeout(900); await shot(page, 'staff_master_account');
          try { const xb = page.locator('button:has(svg.lucide-x)').last(); if (await xb.isVisible().catch(() => false)) await xb.click(); } catch {}
          await page.keyboard.press('Escape'); await page.waitForTimeout(400);
        }
      } catch (e) { log('master account skipped', e.message); }
      // ★ 基本利用曜日の変更モーダル(案内つき)・月間スケジュールのハイライト・変更履歴一覧(2026-09-23)
      try {
        const okTab = await tryClick(page, 'サービス提供内容', { timeout: 2500 });
        if (!okTab) log('sched: サービス提供内容 タブが押せない');
        if (okTab) {
          await page.waitForTimeout(500);
          const daySel = page.locator('select:has(option[value="AM"]):has(option[value="PM"])');
          const openModal = async () => {
            const n = await daySel.count();
            for (let i = 0; i < n; i++) { const v = await daySel.nth(i).inputValue(); if (v !== 'PM') { await daySel.nth(i).selectOption('PM'); return true; } }
            return false;
          };
          if (await openModal()) {
            await page.waitForTimeout(500); await shot(page, 'staff_master_sched_modal');
            if (await tryClick(page, /月間スケジュールへ移動する/, { exact: false, timeout: 2500 })) { await page.waitForTimeout(900); await shot(page, 'staff_master_monthly_hl'); }
            await page.waitForTimeout(6500); // ハイライト消灯を待つ
            if (await openModal()) {
              await page.waitForTimeout(400);
              await tryClick(page, '今日から（すぐ反映）', { timeout: 2500 });
              if (await tryClick(page, '適用する', { timeout: 2500 })) {
                await page.waitForTimeout(900);
                const hist = page.getByText('基本利用曜日の変更履歴', { exact: false }).first();
                try { await hist.scrollIntoViewIfNeeded(); } catch {}
                await shot(page, 'staff_master_sched_history');
              }
            }
          }
        }
      } catch (e) { log('sched modal skipped', e.message); }
    }
  } catch (e) { log('master detail skipped', e.message); }
  // ケアマネ担当者の招待メール(担当者カードの拡大)と「担当者を追加」ポップアップ (2026-09-24 資料用)
  try {
    await nav('ケアマネ事業所・担当者');
    const inv = page.getByText(/招待メール/).first();
    if (await inv.isVisible().catch(() => false)) {
      const card = inv.locator('xpath=ancestor::div[3]');
      await card.screenshot({ path: path.join(OUT, 'staff_cm_invite.jpg'), type: 'jpeg', quality: 82 }); log('saved staff_cm_invite');
    }
    if (await tryClick(page, /担当者を追加/, { exact: false, timeout: 2500 })) { await page.waitForTimeout(600); await shot(page, 'staff_cm_add_person'); await tryClick(page, 'キャンセル', { timeout: 2000 }); }
  } catch (e) { log('cm invite skipped', e.message); }
  // 提供記録入力: 状態モーダル(出席セルをタップ)
  try {
    await nav('サービス提供記録 入力');
    const cell = page.getByText('出席', { exact: true }).first();
    if (await cell.isVisible().catch(() => false)) { await cell.click(); await page.waitForTimeout(600); await shot(page, 'staff_record_status'); await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
  } catch (e) { log('record status skipped', e.message); }
  // お知らせ・閲覧管理: 招待/投稿
  try {
    await nav('お知らせ・閲覧管理');
    if (await tryClick(page, /招待/, { exact: false, timeout: 2500 })) { await page.waitForTimeout(600); await shot(page, 'staff_family_admin_invite'); await page.keyboard.press('Escape'); }
  } catch (e) { log('family admin invite skipped', e.message); }
  // 災害時のタブ
  try {
    await nav('災害時');
    for (const [tab, key] of [['緊急連絡（メール・お知らせ）','staff_emergency_notice'],['避難場所・ハザードマップ','staff_emergency_evac'],['備蓄','staff_emergency_stock'],['安否・連絡先一覧','staff_emergency_safety']]) {
      if (await tryClick(page, tab)) await shot(page, key);
    }
  } catch (e) { log('emergency tabs skipped', e.message); }
  await ctx.close();
}

// ---------- ご家族向け ----------
async function familyShots(browser, kind) {
  const isCm = kind === 'cm';
  const ctxs = isCm
    ? [['pc', { viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1.5 }]]
    : [['sp', { ...devices['iPhone 13'], locale: 'ja-JP' }], ['pc', { viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1.5 }]];
  for (const [tag, opt] of ctxs) {
    const ctx = await browser.newContext({ locale: 'ja-JP', timezoneId: 'Asia/Tokyo', ...opt });
    const page = await ctx.newPage();
    const pre = `${isCm ? 'cm' : 'family'}_${tag}`;
    await page.goto(`${BASE}/?family`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((d) => { localStorage.setItem('tsumugiFamilyAppData_v1', JSON.stringify(d)); sessionStorage.clear(); }, demoFamilyData());
    await page.goto(`${BASE}/?family`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    await shot(page, `${pre}_login`);
    // 招待URLからの新規登録画面
    await page.goto(`${BASE}/?family&invite=DEMO1234`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    await shot(page, `${pre}_signup`);
    await shot(page, `${pre}_signup_full`, { fullPage: true });
    await familyLogin(page, isCm ? 'mihon-cm' : 'mihon-family', 'mihon1234');
    await shot(page, `${pre}_home`);
    await shot(page, `${pre}_home_full`, { fullPage: true });
    // 主なタブ・ボタン(存在するものだけ)
    for (const [t, key] of [['お知らせ', 'notice'], ['写真', 'photo'], ['グラフ', 'graph'], ['記録', 'record'], ['ご自身の情報', 'myinfo'], ['ご家族を追加', 'invite'], ['書類', 'docs'], ['フェイスシート', 'facesheet']]) {
      if (await tryClick(page, t, { exact: false, timeout: 1500 })) { await shot(page, `${pre}_${key}`); }
    }
    await ctx.close();
  }
}

const browser = await chromium.launch();
try {
  if (!ONLY || ONLY === 'staff') await staffShots(browser);
  if (!ONLY || ONLY === 'family') await familyShots(browser, 'family');
  if (!ONLY || ONLY === 'cm') await familyShots(browser, 'cm');
} finally { await browser.close(); }
log('done');
