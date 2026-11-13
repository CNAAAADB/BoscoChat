import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { createHistoricalManagementRouter } from '../src/routes/historical-management.js';
import { signedArchiveUpload, signedArchiveDownload } from '../src/documents/archive-s3-signing.js';

const credentials = { accessKey: 'AKIDEXAMPLE', secret: 'a'.repeat(40), token: 'tokenexample' };
const now = new Date('2026-11-13T12:00:00.000Z');

test('BC-017 signed conditional S3 PUT binds key, size, MIME, encryption and no-overwrite header', () => {
  const result = signedArchiveUpload({
    key: 'originals/Don Bosco en España_2026.pdf',
    fileSize: 5000000, credentials, now,
  });
  assert.equal(result.method, 'PUT');
  assert.match(result.url, /^https:\/\/boscochat-archivo-pdfs\.s3\.us-east-1\.amazonaws\.com\/originals\//);
  assert.equal(result.expiresIn, 300);
  assert.equal(result.headers['If-None-Match'], '*');
  assert.equal(result.headers['x-amz-server-side-encryption'], 'AES256');
  assert.match(result.url, /X-Amz-Signature=[a-f0-9]{64}$/);
  assert.match(result.url, /X-Amz-SignedHeaders=content-length%3Bcontent-type%3Bhost%3Bif-none-match%3Bx-amz-server-side-encryption/);
  assert.match(result.url, /X-Amz-Expires=300/);
  assert.throws(() => signedArchiveUpload({ key: 'originals/../secret.pdf', fileSize: 1000, now, credentials }), /INVALID_ARCHIVE_UPLOAD/);
  assert.throws(() => signedArchiveUpload({ key: 'originals/Don Bosco en España_2026.pdf', fileSize: 351 * 1024 * 1024, now, credentials }), /INVALID_ARCHIVE_UPLOAD/);
});

test('BC-017 signed download is limited to a matching original with 60-second token', () => {
  const { url, expiresIn } = signedArchiveDownload({ key: 'originals/Don Bosco en España_2025.pdf', now, credentials });
  assert.equal(expiresIn, 60);
  assert.match(url, /X-Amz-Expires=60/);
  assert.match(url, /response-content-disposition=attachment%3B%20filename%3D%22BoscoChat_Original.pdf%22/);
  assert.match(url, /X-Amz-Signature=[a-f0-9]{64}/);
  assert.match(url, /Don%20Bosco%20en%20Espa%C3%B1a_2025\.pdf/);
  assert.throws(() => signedArchiveDownload({ key: 'previews/2025/a.jpg', now, credentials }), /INVALID_ARCHIVE_DOWNLOAD/);
  assert.ok(signedArchiveDownload({ key: 'originals/Memoria Histórica 1982.pdf', now, credentials }).url.includes('Memoria%20Hist%C3%B3rica'));
  assert.throws(() => signedArchiveDownload({ key: 'originals/../secret.pdf', now, credentials }), /INVALID_ARCHIVE_DOWNLOAD/);
});

class ListObjectsV2Command { constructor(params) { Object.assign(this, params); } }
class HeadObjectCommand { constructor(params) { Object.assign(this, params); } }
const commands = { ListObjectsV2Command, HeadObjectCommand };
const mockS3 = {
  async send(command) {
    if (command instanceof ListObjectsV2Command) {
      return { Contents: [
        { Key: 'originals/Don Bosco en España_1923.pdf', Size: 12345, LastModified: now },
        { Key: 'originals/Don Bosco en España_2025.pdf', Size: 25000, LastModified: now },
        { Key: 'originals/Boletín de la casa 1950.pdf', Size: 18000, LastModified: now },
        { Key: 'originals/ignored.txt', Size: 1 },
      ] };
    }
    if (command instanceof HeadObjectCommand) {
      if (command.Key.endsWith('2025.pdf') || command.Key.endsWith('1923.pdf') || command.Key.endsWith('casa 1950.pdf')) return { ContentLength: 25000 };
      const err = new Error('not found');
      err.name = 'NotFound';
      throw err;
    }
    throw new Error('Unexpected command');
  },
};
const pool = {
  async execute() {
    return [[{ s3_key: 'originals/Don Bosco en España_1923.pdf', indexed_at: now, pages: 228 }]];
  },
};
const sessions = {
  'admin-session': { id: 1, role: 'administrator' },
  'manager-session': { id: 2, role: 'documentary_manager' },
  'free-session': { id: 3, role: 'free' },
};
const auth = { async session(token) { return sessions[token] ?? null; } };
const signer = {
  upload: ({ key }) => ({ method: 'PUT', url: 'https://s3.example.invalid/', headers: { 'If-None-Match': '*' }, key, expiresIn: 300 }),
  download: ({ key }) => ({ url: 'https://download.example.invalid/' + encodeURIComponent(key), expiresIn: 60 }),
};

async function withApp(fn) {
  const app = express();
  app.use(express.json());
  app.use('/api/admin/historical', createHistoricalManagementRouter(pool, auth, {
    s3Client: mockS3, s3Commands: commands, signer,
  }));
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  try { return await fn('http://127.0.0.1:' + server.address().port + '/api/admin/historical'); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}
function cookie(role) { return { cookie: 'boscochat_session=' + role + '-session' }; }

test('BC-017 rejects anonymous, platform administrators and normal users for all management endpoints', async () => withApp(async (base) => {
  for (const [method, path] of [
    ['GET', '/documents'], ['POST', '/uploads'], ['GET', '/documents/1923/download'], ['GET', '/documents/download?filename=Bolet%C3%ADn%20de%20la%20casa%201950.pdf'],
  ]) {
    const anonymous = await fetch(base + path, { method });
    assert.equal(anonymous.status, 401, method + ' ' + path);
    const normal = await fetch(base + path, { method, headers: cookie('free') });
    assert.equal(normal.status, 403, method + ' ' + path);
    const platformAdmin = await fetch(base + path, { method, headers: cookie('admin') });
    assert.equal(platformAdmin.status, 403, method + ' ' + path);
  }
}));

test('BC-017 manager can view filtered inventory and statuses; normal users cannot', async () => withApp(async (base) => {
  const response = await fetch(base + '/documents?q=1923', { headers: cookie('manager') });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const data = await response.json();
  assert.equal(data.total, 1);
  assert.equal(data.documents[0].status, 'indexed');
  assert.equal(data.documents[0].pages, 228);
  const waiting = await fetch(base + '/documents?q=2025', { headers: cookie('manager') });
  assert.equal((await waiting.json()).documents[0].status, 'pending');
}));

test('BC-017 prevents overwriting existing annual and invalid uploads', async () => withApp(async (base) => {
  const existing = await fetch(base + '/uploads', {
    method: 'POST', headers: { ...cookie('manager'), 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: 'Don Bosco en España_2025.pdf', sizeBytes: 25000 }),
  });
  assert.equal(existing.status, 409);
  const valid = await fetch(base + '/uploads', {
    method: 'POST', headers: { ...cookie('manager'), 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: 'Don Bosco en España_2026.pdf', sizeBytes: 240000 }),
  });
  assert.equal(valid.status, 201);
  assert.equal((await valid.json()).upload.key, 'originals/Don Bosco en España_2026.pdf');
  const invalid = await fetch(base + '/uploads', {
    method: 'POST', headers: { ...cookie('manager'), 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: '../../secret.pdf', sizeBytes: 2 }),
  });
  assert.equal(invalid.status, 400);
}));

test('BC-017 only permits authorized downloads of existing years', async () => withApp(async (base) => {
  const allowed = await fetch(base + '/documents/1923/download', { headers: cookie('manager') });
  assert.equal(allowed.status, 200);
  assert.equal((await allowed.json()).download.expiresIn, 60);
  const absent = await fetch(base + '/documents/2026/download', { headers: cookie('manager') });
  assert.equal(absent.status, 404);
  const invalid = await fetch(base + '/documents/not-a-year/download', { headers: cookie('manager') });
  assert.equal(invalid.status, 400);
}));

test('BC-017 stores generic PDFs in the same originals prefix but marks them for cataloguing', async () => withApp(async (base) => {
  const inventory = await fetch(base + '/documents?q=Boletín', { headers: cookie('manager') });
  assert.equal(inventory.status, 200);
  const records = await inventory.json();
  assert.equal(records.total, 1);
  assert.equal(records.documents[0].filename, 'Boletín de la casa 1950.pdf');
  assert.equal(records.documents[0].status, 'stored');
  assert.equal(records.documents[0].year, null);

  const signed = await fetch(base + '/uploads', {
    method: 'POST', headers: { ...cookie('manager'), 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: 'Memoria Histórica 1982.pdf', sizeBytes: 55000 }),
  });
  assert.equal(signed.status, 201);
  const data = await signed.json();
  assert.equal(data.upload.key, 'originals/Memoria Histórica 1982.pdf');
  assert.equal(data.willIndexAutomatically, false);
  const annual = await fetch(base + '/uploads', {
    method: 'POST', headers: { ...cookie('manager'), 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: 'Don Bosco en España_2026.pdf', sizeBytes: 55000 }),
  });
  assert.equal((await annual.json()).willIndexAutomatically, true);

  const download = await fetch(base + '/documents/download?filename=Bolet%C3%ADn%20de%20la%20casa%201950.pdf', { headers: cookie('manager') });
  assert.equal(download.status, 200);
  assert.equal((await download.json()).download.expiresIn, 60);

  const traversal = await fetch(base + '/documents/download?filename=..%2Fprivate.pdf', { headers: cookie('manager') });
  assert.equal(traversal.status, 400);
}));
