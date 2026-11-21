// パスキーの確かめの部品(api/_webauthn.js)を、ブラウザの仮想の認証装置で試す: 登録→ログイン→偽物(問いかけ違い・別サイト・署名の改ざん・指紋なし)を弾く
import { chromium } from 'playwright';
import http from 'http';
import crypto from 'crypto';
const W = await import(process.argv[2]);
const PORT = 4199; const ORIGIN = `http://localhost:${PORT}`;
const srv = http.createServer((q, s) => { s.writeHead(200, { 'Content-Type': 'text/html' }); s.end('<!doctype html><title>pk</title><body>pk</body>'); }).listen(PORT);
const b = await chromium.launch(); const ctx = await b.newContext(); const page = await ctx.newPage(); await page.goto(ORIGIN);
const cdp = await ctx.newCDPSession(page); await cdp.send('WebAuthn.enable');
const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
const helpers = `const b2u=(b)=>{const u=new Uint8Array(b);let s='';for(const x of u)s+=String.fromCharCode(x);return btoa(s).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'')};const u2b=(s)=>{s=s.replace(/-/g,'+').replace(/_/g,'/');s+='==='.slice((s.length+3)%4);const t=atob(s);const u=new Uint8Array(t.length);for(let i=0;i<t.length;i++)u[i]=t.charCodeAt(i);return u.buffer};`;
const r = {};
const ch1 = W.b64u(crypto.randomBytes(32));
const reg = await page.evaluate(new Function('a', helpers + `return navigator.credentials.create({publicKey:{challenge:u2b(a.c),rp:{name:'つむぎ',id:'localhost'},user:{id:u2b(a.uid),name:'hq',displayName:'本部'},pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],attestation:'none',authenticatorSelection:{residentKey:'required',userVerification:'required'}}}).then(c=>({id:c.id,resp:{clientDataJSON:b2u(c.response.clientDataJSON),attestationObject:b2u(c.response.attestationObject)}}))`), { c: ch1, uid: W.b64u(Buffer.from('staff:hq1')) });
let cred = null; try { cred = W.verifyRegistration(reg.resp, { challenge: ch1, origin: ORIGIN, rpId: 'localhost' }); } catch (e) { console.log('reg error', e.message); }
r.regOk = !!cred && cred.id === reg.id && cred.jwk.kty === 'EC';
const bad = (f) => { try { f(); return false; } catch { return true; } };
r.regWrongChallenge = bad(() => W.verifyRegistration(reg.resp, { challenge: 'x' + ch1, origin: ORIGIN, rpId: 'localhost' }));
r.regWrongOrigin = bad(() => W.verifyRegistration(reg.resp, { challenge: ch1, origin: 'https://evil.example', rpId: 'localhost' }));
r.regWrongRp = bad(() => W.verifyRegistration(reg.resp, { challenge: ch1, origin: ORIGIN, rpId: 'evil.example' }));
// ログイン(登録した鍵を探してもらう=名前を入れない形)
const ch2 = W.b64u(crypto.randomBytes(32));
const asr = await page.evaluate(new Function('a', helpers + `return navigator.credentials.get({publicKey:{challenge:u2b(a.c),rpId:'localhost',userVerification:'required',allowCredentials:[]}}).then(c=>({id:b2u(c.rawId),resp:{clientDataJSON:b2u(c.response.clientDataJSON),authenticatorData:b2u(c.response.authenticatorData),signature:b2u(c.response.signature),userHandle:c.response.userHandle?b2u(c.response.userHandle):''}}))`), { c: ch2 });
let au = null; try { au = W.verifyAuthentication(asr.resp, cred, { challenge: ch2, origin: ORIGIN, rpId: 'localhost' }); } catch (e) { console.log('auth error', e.message); }
r.authOk = !!au && asr.id === cred.id && Buffer.from(W.unb64u(asr.resp.userHandle)).toString() === 'staff:hq1';
r.authWrongChallenge = bad(() => W.verifyAuthentication(asr.resp, cred, { challenge: 'y' + ch2, origin: ORIGIN, rpId: 'localhost' }));
const sig = W.unb64u(asr.resp.signature); sig[sig.length - 1] ^= 0x01;
r.authTamperedSig = bad(() => W.verifyAuthentication({ ...asr.resp, signature: W.b64u(sig) }, cred, { challenge: ch2, origin: ORIGIN, rpId: 'localhost' }));
const ad = W.unb64u(asr.resp.authenticatorData); ad[32] &= ~0x04; // 指紋(UV)なしに書き換え
r.authNoUv = bad(() => W.verifyAuthentication({ ...asr.resp, authenticatorData: W.b64u(ad) }, cred, { challenge: ch2, origin: ORIGIN, rpId: 'localhost' }));
// 別の鍵(別の利用者の鍵)では通らない
const other = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey.export({ format: 'jwk' });
r.authOtherKey = bad(() => W.verifyAuthentication(asr.resp, { ...cred, jwk: other, signCount: 0 }, { challenge: ch2, origin: ORIGIN, rpId: 'localhost' }));
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL'); await b.close(); srv.close();
