// 2026-11-01 段階4「本部も1人1アカウント」: 管理局の「本部のアカウント」パネル(API は模擬・見本ビルドの #hqaccounts)
//   ①一覧(あなた・メール未登録の注意・停止中) ②追加フォームの入力チェック(メール必須・ID・パスワード) ③作成 → 一覧に増える・案内文 ④止める(自分には出ない)→停止中・復帰
//   実行: node scripts/chk_1101hqaccounts.mjs [--port 4175]
import { chromium } from 'playwright';
const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '4175'; })();
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1100, height: 900 }, locale: 'ja-JP' })).newPage();
page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 160))); page.on('dialog', d => d.accept());
let accounts = [
  { id: 'h1', username: 'honbu_a', name: '見本 本部', email: 'a@example.com', is_active: true, last_login: '2026-11-01T00:00:00Z', me: true },
  { id: 'h2', username: 'honbu_b', name: '見本 次郎', email: '', is_active: true, last_login: null, me: false },
];
const calls = [];
await page.route('**/api/staff-auth', async (route) => { const body = JSON.parse(route.request().postData() || '{}'); calls.push(body);
  const ok = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
  if (body.action === 'hq_list') return ok({ accounts });
  if (body.action === 'hq_create') { if (body.username === 'taken') return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'このログインIDは既に使われています' }) });
    accounts = [...accounts, { id: 'h3', username: body.username, name: `${body.last_name} ${body.first_name}`.trim(), email: body.email, is_active: true, last_login: null, me: false }]; return ok({ ok: true, accounts }); }
  if (body.action === 'hq_set_active') { accounts = accounts.map(a => a.id === body.staff_id ? { ...a, is_active: body.active } : a); return ok({ ok: true, accounts }); }
  return route.fulfill({ status: 400, contentType: 'application/json', body: '{}' }); });
await page.goto(`http://localhost:${PORT}/#hqaccounts`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
const r = {}; const panel = () => page.getByTestId('hq-accounts').innerText();
r.list = /見本 本部/.test(await panel()) && /あなた/.test(await panel()) && /メール未登録/.test(await panel());
r.noSelfStop = (await page.getByTestId('hq-acct-honbu_a').locator('button').count()) === 0 && (await page.getByTestId('hq-acct-honbu_b').locator('button', { hasText: '止める' }).count()) === 1;
await page.getByTestId('hq-acct-add').click(); await page.waitForTimeout(300);
const inp = (ph) => page.locator(`[data-testid="hq-acct-form"] input[placeholder="${ph}"]`).first();
await page.getByTestId('hq-acct-save').click(); await page.waitForTimeout(200); r.vName = /姓/.test(await page.getByTestId('hq-acct-msg').innerText());
await inp('例: 見本').fill('試作'); await inp('例: 太郎').fill('三郎'); await page.getByTestId('hq-acct-save').click(); await page.waitForTimeout(200); r.vMail = /メールアドレス/.test(await page.getByTestId('hq-acct-msg').innerText());
await inp('name@example.com').fill('c@example.com'); await inp('4文字以上の半角英数字').fill('ab'); await page.getByTestId('hq-acct-save').click(); await page.waitForTimeout(200); r.vUser = /4文字以上/.test(await page.getByTestId('hq-acct-msg').innerText());
await inp('4文字以上の半角英数字').fill('taken'); await inp('本人が後で変えられます').fill('Pass12345'); await page.getByTestId('hq-acct-save').click(); await page.waitForTimeout(400); r.dup = /既に使われています/.test(await page.getByTestId('hq-acct-msg').innerText());
await inp('4文字以上の半角英数字').fill('honbu_c'); await page.getByTestId('hq-acct-save').click(); await page.waitForTimeout(500);
r.created = (await page.getByTestId('hq-acct-honbu_c').count()) === 1 && /確認コードが届きます/.test(await page.getByTestId('hq-acct-msg').innerText()) && calls.some(c => c.action === 'hq_create' && /^[0-9a-f]{64}$/.test(c.password_hash) && c.email === 'c@example.com');
await page.getByTestId('hq-acct-honbu_b').locator('button', { hasText: '止める' }).click(); await page.waitForTimeout(400);
r.stopped = /停止中/.test(await page.getByTestId('hq-acct-honbu_b').innerText()) && (await page.getByTestId('hq-acct-honbu_b').locator('button', { hasText: '復帰させる' }).count()) === 1;
await page.getByTestId('hq-acct-honbu_b').locator('button', { hasText: '復帰させる' }).click(); await page.waitForTimeout(400);
r.resumed = !/停止中/.test(await page.getByTestId('hq-acct-honbu_b').innerText());
await b.close();
const ok = Object.values(r).every(Boolean); console.log(r, ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
