// 2026-10-27 通知 API(api/push.js)を偽の Supabase(app_secrets・app_state)と偽の送り先(https)で通す
//   実行: PUSH_TEST_CERT_DIR=<自己署名の鍵の場所> NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/chk_1027push_api.mjs
import http from 'node:http'; import https from 'node:https'; import fs from 'node:fs'; import crypto from 'node:crypto';
const r = {};
const secrets = {}; const state = { s1: { scheduleEvents: [{ id: 'e1', date: '2026-10-28', start: '10:00', title: '担当者会議／架空 太郎', color: '#3b82f6' }], systemSettings: { pushNotify: { beforeMin: 30 } } } };
const sbSrv = http.createServer((q, s) => { const ch = []; q.on('data', c => ch.push(c)); q.on('end', () => {
  const u = new URL(q.url, 'http://x'); const body = ch.length ? JSON.parse(Buffer.concat(ch).toString()) : null; const key = (u.searchParams.get('key') || '').replace(/^eq\./, '');
  const send = (code, j) => { s.writeHead(code, { 'Content-Type': 'application/json' }); s.end(j === undefined ? '' : JSON.stringify(j)); };
  if (u.pathname === '/rest/v1/app_secrets') {
    if (q.method === 'GET') return send(200, secrets[key] != null ? [{ value: secrets[key] }] : []);
    if (q.method === 'PATCH') { if (secrets[key] == null) return send(200, []); secrets[key] = body.value; return send(200, [{ key }]); }
    if (q.method === 'POST') { secrets[body.key] = body.value; return send(201); }
  }
  if (u.pathname === '/rest/v1/app_state' && q.method === 'GET') { const d = state[key]; return send(200, d ? [{ ev: d.scheduleEvents, pn: d.systemSettings.pushNotify, cl: null }] : []); }
  send(404, { message: 'nf' });
}); });
await new Promise(ok => sbSrv.listen(0, ok));
process.env.SUPABASE_URL = `http://127.0.0.1:${sbSrv.address().port}`; process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
const got = []; const CERT = process.env.PUSH_TEST_CERT_DIR;
const pushSrv = https.createServer({ key: fs.readFileSync(CERT + '/key.pem'), cert: fs.readFileSync(CERT + '/cert.pem') }, (q, s) => { const ch = []; q.on('data', c => ch.push(c)); q.on('end', () => { got.push(q.url); if (q.url.includes('gone')) { s.writeHead(410); return s.end(); } s.writeHead(201); s.end(); }); });
await new Promise(ok => pushSrv.listen(0, ok)); const pp = pushSrv.address().port;
const { default: handler, runCron } = await import('../api/push.js');
const b64u = (x) => Buffer.from(x).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const tok = (o) => { const p = b64u(JSON.stringify({ exp: Date.now() + 3600e3, ...o })); return p + '.' + crypto.createHmac('sha256', 'tsumugi-staff-token|test-service-key').update(p).digest('hex'); };
const call = (body, method = 'POST', headers = {}) => new Promise(ok => { const res = { code: 200, h: {}, setHeader(k, v) { this.h[k] = v; }, status(c) { this.code = c; return this; }, json(j) { ok({ code: this.code, j }); } }; handler({ method, body, query: {}, headers }, res); });
const mkSub = (name) => { const e = crypto.createECDH('prime256v1'); e.generateKeys(); return { endpoint: `https://127.0.0.1:${pp}/push/${name}`, keys: { p256dh: b64u(e.getPublicKey()), auth: b64u(crypto.randomBytes(16)) } }; };
const staff = tok({ sid: 'st1', role: 'staff', store_id: 's1' });
// 鍵: 2回呼んでも同じ
const k1 = await call({ action: 'key' }); const k2 = await call({ action: 'key' });
r.keyStable = k1.code === 200 && !!k1.j.publicKey && k1.j.publicKey === k2.j.publicKey;
// 登録・端末数・ログインなしは拒否
const a = mkSub('a'), g = mkSub('gone');
const s1 = await call({ action: 'subscribe', token: staff, sub: a, device: 'テスト1', origin: 'https://tsumugi-git-trial-ones-style.vercel.app' });
await call({ action: 'subscribe', token: staff, sub: g, device: 'テスト2', origin: 'https://evil.example.com' });
r.subscribe = s1.code === 200 && s1.j.count === 1;
r.status = (await call({ action: 'status', token: staff })).j.count === 2;
r.noToken = (await call({ action: 'subscribe', sub: a })).code === 401;
const subsSaved = JSON.parse(secrets.push_subs); r.originGuard = Object.values(subsSaved).some(x => x.origin === 'https://tsumugi.ones-style.co.jp' && x.device === 'テスト2'); /* 知らない送り元は本番に置き換える */
// テスト通知
const t1 = await call({ action: 'test', token: staff, endpoint: a.endpoint }); r.testSent = t1.code === 200 && got.includes('/push/a');
// 定時(10:00 の予定の 28 分前): a に届き、410 の gone は登録から消える。2回目は送らない
got.length = 0; const now = Date.UTC(2026, 9, 28, 9 - 9, 32);
const c1 = await runCron(now); r.cronSent = c1.sent === 1 && got.includes('/push/a') && got.includes('/push/gone');
r.goneRemoved = !Object.values(JSON.parse(secrets.push_subs)).some(x => x.endpoint.includes('gone'));
got.length = 0; const c2 = await runCron(now + 5 * 60e3); r.noDouble = c2.sent === 0 && got.length === 0;
// 本部の確認(送らない)
const hq = tok({ sid: 'hq1', role: 'super_admin', store_id: null });
const pv = await call({ action: 'preview', token: hq, store_id: 's1', now: Date.UTC(2026, 9, 27, 17 - 9, 5) }); r.preview = pv.code === 200 && pv.j.items.some(x => x.kind === 'dayBefore' && /あすの予定 1件/.test(x.title));
r.previewStaffDenied = (await call({ action: 'preview', token: staff, now })).code === 403;
// GET(定時)は vercel-cron 以外を拒否
r.cronGuard = (await call({}, 'GET', { 'user-agent': 'curl/8' })).code === 401;
// 解除
r.unsub = (await call({ action: 'unsubscribe', token: staff, endpoint: a.endpoint })).code === 200 && (await call({ action: 'status', token: staff })).j.count === 0;
sbSrv.close(); pushSrv.close();
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL');
