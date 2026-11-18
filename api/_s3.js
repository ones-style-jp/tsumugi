// つむぎ: AWS S3 へ「写真の控え」を置くための最小クライアント(2026-11-16・社長承認 11/16)
//
// ★ 設計の要点
//   ・npm の依存は足さない(node:crypto だけで AWS 署名バージョン4 を作る)。使う操作は put / head / get / list の4つ。
//   ・鍵・リージョン・バケット名は 管理局「外部サービス設定」(app_secrets)から読む。Vercel の環境変数があればそちらが優先
//     (_secrets.js の getSecret と同じ決まり)。
//   ・鍵の値はログにも戻り値にも出さない。AWS のエラー文に混ざるアクセスキーは伏せる(maskAws)。
//   ・バケットは Object Lock(30日は誰も消せない)+版管理の前提。Object Lock のバケットは PutObject に Content-MD5 が要るので必ず付ける。
//   ・URL は仮想ホスト形式 https://<bucket>.s3.<region>.amazonaws.com/<key>。通信は TLS(暗号化)のみ。
//
// ファイル名が _ で始まるため、Vercel のルーティング対象(エンドポイント)にはならない。
import crypto from 'crypto';
import { getSecret } from './_secrets.js';

export const AWS_KEYS = {
  accessKeyId: { env: 'AWS_ACCESS_KEY_ID', dbKey: 'aws_access_key_id' },
  secretAccessKey: { env: 'AWS_SECRET_ACCESS_KEY', dbKey: 'aws_secret_access_key' },
  // ★ 2026-11-18 1118c: Vercel の実行環境が AWS_REGION(関数の動作地域)を自動で入れるため、環境変数優先の決まりで大阪にならなかった → 名前を TSUMUGI_AWS_REGION に
  region: { env: 'TSUMUGI_AWS_REGION', dbKey: 'aws_region' },
  bucket: { env: 'AWS_BUCKET', dbKey: 'aws_bucket' },
};
export const DEFAULT_REGION = 'ap-northeast-3'; // 大阪

const EMPTY_SHA = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const sha256Hex = (b) => crypto.createHash('sha256').update(b).digest('hex');
const hmac = (k, s) => crypto.createHmac('sha256', k).update(s, 'utf8').digest();
// S3 の canonical URI / query 用のエンコード(RFC3986・encodeURIComponent が残す !'()* も変換)
const rfc3986 = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
const encKey = (key) => String(key).split('/').map(rfc3986).join('/');
const xmlUnesc = (s) => String(s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&');
const tag = (xml, name) => { const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml); return m ? xmlUnesc(m[1]) : ''; };

/** エラー文・ログに混ざったアクセスキー/秘密鍵らしき文字列を伏せる */
export const maskAws = (s) => String(s || '')
  .replace(/\b(AKIA|ASIA)[0-9A-Z]{12,}\b/g, '$1************')
  .replace(/<AWSAccessKeyId>[^<]*<\/AWSAccessKeyId>/g, '<AWSAccessKeyId>****</AWSAccessKeyId>')
  .replace(/<StringToSign>[\s\S]*?<\/StringToSign>/g, '')
  .replace(/<SignatureProvided>[^<]*<\/SignatureProvided>/g, '')
  .replace(/<CanonicalRequest>[\s\S]*?<\/CanonicalRequest>/g, '');

export class S3Client {
  constructor({ accessKeyId, secretAccessKey, region, bucket, endpoint } = {}) {
    if (!accessKeyId || !secretAccessKey || !bucket) throw new Error('S3 の設定が足りません(アクセスキー・シークレット・バケット名)');
    this.accessKeyId = String(accessKeyId).trim();
    this.secretAccessKey = String(secretAccessKey).trim();
    this.region = String(region || DEFAULT_REGION).trim() || DEFAULT_REGION;
    this.bucket = String(bucket).trim();
    this.host = endpoint ? String(endpoint).replace(/^https?:\/\//, '').replace(/\/+$/, '') : `${this.bucket}.s3.${this.region}.amazonaws.com`;
  }

  /** 署名して送る(内部用)。query は {name:value} の素の値。body は Buffer か undefined。 */
  async _send(method, key, { query, body, headers } = {}) {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = body && body.length ? sha256Hex(body) : EMPTY_SHA;
    const h = { host: this.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
    if (body && body.length) h['content-md5'] = crypto.createHash('md5').update(body).digest('base64'); // Object Lock のバケットに必須
    Object.entries(headers || {}).forEach(([k, v]) => { if (v != null && v !== '') h[String(k).toLowerCase()] = String(v).trim(); });
    const signedNames = Object.keys(h).sort();
    const canonicalHeaders = signedNames.map((k) => `${k}:${h[k]}\n`).join('');
    const signedHeaders = signedNames.join(';');
    const q = Object.entries(query || {}).filter(([, v]) => v != null).map(([k, v]) => [rfc3986(k), rfc3986(String(v))]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const canonicalQuery = q.map(([k, v]) => `${k}=${v}`).join('&');
    const canonicalUri = '/' + (key ? encKey(key) : '');
    const canonicalRequest = [method, canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n');
    const scope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
    const kDate = hmac('AWS4' + this.secretAccessKey, dateStamp);
    const kRegion = hmac(kDate, this.region);
    const kService = hmac(kRegion, 's3');
    const kSigning = hmac(kService, 'aws4_request');
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');
    const authorization = `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    const reqHeaders = { ...h, Authorization: authorization };
    delete reqHeaders.host; // fetch が自分で付ける
    const url = `https://${this.host}${canonicalUri}${canonicalQuery ? '?' + canonicalQuery : ''}`;
    const r = await fetch(url, { method, headers: reqHeaders, body: body && body.length ? body : undefined });
    return r;
  }

  async _fail(r, what) {
    const t = await r.text().catch(() => '');
    const code = tag(t, 'Code') || `HTTP ${r.status}`;
    const msg = tag(t, 'Message');
    const e = new Error(maskAws(`S3 ${what} に失敗: ${code}${msg ? ' / ' + msg.slice(0, 160) : ''}`));
    e.status = r.status; e.code = code;
    throw e;
  }

  /** 置く。戻り値 { etag, versionId } */
  async putObject(key, bodyBuffer, contentType, extraHeaders) {
    const body = Buffer.isBuffer(bodyBuffer) ? bodyBuffer : Buffer.from(bodyBuffer || '');
    const r = await this._send('PUT', key, { body, headers: { 'content-type': contentType || 'application/octet-stream', 'content-length': String(body.length), ...(extraHeaders || {}) } });
    if (!r.ok) await this._fail(r, 'PutObject');
    return { etag: String(r.headers.get('etag') || '').replace(/"/g, ''), versionId: r.headers.get('x-amz-version-id') || null };
  }

  /** ある? 無ければ null。あれば { size, etag, lastModified, contentType } */
  async headObject(key) {
    const r = await this._send('HEAD', key);
    if (r.status === 404) return null;
    if (!r.ok) await this._fail(r, 'HeadObject');
    return { size: Number(r.headers.get('content-length') || 0), etag: String(r.headers.get('etag') || '').replace(/"/g, ''), lastModified: r.headers.get('last-modified') || null, contentType: r.headers.get('content-type') || null };
  }

  /** 取る。無ければ null。あれば { body(Buffer), contentType, size } */
  async getObject(key) {
    const r = await this._send('GET', key);
    if (r.status === 404) return null;
    if (!r.ok) await this._fail(r, 'GetObject');
    const body = Buffer.from(await r.arrayBuffer());
    return { body, contentType: r.headers.get('content-type') || null, size: body.length };
  }

  /** 一覧(ListObjectsV2・1回最大1000件)。{ items:[{key,size,lastModified,etag}], nextToken } */
  async listObjects(prefix, continuationToken, maxKeys) {
    const query = { 'list-type': '2', prefix: prefix || '', 'max-keys': String(Math.min(Math.max(Number(maxKeys) || 1000, 1), 1000)) };
    if (continuationToken) query['continuation-token'] = continuationToken;
    const r = await this._send('GET', '', { query });
    if (!r.ok) await this._fail(r, 'ListObjects');
    const xml = await r.text();
    const items = [];
    const re = /<Contents>([\s\S]*?)<\/Contents>/g; let m;
    while ((m = re.exec(xml))) items.push({ key: tag(m[1], 'Key'), size: Number(tag(m[1], 'Size') || 0), lastModified: tag(m[1], 'LastModified'), etag: tag(m[1], 'ETag').replace(/"/g, '') });
    const truncated = tag(xml, 'IsTruncated') === 'true';
    return { items, nextToken: truncated ? tag(xml, 'NextContinuationToken') || null : null };
  }

  /** 一覧を最後までたどる(上限 maxTotal 件・既定 100000) */
  async listAll(prefix, maxTotal) {
    const out = []; let token = null; const cap = Number(maxTotal) || 100000;
    do {
      const { items, nextToken } = await this.listObjects(prefix, token, 1000);
      out.push(...items); token = nextToken;
    } while (token && out.length < cap);
    return out;
  }

  /** JSON を取る(無ければ fallback) */
  async getJson(key, fallback) {
    const o = await this.getObject(key);
    if (!o) return fallback;
    try { return JSON.parse(o.body.toString('utf8')); } catch { return fallback; }
  }

  async putJson(key, obj) {
    return this.putObject(key, Buffer.from(JSON.stringify(obj), 'utf8'), 'application/json; charset=utf-8');
  }
}

/** 管理局の設定(app_secrets・環境変数優先)から設定値を読む。値は返すが、ログには出さないこと。 */
export async function awsConfig() {
  const accessKeyId = await getSecret(AWS_KEYS.accessKeyId.env, AWS_KEYS.accessKeyId.dbKey);
  const secretAccessKey = await getSecret(AWS_KEYS.secretAccessKey.env, AWS_KEYS.secretAccessKey.dbKey);
  const region = (await getSecret(AWS_KEYS.region.env, AWS_KEYS.region.dbKey)) || DEFAULT_REGION;
  const bucket = await getSecret(AWS_KEYS.bucket.env, AWS_KEYS.bucket.dbKey);
  return { accessKeyId, secretAccessKey, region, bucket, configured: !!(accessKeyId && secretAccessKey && bucket) };
}

/** 設定があればクライアントを返す。無ければ null(呼び出し側で「未設定」を案内する)。 */
export async function s3FromSecrets() {
  const c = await awsConfig();
  if (!c.configured) return null;
  return new S3Client(c);
}
