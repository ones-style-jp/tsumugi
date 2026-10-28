// 2026-10-28 ホーム画面に追加したアプリ(iPhone/iPad)では、特記のマイクを押すと音声認識を試さず、その行の特記の欄にキーボードを出して
//   「キーボードのマイクのキーを押して話してください」と上に出す。ふつうのブラウザでは今までどおり音声認識を始める
//   (ホーム画面のアプリは html.tsu-ios-app を付けて再現する・音声認識は偽物で start の回数を数える)
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4173'; })();
const b = await chromium.launch(); const r = {};
const fakeSR = () => { window.__srStarts = 0; window.SpeechRecognition = window.webkitSpeechRecognition = class { start() { window.__srStarts++; setTimeout(() => { this.onend && this.onend(); }, 50); } stop() {} abort() {} }; };
async function open(viewport, iosApp) {
  const ctx = await b.newContext({ viewport, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', hasTouch: viewport.width < 500 }); await ctx.addInitScript(fakeSR);
  if (iosApp) await ctx.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => document.documentElement.classList.add('tsu-ios-app')); });
  const page = await ctx.newPage(); page.on('dialog', d => d.accept()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  if (await page.getByText('担当者を選択', { exact: false }).count()) { await page.locator('button', { hasText: /見本|例示|架空/ }).first().click().catch(() => {}); await page.waitForTimeout(800); }
  await page.evaluate(() => sessionStorage.setItem('tsumugi_resume_view', JSON.stringify({ view: 'record', pid: null, t: Date.now() }))); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
  await page.locator('button:visible', { hasText: /^あとで$/ }).first().click({ timeout: 500 }).catch(() => {});
  return page;
}
const tap = async (page, sel) => { const mic = page.locator(sel).first(); await mic.scrollIntoViewIfNeeded(); const tid = await mic.getAttribute('data-testid'); await mic.click(); await page.waitForTimeout(400); return tid; };
const state = (page, tid) => page.evaluate((tid) => { const ae = document.activeElement; const pid = tid.replace(/^.*-mic-/, ''); const row = ae && ae.closest('[data-rv-pid]'); const msg = document.querySelector(`[data-testid="${tid}-msg"]`);
  return { tag: ae && ae.tagName, samePid: !!row && row.getAttribute('data-rv-pid') === pid, starts: window.__srStarts, msg: msg ? msg.innerText : '', msgTop: msg ? msg.getBoundingClientRect().top : -1 }; }, tid);
// iPad 横・ホーム画面のアプリ
{ const page = await open({ width: 1180, height: 820 }, true); const tid = await tap(page, '[data-testid^="rv-tokki-mic-"]:visible'); const s = await state(page, tid);
  r.ipadFocus = s.tag === 'TEXTAREA' || s.tag === 'INPUT'; r.ipadSameRow = s.samePid; r.ipadNoSR = s.starts === 0; r.ipadMsg = /キーボードのマイク/.test(s.msg) && s.msgTop >= 0 && s.msgTop < 200; if (!(r.ipadFocus && r.ipadSameRow && r.ipadNoSR && r.ipadMsg)) console.log('IPAD', tid, s);
  await page.context().close(); }
// スマホ(カード)・ホーム画面のアプリ
{ const page = await open({ width: 390, height: 844 }, true); const n = await page.locator('[data-testid^="rv-ctokki-mic-"]:visible').count();
  if (n) { const tid = await tap(page, '[data-testid^="rv-ctokki-mic-"]:visible'); const s = await state(page, tid); r.phoneFocus = (s.tag === 'TEXTAREA' || s.tag === 'INPUT') && s.starts === 0 && /キーボードのマイク/.test(s.msg); if (!r.phoneFocus) console.log('PHONE', tid, s); }
  else { const tid = await tap(page, '[data-testid^="rv-tokki-mic-"]:visible'); const s = await state(page, tid); r.phoneFocus = (s.tag === 'TEXTAREA' || s.tag === 'INPUT') && s.starts === 0; if (!r.phoneFocus) console.log('PHONE(table)', tid, s); }
  await page.context().close(); }
// ふつうのブラウザ: 今までどおり音声認識を始める
{ const page = await open({ width: 1180, height: 820 }, false); const tid = await tap(page, '[data-testid^="rv-tokki-mic-"]:visible'); const s = await state(page, tid); r.browserStartsSR = s.starts === 1 && !/キーボードのマイク/.test(s.msg); if (!r.browserStartsSR) console.log('BROWSER', s);
  await page.context().close(); }
await b.close();
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); process.exit(Object.values(r).every(Boolean) ? 0 : 1);
