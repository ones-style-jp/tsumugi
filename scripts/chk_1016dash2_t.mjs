import { chromium } from 'playwright';
const TOUCH = process.argv.includes('--ipad');
const b = await chromium.launch(); const page = await (await b.newContext(TOUCH ? { viewport: { width: 1080, height: 810 }, hasTouch: true, isMobile: false, userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', locale: 'ja-JP', timezoneId: 'Asia/Tokyo' } : { viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })).newPage();
page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
const today = new Date(); const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
await page.goto('http://localhost:4185/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
let id;
const seed = async () => {
  id = await page.evaluate((iso) => { const d = JSON.parse(localStorage.getItem('daycareAppData_v3')); d.diarySettings.cars = [{ id: 'cK', name: 'タント', type: '', cap: '3' }];
    const act = d.patients.filter(p => p.status === '利用中').slice(0, 2); const dow = new Date(iso).getDay(); act.forEach(p => { const s = ['', '', '', '', '', '', '']; s[dow] = 'AM'; p.scheduleAmPm = s; });
    d.transportPlans = { [`${iso}_AM`]: { cars: { cK: [{ pid: act[0].id, t: '8:35' }, { pid: act[1].id, t: '8時　分' }] }, walkers: [], others: [], un: [], driver: {}, _savedAt: Date.now() } };
    localStorage.setItem('daycareAppData_v3', JSON.stringify(d)); sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'transport', pid: null, t: Date.now() })); return act[1].id; }, iso);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500); await page.locator('button', { hasText: 'あとで' }).click({ timeout: 400 }).catch(() => {});
};
const fld = () => page.locator(`[data-tpdrop="cK"][data-tpiso="${iso}"][data-tpslot="AM"]`).getByTestId(`tp-time-${id}`);
const clickAt = async (part) => { await fld().scrollIntoViewIfNeeded(); const bb = await fld().boundingBox(); const cx = bb.x + bb.width / 2; const k = bb.width / 58; const px = part === 'hour' ? cx - 11 * k : cx + 9 * k, py = bb.y + bb.height / 2; if (TOUCH) await page.touchscreen.tap(px, py); else await page.mouse.click(px, py); await page.waitForTimeout(150); };
const state = async () => fld().evaluate(el => ({ v: el.value, s: el.selectionStart, e: el.selectionEnd, f: document.activeElement === el }));
const out = async (label) => { await page.locator('h1,h2').first().click({ force: true }).catch(() => {}); if (TOUCH) await page.touchscreen.tap(5, 800); else await page.mouse.click(5, 880); await page.waitForTimeout(400); console.log(label, '→', await fld().inputValue()); };
// 1 分の側を押す → 8: のあと 45
await seed(); console.log('before', await fld().inputValue());
await clickAt('min'); console.log('min click', JSON.stringify(await state()));
await page.keyboard.type('45'); console.log('typed 45', JSON.stringify(await state())); await out('A 分に45');
// 2 何も打たずに離れる
await seed(); await clickAt('min'); await out('B 何もせず');
// 3 時を押す → 選ばれている → 9 → 9: → 30
await seed(); await clickAt('hour'); console.log('hour click', JSON.stringify(await state()));
await page.keyboard.type('9'); console.log('typed 9', JSON.stringify(await state()));
await page.keyboard.type('30'); await out('C 時9→分30');
// 4 時だけ直す
await seed(); await clickAt('hour'); await page.keyboard.type('9'); await out('D 時だけ9');
// 5 分の側で 845 と全部打つ
await seed(); await clickAt('min'); await page.keyboard.type('845'); await out('E 845');
// 6 時を押して 10 → 10: → 15
await seed(); await clickAt('hour'); await page.keyboard.type('1'); console.log('typed 1', JSON.stringify(await state())); await page.keyboard.type('0'); console.log('typed 10', JSON.stringify(await state())); await page.keyboard.type('15'); await out('F 10:15');
// 7 キーボードで入る(押した位置なし) → 分の側
await seed(); await fld().scrollIntoViewIfNeeded(); await fld().focus(); await page.waitForTimeout(200); console.log('focus only', JSON.stringify(await state())); await page.keyboard.type('05'); await out('H 8:05');
// 8 分の側で入ったあと、もう一度 時を押す → 時を選ぶ
await seed(); await clickAt('min'); await page.waitForTimeout(800); await clickAt('hour'); console.log('min→hour', JSON.stringify(await state())); await page.keyboard.type('7'); await page.keyboard.type('50'); await out('G 7:50');
// 9 ふつうの欄(8:35)は従来どおり
await seed(); const n1 = page.locator(`[data-tpdrop="cK"][data-tpiso="${iso}"][data-tpslot="AM"] input[data-testid^="tp-time-"]`).first(); await n1.scrollIntoViewIfNeeded(); await n1.click(); await page.waitForTimeout(150); console.log('normal', await n1.inputValue());
await b.close();
