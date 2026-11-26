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

test('BC-110 recognizes monthly Boletín Salesiano with year, month and issue', () => {
  const key = 'originals/Boletin Salesiano 188610 N001.pdf';
  assert.deepEqual(parseArchiveKey(key), {
    status: 'recognized', key, publication: 'Boletín Salesiano', year: 1886,
    month: 10, issueNumber: 1, originalFilename: 'Boletin Salesiano 188610 N001.pdf',
  });
  const accented = parseArchiveKey('originals/Boletín Salesiano_200802_N002.pdf');
  assert.equal(accented.status, 'recognized');
  assert.equal(accented.month, 2);
  assert.equal(accented.issueNumber, 2);
  assert.equal(parseArchiveKey('originals/Boletin Salesiano 194100 N000.pdf').status, 'review');
  assert.equal(parseArchiveKey('originals/Boletin Salesiano 188613 N013.pdf').status, 'review');
  assert.equal(parseArchiveKey('originals/188610_N001.pdf').status, 'review');
});
test('BC-110 separate monthly issues are independent, duplicates are flagged', () => {
  const r = analyzeArchiveKeys([
    'originals/Boletin Salesiano 188610 N001.pdf',
    'originals/Boletin Salesiano 188611 N002.pdf',
    'originals/Boletín Salesiano_188610_N001.pdf',
  ]);
  assert.equal(r.recognized, 1);
  assert.equal(r.review, 2);
  assert.equal(r.entries[0].reason, 'Duplicate publication issue');
  assert.equal(r.entries[1].month, 11);
});
