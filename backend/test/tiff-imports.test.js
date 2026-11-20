import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { createTiffImportRouter, safeTiffZipFilename, tiffImportKey } from '../src/routes/tiff-imports.js';
import { signedTiffZipUpload } from '../src/documents/archive-s3-signing.js';

const credentials = { accessKey: 'AKIDEXAMPLE', secret: 'a'.repeat(40), token: 'test' };
class HeadObjectCommand { constructor(x) { Object.assign(this, x); } }
class PutObjectCommand { constructor(x) { Object.assign(this, x); } }
class GetObjectCommand { constructor(x) { Object.assign(this, x); } }
class DeleteObjectCommand { constructor(x) { Object.assign(this, x); } }
const commands = { HeadObjectCommand, PutObjectCommand, GetObjectCommand, DeleteObjectCommand };
const auth = { async session(token) {
  return token === 'admin' ? { id: 1, role: 'administrator' }
    : token === 'manager' ? { id: 2, role: 'documentary_manager' }
      : token === 'free' ? { id: 3, role: 'free' } : null;
} };
const jwt = role => ({ cookie: 'boscochat_session=' + role });
const filename = 'Revistas escaneadas 1954.zip';

function fakeS3() {
  const objects = new Map();
  return {
    objects,
    async send(command) {
      if (command instanceof HeadObjectCommand) {
        if (!objects.has(command.Key)) throw Object.assign(new Error('missing'), { name: 'NotFound' });
        return { VersionId: 'version-123', ContentLength: 21000, ContentType: 'application/zip' };
      }
      if (command instanceof PutObjectCommand) {
        if (command.IfNoneMatch === '*' && objects.has(command.Key)) {
          throw Object.assign(new Error('already exists'), { $metadata: { httpStatusCode: 412 } });
        }
        objects.set(command.Key, JSON.parse(command.Body));
        return {};
      }
      if (command instanceof DeleteObjectCommand) {
        objects.delete(command.Key);
        return {};
      }
      if (command instanceof GetObjectCommand) {
        const item = objects.get(command.Key);
        if (!item) throw Object.assign(new Error('missing'), { name: 'NoSuchKey' });
        return { Body: { async transformToByteArray() { return Buffer.from(JSON.stringify(item)); } } };
      }
      throw new Error('Unexpected command ' + command.constructor.name);
    },
  };
}

async function serve(callback, { s3 = fakeS3(), invokeOcr = async () => {}, pool = { async execute() { return [[]]; } } } = {}) {
  const app = express();
  app.use(express.json());
  app.use('/import', createTiffImportRouter(pool, auth, {
    s3Client: s3, s3Commands: commands,
    signUpload: ({ key }) => ({ url: 'https://example.test/' + key, method: 'PUT', headers: { 'If-None-Match': '*' } }),
    invokeOcr,
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port + '/import';
  try { await callback(base, s3); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test('BC-106 random staging IDs, no-overwrite, AES256 and ZIP size are bound in signed URL', () => {
  const jobId = randomUUID();
  const key = tiffImportKey(jobId, filename);
  assert.equal(key, 'imports/tiff/' + jobId + '/' + filename);
  const upload = signedTiffZipUpload({
    key, fileSize: 900, credentials, now: new Date('2026-11-20T12:00:00.000Z'),
  });
  assert.equal(upload.headers['Content-Type'], 'application/zip');
  assert.equal(upload.headers['If-None-Match'], '*');
  assert.equal(upload.headers['x-amz-server-side-encryption'], 'AES256');
  assert.match(upload.url, /X-Amz-Signature=/);
  assert.throws(() => signedTiffZipUpload({ key, fileSize: 101 * 1024 * 1024, credentials }), /INVALID_ARCHIVE_UPLOAD/);
  assert.equal(safeTiffZipFilename('../bad.zip'), null);
  assert.equal(safeTiffZipFilename('hidden.pdf'), null);
  assert.equal(tiffImportKey(jobId, '../../bad.zip'), null);
});

test('BC-106 only administrators and historians may sign, submit, and inspect OCR jobs', async () => serve(async base => {
  const requests = [
    { method: 'POST', path: '/uploads', body: { filename, sizeBytes: 21000 } },
    { method: 'POST', path: '/submit', body: { jobId: randomUUID(), filename } },
    { method: 'GET', path: '/' + randomUUID() },
  ];
  for (const item of requests) {
    const body = item.body ? JSON.stringify(item.body) : undefined;
    const headers = { 'Content-Type': 'application/json' };
    const anonymous = await fetch(base + item.path, { method: item.method, headers, body });
    assert.equal(anonymous.status, 401);
    const normal = await fetch(base + item.path, { method: item.method,
      headers: { ...headers, ...jwt('free') }, body });
    assert.equal(normal.status, 403);
  }
}));

test('BC-106 ZIP request validates filename/bytes before invoking AWS', async () => serve(async base => {
  for (const body of [
    { filename: 'not-a-zip.pdf', sizeBytes: 21000 },
    { filename: '../unsafe.zip', sizeBytes: 21000 },
    { filename, sizeBytes: 0 },
    { filename, sizeBytes: 101 * 1024 * 1024 },
  ]) {
    const response = await fetch(base + '/uploads', { method: 'POST',
      headers: { ...jwt('manager'), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(response.status, 400);
  }
  const allowed = await fetch(base + '/uploads', { method: 'POST',
    headers: { ...jwt('manager'), 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, sizeBytes: 21000 }),
  });
  assert.equal(allowed.status, 201);
  const result = await allowed.json();
  assert.match(result.jobId, /^[\da-f-]{36}$/);
  assert.match(result.upload.url, /imports\/tiff\//);
  assert.equal(result.maxPages, 40);
}));

test('BC-106 ZIP OCR creates a private review job, invokes only read-only worker action', async () => {
  const s3 = fakeS3();
  let invokes = 0, audits = 0;
  await serve(async (base) => {
    const upload = await fetch(base + '/uploads', { method: 'POST',
      headers: { ...jwt('manager'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, sizeBytes: 21000 }),
    });
    const { jobId } = await upload.json();
    const key = tiffImportKey(jobId, filename);
    s3.objects.set(key, { VersionId: 'version-123' });
    const body = JSON.stringify({ jobId, filename });
    const first = await fetch(base + '/submit', { method: 'POST',
      headers: { ...jwt('manager'), 'Content-Type': 'application/json' }, body });
    assert.equal(first.status, 202);
    assert.equal((await first.json()).status, 'queued');
    assert.equal(invokes, 1);
    assert.equal(audits, 1);
    assert.equal(s3.objects.get('imports/jobs/' + jobId + '.json').createdBy, 2);
    const repeat = await fetch(base + '/submit', { method: 'POST',
      headers: { ...jwt('manager'), 'Content-Type': 'application/json' }, body });
    assert.equal(repeat.status, 409);
    const pending = await fetch(base + '/' + jobId, { headers: jwt('manager') });
    assert.equal((await pending.json()).status, 'queued');
    s3.objects.set('imports/reviews/' + jobId + '.json', {
      jobId, status: 'ocr_complete_review_required', pageCount: 2, engine: 'Amazon Textract',
      pages: [
        { pageNumber: 1, sourceFilename: '0001.tif', ocrText: 'Año 1954 revista', confidence: 97, needsReview: false },
        { pageNumber: 2, sourceFilename: '0002.tif', ocrText: 'Texto antiguo borroso', confidence: 62, needsReview: true },
      ],
    });
    const review = await fetch(base + '/' + jobId, { headers: jwt('admin') });
    assert.equal(review.status, 200);
    const result = await review.json();
    assert.equal(result.publicationAllowed, false);
    assert.equal(result.pages.length, 2);
    assert.match(result.pages[0].textPreview, /1954/);
    assert.equal(result.pages[1].needsReview, true);
  }, {
    s3,
    invokeOcr: async args => {
      invokes++;
      assert.match(args.key, /^imports\/tiff\//);
      assert.equal(args.sourceVersionId, 'version-123');
      assert.equal(args.jobId.length, 36);
    },
    pool: { async execute(sql, params) {
      audits++;
      assert.match(sql, /admin_audit_logs/);
      assert.equal(params[0], 2);
      return [[]];
    } },
  });
});

test('BC-106 missing ZIP and unsafe job IDs do not reach OCR engine', async () => serve(async base => {
  const response = await fetch(base + '/submit', { method: 'POST',
    headers: { ...jwt('manager'), 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId: randomUUID(), filename }),
  });
  assert.equal(response.status, 404);
  const invalid = await fetch(base + '/not-an-id', { headers: jwt('admin') });
  assert.equal(invalid.status, 400);
}));
