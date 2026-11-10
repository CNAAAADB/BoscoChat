import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeS3Inventory } from '../src/documents/archive-manifest.js';

test('BC-006 summarizes real-shaped S3 inventory while preserving original keys', () => {
  const result = summarizeS3Inventory({ Contents: [
    { Key: 'originals/Don Bosco en España_1922.pdf', Size: 232323, LastModified: '2026-11-10T14:00:00Z' },
    { Key: 'originals/Don Bosco en España_1923.pdf', Size: 0 },
    { Key: 'originals/readme.txt', Size: 10 },
  ], IsTruncated: false });
  assert.equal(result.scanned, 3);
  assert.equal(result.recognized, 2);
  assert.equal(result.needsReview, 1);
  assert.equal(result.records[0].sizeBytes, 232323);
  assert.equal(result.records[0].year, 1922);
  assert.equal(result.records[2].status, 'unsupported');
});

test('BC-006 rejects missing inventory data and detects truncated pagination', () => {
  assert.throws(() => summarizeS3Inventory({}), /Contents/);
  const report = summarizeS3Inventory({ Contents: [], IsTruncated: true });
  assert.equal(report.truncated, true);
});
