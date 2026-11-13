import assert from 'node:assert/strict';
import test from 'node:test';
import { validatePreviewRequest } from '../worker/page-preview.js';
import { watermarkPageJpeg } from '../src/documents/jpeg-watermark.js';

test('BC-012 only allows recognized annual PDFs and bounded physical page numbers', () => {
  const valid = validatePreviewRequest({ key: 'originals/Don Bosco en España_1923.pdf', page: 92 });
  assert.equal(valid.year, 1923);
  assert.equal(valid.page, 92);
  assert.throws(() => validatePreviewRequest({ key: 'originals/../private.pdf', page: 1 }), /INVALID_ARCHIVE_KEY/);
  assert.throws(() => validatePreviewRequest({ key: 'previews/1923/1.jpg', page: 1 }), /INVALID_ARCHIVE_KEY/);
  assert.throws(() => validatePreviewRequest({ key: 'originals/Don Bosco en España_1923.pdf', page: 0 }), /INVALID_PREVIEW_PAGE/);
  assert.throws(() => validatePreviewRequest({ key: 'originals/Don Bosco en España_1923.pdf', page: 5001 }), /INVALID_PREVIEW_PAGE/);
});

test('BC-012 inserts a stable user-specific invisible JPEG marker without exposing user id', () => {
  const original = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const one = watermarkPageJpeg(original, { userId: 1, documentId: 17, pageNumber: 92, secret: 's'.repeat(48) });
  const again = watermarkPageJpeg(original, { userId: 1, documentId: 17, pageNumber: 92, secret: 's'.repeat(48) });
  const another = watermarkPageJpeg(original, { userId: 2, documentId: 17, pageNumber: 92, secret: 's'.repeat(48) });
  assert.equal(one.toString('hex'), again.toString('hex'));
  assert.notEqual(one.toString('hex'), another.toString('hex'));
  assert.equal(one[0], 0xff);
  assert.equal(one[1], 0xd8);
  assert.equal(one[2], 0xff);
  assert.equal(one[3], 0xfe);
  assert.match(one.toString('ascii'), /BoscoChat:v1:/);
  assert.doesNotMatch(one.toString('ascii'), /userId|password/);
  assert.throws(() => watermarkPageJpeg(original, { userId: 1, documentId: 17, pageNumber: 92, secret: 'short' }), /SECRET_REQUIRED/);
});
