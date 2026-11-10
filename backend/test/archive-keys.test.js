import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeArchiveKeys, parseArchiveKey } from '../src/documents/archive-keys.js';

test('BC-006 recognizes annual PDF with Spanish accent and preserves original S3 key', () => {
  const key = 'originals/Don Bosco en España_1922.pdf';
  assert.deepEqual(parseArchiveKey(key), {
    status: 'recognized', key, publication: 'Don Bosco en España',
    year: 1922, originalFilename: 'Don Bosco en España_1922.pdf',
  });
});

test('BC-006 supports composed/decomposed accents and case-insensitive PDF extension', () => {
  const item = parseArchiveKey('originals/Don Bosco en Espan\u0303a_1980.PDF');
  assert.equal(item.status, 'recognized');
  assert.equal(item.year, 1980);
});

test('BC-006 does not silently catalog unknown annual files or other paths', () => {
  assert.equal(parseArchiveKey('originals/otro_1922.pdf').status, 'review');
  assert.equal(parseArchiveKey('originals/sub/Don Bosco en España_1922.pdf').status, 'unsupported');
  assert.equal(parseArchiveKey('private/Don Bosco en España_1922.pdf').status, 'unsupported');
  assert.equal(parseArchiveKey('originals/Don Bosco en España_1910.pdf').status, 'review');
  assert.equal(parseArchiveKey('originals/test.txt').status, 'unsupported');
});

test('BC-006 marks duplicate annual editions for manual review', () => {
  const result = analyzeArchiveKeys([
    'originals/Don Bosco en España_1922.pdf',
    'originals/Don Bosco en Espana_1922.pdf',
    'originals/Don Bosco en España_1923.pdf',
  ]);
  assert.equal(result.total, 3);
  assert.equal(result.recognized, 1);
  assert.equal(result.review, 2);
  assert.equal(result.entries[0].reason, 'Duplicate publication year');
  assert.equal(result.entries[1].reason, 'Duplicate publication year');
});
