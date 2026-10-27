// 2026-10-27 通知の第1段階: 送る時刻と文の判定(api/_push_plan.js)と、web-push の暗号化が正しく解けること(偽の送り先で受けて http_ece で復号)
import { planStore, occursOn } from '../api/_push_plan.js';
import https from 'node:https'; import fs from 'node:fs'; import crypto from 'node:crypto';
import webpush from 'web-push'; import ece from 'http_ece';
const r = {};
const J = (y, m, d, hh, mm) => Date.UTC(y, m - 1, d, hh - 9, mm); // 日本時間 → ms
const ev = [
  { id: 'e1', date: '2026-10-28', start: '10:00', title: '担当者会議／架空 太郎', color: '#3b82f6' },
  { id: 'e2', date: '2026-10-28', start: '14:00', title: '契約', color: '#ef4444' },
  { id: 'e3', date: '2026-10-21', start: '09:30', title: '毎週の見学', color: '#10b981', repeat: 'weekly' },
  { id: 'e4', date: '2026-10-28', title: '終日の行事', color: '#8b5cf6' },
];
const base = { storeId: 's1', events: ev, colorLabels: [], cfg: null };
// ① 前日 17:00 にあすの予定をまとめて
let it = planStore(base, J(2026, 10, 27, 17, 2), {}); const d = it.find(x => x.kind === 'dayBefore');
r.dayBefore = !!d && /あすの予定 4件（10\/28 水）/.test(d.title) && /09:30 見学/.test(d.body) && /10:00 担当者会議/.test(d.body) && /終日 行事/.test(d.body);
r.noNameInText = !!d && !/架空|太郎/.test(d.title + d.body); /* 題名(利用者名)は出さない */
r.notBefore17 = !planStore(base, J(2026, 10, 27, 16, 55), {}).some(x => x.kind === 'dayBefore');
r.dayBeforeOnce = !planStore(base, J(2026, 10, 27, 17, 7), { 's1|d|2026-10-28': 1 }).some(x => x.kind === 'dayBefore');
// ② 30分前
it = planStore(base, J(2026, 10, 28, 9, 32), {}); const b = it.find(x => x.kind === 'before');
r.before30 = !!b && b.key === 's1|b|e1|2026-10-28' && /あと28分/.test(b.title) && b.body === '10:00 担当者会議';
r.notTooEarly = !planStore(base, J(2026, 10, 28, 9, 25), {}).some(x => x.key === 's1|b|e1|2026-10-28');
r.repeatWeekly = occursOn(ev[2], '2026-10-28') && planStore(base, J(2026, 10, 28, 9, 5), {}).some(x => x.key === 's1|b|e3|2026-10-28');
// ③ 夜は送らない・止めた店舗・外したラベル
r.quietNight = planStore(base, J(2026, 10, 27, 20, 5), {}).length === 0 && planStore(base, J(2026, 10, 28, 6, 55), {}).length === 0;
r.cfgOff = planStore({ ...base, cfg: { on: false } }, J(2026, 10, 27, 17, 2), {}).length === 0;
r.offColor = !planStore({ ...base, cfg: { offColors: ['#3B82F6'] } }, J(2026, 10, 28, 9, 32), {}).some(x => x.key === 's1|b|e1|2026-10-28');
r.ownLabel = planStore({ ...base, colorLabels: [{ color: '#ef4444', label: '新規契約' }] }, J(2026, 10, 28, 13, 40), {}).some(x => x.body === '14:00 新規契約');
// ④ web-push: 偽の送り先(https・自己署名)で受けて、端末側の鍵で復号できる。実行: PUSH_TEST_CERT_DIR=<鍵の場所> NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/chk_1027push_plan.mjs
const ua = crypto.createECDH('prime256v1'); ua.generateKeys(); const auth = crypto.randomBytes(16);
const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const CERT = process.env.PUSH_TEST_CERT_DIR; let got = null; const srv = https.createServer({ key: fs.readFileSync(CERT + '/key.pem'), cert: fs.readFileSync(CERT + '/cert.pem') }, (q, s) => { const ch = []; q.on('data', c => ch.push(c)); q.on('end', () => { got = { headers: q.headers, body: Buffer.concat(ch) }; s.writeHead(201); s.end(); }); });
await new Promise(ok => srv.listen(0, ok)); const port = srv.address().port;
const k = webpush.generateVAPIDKeys(); webpush.setVapidDetails('https://tsumugi.ones-style.co.jp', k.publicKey, k.privateKey);
await webpush.sendNotification({ endpoint: `https://127.0.0.1:${port}/push/abc`, keys: { p256dh: b64u(ua.getPublicKey()), auth: b64u(auth) } }, JSON.stringify({ title: 'テスト', body: '10:00 担当者会議', url: '/?tsugo=schedule' }), { TTL: 60 });
srv.close();
r.sentHeaders = !!got && got.headers['content-encoding'] === 'aes128gcm' && /^vapid t=/.test(String(got.headers.authorization || ''));
let plain = ''; try { plain = ece.decrypt(got.body, { version: 'aes128gcm', privateKey: ua, authSecret: b64u(auth) }).toString('utf8'); } catch (e) { plain = 'ERR ' + e.message; }
r.decrypts = /"body":"10:00 担当者会議"/.test(plain); if (!r.decrypts) console.log('PLAIN', plain.slice(0, 120));
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL');
