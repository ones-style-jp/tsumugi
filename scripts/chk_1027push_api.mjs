// 2026-10-27 通知 API(api/push.js)を偽の Supabase(app_secrets・app_state)と偽の送り先(https)で通す(trial432: 1端末×1店舗=1行)
// 2026-10-28: 定時を1分おきに。夜は何も読まない・控えは変わったときだけ保存・1分後に重ねて送らない・10:12 の予定は 9:42 に「あと30分」
//   実行: PUSH_TEST_CERT_DIR=<自己署名の鍵の場所> NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/chk_1027push_api.mjs
import http from 'node:http'; import https from 'node:https'; import fs from 'node:fs'; import crypto from 'node:crypto';
const r = {};
const secrets = {}; const state = { s1: { scheduleEvents: [{ id: 'e1', date: '2026-10-28', start: '10:00', title: '担当者会議／架空 太郎', color: '#3b82f6' }, { id: 'e2', date: '2026-10-28', start: '10:12', title: '契約／架空 花子', color: '#ef4444' }], systemSettings: { pushNotify: { beforeMin: 30 } } }, s2: { scheduleEvents: [], systemSettings: {} } };
let reqN = 0, sentWrites = 0;
const sbSrv = http.createServer((q, s) => { const ch = []; q.on('data', c => ch.push(c)); q.on('end', () => {
  const u = new URL(q.url, 'http://x'); const body = ch.length ? JSON.parse(Buffer.concat(ch).toString()) : null; const kq = u.searchParams.get('key') || ''; const key = kq.replace(/^eq\./, '');
  reqN++; if ((q.method === 'PATCH' && key === 'push_sent') || (q.method === 'POST' && body && body.key === 'push_sent')) sentWrites++;
  const send = (code, j) => { s.writeHead(code, { 'Content-Type': 'application/json' }); s.end(j === undefined ? '' : JSON.stringify(j)); };
  if (u.pathname === '/rest/v1/app_secrets') {
    if (q.method === 'GET') { if (kq.startsWith('like.')) { const pre = kq.slice(5).replace(/\*$/, ''); return send(200, Object.keys(secrets).filter(k => k.startsWith(pre)).map(k => ({ key: k, value: secrets[k] }))); } return send(200, secrets[key] != null ? [{ value: secrets[key] }] : []); }
    if (q.method === 'PATCH') { if (secrets[key] == null) return send(200, []); secrets[key] = body.value; return send(200, [{ key }]); }
    if (q.method === 'POST') { const pref = String(q.headers.prefer || ''); if (secrets[body.key] != null && /ignore-duplicates/.test(pref)) return send(201); secrets[body.key] = body.value; return send(201); }
    if (q.method === 'DELETE') { delete secrets[key]; return send(204); }
  }
  if (u.pathname === '/rest/v1/app_state' && q.method === 'GET') { const d = state[key]; return send(200, d ? [{ ev: d.scheduleEvents, pn: d.systemSettings.pushNotify || null, cl: null }] : []); }
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
const st1 = tok({ sid: 'st1', role: 'staff', store_id: 's1' }), st2 = tok({ sid: 'st2', role: 'staff', store_id: 's2' });
// 壊れた鍵は上書きしない
secrets.push_vapid = '{"x":1}'; const kb = await call({ action: 'key' }); r.brokenKeyKept = kb.code === 500 && secrets.push_vapid === '{"x":1}'; delete secrets.push_vapid;
// 鍵: 2回呼んでも同じ
const k1 = await call({ action: 'key' }); const k2 = await call({ action: 'key' }); r.keyStable = k1.code === 200 && !!k1.j.publicKey && k1.j.publicKey === k2.j.publicKey;
// 前の形(1行にまとめた push_subs)からの引き継ぎ
const L = mkSub('legacy'); secrets.push_subs = JSON.stringify({ old1: { endpoint: L.endpoint, keys: L.keys, storeId: 's1', origin: 'https://tsumugi.ones-style.co.jp' } });
const sL = await call({ action: 'status', token: st1, endpoint: L.endpoint }); r.legacyMigrated = sL.j.registered === true && sL.j.count === 1 && Object.keys(secrets).some(k => k.startsWith('push_sub_')) && secrets.push_subs === '{}';
// 登録(同じ店舗に2台・同時でも消えない) → 1台ずつの行
const a = mkSub('a'), g = mkSub('gone');
await Promise.all([call({ action: 'subscribe', token: st1, sub: a, device: 'PC', origin: 'https://tsumugi-git-trial-ones-style.vercel.app' }), call({ action: 'subscribe', token: st1, sub: g, device: 'スマホ', origin: 'https://evil.example.com' })]);
const s1st = await call({ action: 'status', token: st1, endpoint: a.endpoint }); r.parallelBothKept = s1st.j.count === 3 && s1st.j.registered === true;
r.noToken = (await call({ action: 'subscribe', sub: a })).code === 401;
// 同じ端末を別の店舗にも(本部などは店舗ごとに選べる)
await call({ action: 'subscribe', token: st2, sub: a, device: 'PC', origin: 'https://tsumugi-git-trial-ones-style.vercel.app' });
r.perStore = (await call({ action: 'status', token: st2, endpoint: a.endpoint })).j.count === 1 && (await call({ action: 'status', token: st1, endpoint: a.endpoint })).j.count === 3;
r.notRegisteredOtherStore = (await call({ action: 'status', token: st2, endpoint: g.endpoint })).j.registered === false;
// テスト通知(この店舗に登録された端末だけ)
r.testSent = (await call({ action: 'test', token: st1, endpoint: a.endpoint })).code === 200 && got.includes('/push/a');
r.testNotRegistered = (await call({ action: 'test', token: st2, endpoint: g.endpoint })).code === 404;
// 定時(10:00 の予定の 28 分前): s1 の端末に届き、410 の端末は登録から消える。2回目は送らない
got.length = 0; const now = Date.UTC(2026, 9, 28, 9 - 9, 32);
const c1 = await runCron(now); r.cronSent = c1.sent === 2 && got.includes('/push/a') && got.includes('/push/legacy') && got.includes('/push/gone');
r.goneRemoved = (await call({ action: 'status', token: st1, endpoint: g.endpoint })).j.registered === false;
got.length = 0; const w0 = sentWrites; r.noDouble = (await runCron(now + 60e3)).sent === 0 && got.length === 0; r.noSaveUnchanged = sentWrites === w0;
// 夜(21:00)は何も読まない・送らない
{ const n0 = reqN; got.length = 0; const cn = await runCron(Date.UTC(2026, 9, 28, 21 - 9, 0)); r.nightSkip = cn.night === true && reqN === n0 && got.length === 0; }
// 本部の確認(送らない)・cron の保護
const hq = tok({ sid: 'hq1', role: 'super_admin', store_id: null });
const pv = await call({ action: 'preview', token: hq, store_id: 's1', now: Date.UTC(2026, 9, 27, 17 - 9, 5) }); r.preview = pv.code === 200 && pv.j.items.some(x => x.kind === 'dayBefore' && /あすの予定 2件/.test(x.title));
r.cronGuard = (await call({}, 'GET', { 'user-agent': 'curl/8' })).code === 401;
// 1分おき: 10:12 の予定は 9:41 にはまだ、9:42 に「あと30分」
{ const p41 = await call({ action: 'preview', token: hq, store_id: 's1', now: Date.UTC(2026, 9, 28, 9 - 9, 41) }); const p42 = await call({ action: 'preview', token: hq, store_id: 's1', now: Date.UTC(2026, 9, 28, 9 - 9, 42) });
  r.exact30 = !p41.j.items.some(x => x.key.includes('|b|e2|')) && p42.j.items.some(x => x.key.includes('|b|e2|') && x.title === 'あと30分で予定があります'); }
// 止める: s1 の分だけ消え、s2 にはまだ残る(remaining=1)
const un = await call({ action: 'unsubscribe', token: st1, endpoint: a.endpoint }); r.unsubStoreOnly = un.j.remaining === 1 && (await call({ action: 'status', token: st2, endpoint: a.endpoint })).j.registered === true;
sbSrv.close(); pushSrv.close();
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL');
