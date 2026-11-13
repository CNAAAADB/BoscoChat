import { createHmac, createHash } from 'node:crypto';

const REGION = 'us-east-1';
const BUCKET = 'boscochat-archivo-pdfs';
const MAX_PDF_BYTES = 350 * 1024 * 1024;
const ALLOWED_ORIGIN = 'https://' + BUCKET + '.s3.' + REGION + '.amazonaws.com/';

function encode(value) {
  return encodeURIComponent(String(value)).replace(/[!'()*]/g, (char) => '%' + char.charCodeAt(0).toString(16).toUpperCase());
}

function hmac(key, value, encoding) {
  return createHmac('sha256', key).update(value).digest(encoding);
}
function signingKey(secret, stamp) {
  const date = hmac('AWS4' + secret, stamp);
  const region = hmac(date, REGION);
  const service = hmac(region, 's3');
  return hmac(service, 'aws4_request');
}
function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
function credentialsFromEnvironment(env = process.env) {
  if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) {
    throw new Error('AWS_RUNTIME_CREDENTIALS_REQUIRED');
  }
  return {
    accessKey: env.AWS_ACCESS_KEY_ID,
    secret: env.AWS_SECRET_ACCESS_KEY,
    token: env.AWS_SESSION_TOKEN,
  };
}
function timeParts(now = new Date()) {
  const timestamp = now.toISOString().replace(/[-:]|\.\d{3}/g, '');
  return { timestamp, day: timestamp.slice(0, 8) };
}
function credentialScope(accessKey, day) {
  return accessKey + '/' + day + '/' + REGION + '/s3/aws4_request';
}

// Exact-key S3 POST policy. S3 enforces the body-size range independently of the browser.
// The user must have already passed server-side role authorization.
export function signedArchiveUpload({ key, fileSize, now, credentials = credentialsFromEnvironment() }) {
  if (typeof key !== 'string' || !/^originals\/Don Bosco en Espa(?:ñ|n)a_\d{4}\.pdf$/u.test(key)
    || !Number.isSafeInteger(fileSize) || fileSize < 1 || fileSize > MAX_PDF_BYTES) {
    throw new Error('INVALID_ARCHIVE_UPLOAD');
  }
  const { timestamp, day } = timeParts(now);
  const credential = credentialScope(credentials.accessKey, day);
  const fields = {
    key,
    'Content-Type': 'application/pdf',
    'x-amz-server-side-encryption': 'AES256',
    'success_action_status': '201',
    'x-amz-algorithm': 'AWS4-HMAC-SHA256',
    'x-amz-credential': credential,
    'x-amz-date': timestamp,
    ...(credentials.token ? { 'x-amz-security-token': credentials.token } : {}),
  };
  const conditions = [
    ['eq', '$key', key],
    ['eq', '$Content-Type', 'application/pdf'],
    ['eq', '$x-amz-server-side-encryption', 'AES256'],
    ['eq', '$success_action_status', '201'],
    ['content-length-range', 1, MAX_PDF_BYTES + 4096],
    ['eq', '$x-amz-algorithm', 'AWS4-HMAC-SHA256'],
    ['eq', '$x-amz-credential', credential],
    ['eq', '$x-amz-date', timestamp],
    ...(credentials.token ? [['eq', '$x-amz-security-token', credentials.token]] : []),
  ];
  const policy = Buffer.from(JSON.stringify({
    expiration: new Date(new Date(now).getTime() + 5 * 60 * 1000).toISOString(),
    conditions,
  })).toString('base64');
  const signature = hmac(signingKey(credentials.secret, day), policy, 'hex');
  return { url: ALLOWED_ORIGIN, fields: { ...fields, policy, 'x-amz-signature': signature }, expiresIn: 300 };
}

// The temporary link is issued only after server-side authorization and object lookup.
// No whole PDF is proxied through the API Gateway's size-limited response.
export function signedArchiveDownload({ key, now, credentials = credentialsFromEnvironment() }) {
  if (typeof key !== 'string' || !/^originals\/Don Bosco en Espa(?:ñ|n)a_\d{4}\.pdf$/u.test(key)) {
    throw new Error('INVALID_ARCHIVE_DOWNLOAD');
  }
  const { timestamp, day } = timeParts(now);
  const credential = credentialScope(credentials.accessKey, day);
  const host = BUCKET + '.s3.' + REGION + '.amazonaws.com';
  const path = '/' + key.split('/').map(encode).join('/');
  const query = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': credential,
    'X-Amz-Date': timestamp,
    'X-Amz-Expires': '60',
    'X-Amz-SignedHeaders': 'host',
    ...(credentials.token ? { 'X-Amz-Security-Token': credentials.token } : {}),
  };
  const canonicalQuery = Object.entries(query).map(([k, v]) => [encode(k), encode(v)])
    .sort(([a], [b]) => a.localeCompare(b, 'en')).map(([k, v]) => k + '=' + v).join('&');
  const request = 'GET\n' + path + '\n' + canonicalQuery + '\nhost:' + host + '\n\nhost\nUNSIGNED-PAYLOAD';
  const stringToSign = 'AWS4-HMAC-SHA256\n' + timestamp + '\n' + day + '/' + REGION + '/s3/aws4_request\n' + sha256(request);
  return { url: 'https://' + host + path + '?' + canonicalQuery + '&X-Amz-Signature=' + hmac(signingKey(credentials.secret, day), stringToSign, 'hex'), expiresIn: 60 };
}
export { MAX_PDF_BYTES };
