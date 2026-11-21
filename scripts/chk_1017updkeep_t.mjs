import { chromium, devices } from 'playwright';
const OUT = '/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad';
const b = await chromium.launch();
for (const [label, dev] of [['pc', { viewport: { width: 1280, height: 800 } }], ['phone', devices['iPhone 13']]]) {
  const ctx = await b.newContext({ ...dev, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage();
  page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.goto('http://localhost:4185/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  const today = new Date(); const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const pid = await page.evaluate((iso) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const p = d.patients.find(x => x.status === '利用中');
    p.personalFile = { ...(p.personalFile || {}), meetings: [{ id: 'm1', date: iso, dateLabel: '令和8年10月17日', dayOfWeek: '土', timeStart: '', timeEnd: '', location: '事業所', attendees: 'ご本人', reason: '', content: '' }] };
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'dashboard', pid: null, t: Date.now() })); return p.id; }, iso);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
  // 小窓を開いて入力(未保存)
  await page.evaluate((pid) => window.dispatchEvent(new CustomEvent('tsumugi-meeting-float', { detail: { patientId: pid, meetingId: 'm1' } })), pid); await page.waitForTimeout(800);
  const fl = page.getByTestId('meeting-float'); const ta = fl.locator('textarea').last(); await ta.fill('更新の直前に打った内容'); await page.waitForTimeout(200);
  // 「今すぐ更新」と同じ合図 → 保存される・控えが置かれる
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('tsumugi-before-update'))); await page.waitForTimeout(500);
  const saved = await page.evaluate((pid) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); return d.patients.find(p => p.id === pid).personalFile.meetings[0].content; }, pid);
  const resume = await page.evaluate(() => sessionStorage.getItem('tsumugi_resume_meeting_float'));
  console.log(label, 'saved content', JSON.stringify(saved), 'resume', !!resume);
  // 再読込(更新後) → 小窓が開き直す・内容が残る
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(3000); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
  console.log(label, 'float after reload', await fl.count(), 'content', JSON.stringify(await fl.locator('textarea').last().inputValue().catch(() => '-')));
  // 保存のポップが1行・提供記録の赤い知らせの「閉じる」が1行
  await fl.locator('button', { hasText: /^保存$/ }).click(); await page.waitForTimeout(300);
  console.log(label, 'pop', JSON.stringify(await page.evaluate(() => { const el = document.getElementById('tsu-pop-notice'); const r = el.getBoundingClientRect(); return { h: Math.round(r.height), w: Math.round(r.width), lh: getComputedStyle(el).lineHeight, fs: getComputedStyle(el).fontSize, ws: getComputedStyle(el).whiteSpace, text: el.textContent, inView: r.left >= 0 && r.right <= innerWidth }; })));
  await page.getByTestId('meeting-float-close').click(); await page.waitForTimeout(300);
  if (label === 'phone') { await page.screenshot({ path: `${OUT}/updkeep_phone.png` }); }
  await ctx.close();
}
await b.close();
