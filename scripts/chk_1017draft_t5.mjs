import { chromium, devices } from 'playwright';
const b = await chromium.launch();
for (const [label, dev] of [['pc', { viewport: { width: 1280, height: 800 } }], ['phone', devices['iPhone 13']]]) {
  const ctx = await b.newContext({ ...dev, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const page = await ctx.newPage();
  page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.goto('http://localhost:4175/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  const today = new Date(); const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const pid = await page.evaluate((iso) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); const p = d.patients.find(x => x.status === '利用中');
    p.personalFile = { ...(p.personalFile || {}), meetings: [{ id: 'm1', date: iso, dateLabel: 'x', dayOfWeek: '土', timeStart: '', timeEnd: '', location: '事業所', attendees: 'ご本人', reason: '', content: '' }] };
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); Object.keys(localStorage).filter(k => k.startsWith('tsumugi_meet_draft')).forEach(k => localStorage.removeItem(k)); sessionStorage.removeItem('tsumugi_resume_meeting_float'); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, t: Date.now() })); return p.id; }, iso);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
  // 送迎表を見ながら小窓で入力(未保存のまま)
  await page.evaluate((pid) => window.dispatchEvent(new CustomEvent('tsumugi-meeting-float', { detail: { patientId: pid, meetingId: 'm1' } })), pid); await page.waitForTimeout(800);
  const fl = page.getByTestId('meeting-float'); await fl.locator('textarea').last().fill('再読み込みの前に打った内容'); await fl.locator('input[type=checkbox]').nth(1).check(); await page.waitForTimeout(300);
  // ブラウザの再読み込み(更新ボタンは押さない)
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(3000); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 300 }).catch(() => {});
  const viewOk = await page.evaluate(() => !!document.querySelector('[data-testid="tp-copy-prev"], [data-testid="tp-fb-grid"], [data-testid="tp-edit-grid"]') || /送迎表/.test(document.querySelector('h1,header')?.innerText || ''));
  console.log(label, 'back to transport', viewOk, '| float', await fl.count(), '| content', JSON.stringify(await fl.locator('textarea').last().inputValue().catch(() => '-')), '| checks', await fl.locator('input[type=checkbox]:checked').count(), '| unsaved mark', await fl.locator('text=未保存の変更があります').count());
  const recContent = await page.evaluate((pid) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); return d.patients.find(p => p.id === pid).personalFile.meetings[0].content; }, pid);
  console.log(label, 'record still empty (not yet saved)', JSON.stringify(recContent));
  // 保存 → 控えが消える → 再読み込みしても保存済みの内容
  await fl.locator('button', { hasText: /^保存$/ }).click(); await page.waitForTimeout(500);
  console.log(label, 'draft key cleared', await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('tsumugi_meet_draft')).length === 0));
  await page.getByTestId('meeting-float-close').click(); await page.waitForTimeout(300);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
  console.log(label, 'after close+reload float', await fl.count());
  await ctx.close();
}
await b.close();
