import assert from 'node:assert/strict';
import test from 'node:test';
import { archivePdfKey, checkPdfHeader } from '../src/documents/s3-read-check.js';

test('BC-006 derives fixed annual S3 key and rejects arbitrary object paths', () => {
  assert.equal(archivePdfKey('1922'), 'originals/Don Bosco en España_1922.pdf');
  assert.throws(() => archivePdfKey('../../secret'), /año/);
  assert.throws(() => archivePdfKey('2022/hello'), /año/);
  assert.throws(() => archivePdfKey('1921'), /año/);
});

test('BC-006 reads only first five bytes, never returns content or S3 key', async () => {
  let input;
  const s3 = { async send(cmd) {
    input = cmd;
    return { Body: (async function* () { yield Buffer.from('%PDF-'); })() };
  } };
  const outcome = await checkPdfHeader({ s3, commandFactory: (params) => params, year: '1922' });
  assert.deepEqual(input, { Bucket: 'boscochat-archivo-pdfs', Key: 'originals/Don Bosco en España_1922.pdf', Range: 'bytes=0-4' });
  assert.deepEqual(outcome, { readable: true, validPdfHeader: true, year: 1922 });
});

test('BC-006 marks invalid file headers without exposing document bytes', async () => {
  const s3 = { async send() { return { Body: (async function* () { yield Buffer.from('abcde'); })() }; } };
  const outcome = await checkPdfHeader({ s3, commandFactory: (x) => x, year: '1922' });
  assert.equal(outcome.validPdfHeader, false);
});
