// パスキー(WebAuthn)の確かめ: 外部の部品は使わず Node の crypto だけで行う (2026-10-23)
//   登録 = attestation 'none'(端末の型式の証明は求めない)・ログイン = 署名の確認
//   どちらも「指紋・顔などで本人を確かめた(UV)」ことを必須にする。
import crypto from 'crypto';

export const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const unb64u = (s) => Buffer.from(String(s || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');

// 最小限の CBOR の読み取り(登録の attestationObject と公開鍵(COSE)に必要な分だけ)
export function cborDecode(buf, pos = 0) {
  const ib = buf[pos++]; const mt = ib >> 5; const ai = ib & 31; let val;
  const len = () => {
    if (ai < 24) return ai;
    if (ai === 24) return buf[pos++];
    if (ai === 25) { const v = buf.readUInt16BE(pos); pos += 2; return v; }
    if (ai === 26) { const v = buf.readUInt32BE(pos); pos += 4; return v; }
    if (ai === 27) { const v = Number(buf.readBigUInt64BE(pos)); pos += 8; return v; }
    throw new Error('cbor: length');
  };
  switch (mt) {
    case 0: val = len(); break;
    case 1: val = -1 - len(); break;
    case 2: { const n = len(); val = buf.subarray(pos, pos + n); pos += n; break; }
    case 3: { const n = len(); val = buf.subarray(pos, pos + n).toString('utf8'); pos += n; break; }
    case 4: { const n = len(); val = []; for (let i = 0; i < n; i++) { const r = cborDecode(buf, pos); val.push(r.value); pos = r.pos; } break; }
    case 5: { const n = len(); val = new Map(); for (let i = 0; i < n; i++) { const k = cborDecode(buf, pos); pos = k.pos; const v = cborDecode(buf, pos); pos = v.pos; val.set(k.value, v.value); } break; }
    case 7: if (ai === 20) val = false; else if (ai === 21) val = true; else if (ai === 22) val = null; else throw new Error('cbor: simple'); break;
    default: throw new Error('cbor: type ' + mt);
  }
  return { value: val, pos };
}

export function parseAuthData(ad) {
  if (!ad || ad.length < 37) throw new Error('authData');
  const flags = ad[32];
  const out = { rpIdHash: ad.subarray(0, 32), up: !!(flags & 0x01), uv: !!(flags & 0x04), at: !!(flags & 0x40), signCount: ad.readUInt32BE(33) };
  if (out.at) {
    let p = 37 + 16; const n = ad.readUInt16BE(p); p += 2;
    out.credId = ad.subarray(p, p + n); p += n;
    out.cose = cborDecode(ad, p).value;
  }
  return out;
}

function coseToJwk(cose) {
  if (!(cose instanceof Map)) throw new Error('key');
  const kty = cose.get(1), alg = cose.get(3);
  if (kty === 2 && cose.get(-1) === 1) return { alg: alg || -7, jwk: { kty: 'EC', crv: 'P-256', x: b64u(cose.get(-2)), y: b64u(cose.get(-3)) } };   // ES256
  if (kty === 3) return { alg: alg || -257, jwk: { kty: 'RSA', n: b64u(cose.get(-1)), e: b64u(cose.get(-2)) } };                                    // RS256
  throw new Error('key type');
}
const sameHash = (a, b) => a && b && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

function checkClient(clientDataJSON, type, expect) {
  const buf = unb64u(clientDataJSON); const cd = JSON.parse(buf.toString('utf8'));
  if (cd.type !== type) throw new Error('type');
  if (!expect.challenge || cd.challenge !== expect.challenge) throw new Error('challenge');
  if (cd.origin !== expect.origin) throw new Error('origin');
  return buf;
}

// 登録: { id, alg, jwk, signCount } を返す(失敗は例外)
export function verifyRegistration(resp, expect) {
  checkClient(resp.clientDataJSON, 'webauthn.create', expect);
  const att = cborDecode(unb64u(resp.attestationObject)).value;
  const ad = parseAuthData(Buffer.from(att.get('authData')));
  if (!sameHash(ad.rpIdHash, crypto.createHash('sha256').update(expect.rpId).digest())) throw new Error('rpId');
  if (!ad.up || !ad.uv) throw new Error('uv');
  if (!ad.at || !ad.credId || !ad.credId.length) throw new Error('credential');
  const { alg, jwk } = coseToJwk(ad.cose);
  crypto.createPublicKey({ key: jwk, format: 'jwk' }); // 鍵として読めるか
  return { id: b64u(ad.credId), alg, jwk, signCount: ad.signCount };
}

// ログイン: 署名を確かめて { signCount } を返す(失敗は例外)
export function verifyAuthentication(resp, cred, expect) {
  const cdBuf = checkClient(resp.clientDataJSON, 'webauthn.get', expect);
  const adBuf = unb64u(resp.authenticatorData); const ad = parseAuthData(adBuf);
  if (!sameHash(ad.rpIdHash, crypto.createHash('sha256').update(expect.rpId).digest())) throw new Error('rpId');
  if (!ad.up || !ad.uv) throw new Error('uv');
  const data = Buffer.concat([adBuf, crypto.createHash('sha256').update(cdBuf).digest()]);
  const key = crypto.createPublicKey({ key: cred.jwk, format: 'jwk' });
  if (!crypto.verify('sha256', data, key, unb64u(resp.signature))) throw new Error('signature');
  // 回数の数え(signCount)が戻ったら写しの疑い。0 のままの端末(Apple など)は数えない
  if (cred.signCount && ad.signCount && ad.signCount <= cred.signCount) throw new Error('counter');
  return { signCount: ad.signCount };
}
