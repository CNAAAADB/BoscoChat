import assert from 'node:assert/strict';
import { test } from 'node:test';
import { objectsFromQueueEvent } from '../worker/ingestion-events.js';

const event = (key = 'originals/Don Bosco en España_1923.pdf', more = {}) => ({
  Records: [{
    messageId: 'sqs-123',
    body: JSON.stringify({
      source: 'aws.s3', 'detail-type': 'Object Created', id: 'evt-123',
      detail: { bucket: { name: 'boscochat-archivo-pdfs' }, object: { key, size: 105560870 } },
      ...more,
    }),
  }],
});

test('BC-007 accepts exact S3 EventBridge object notifications', () => {
  assert.deepEqual(objectsFromQueueEvent(event()), [
    { key: 'originals/Don Bosco en España_1923.pdf', eventId: 'evt-123' },
  ]);
});
test('BC-007 does not process folder markers or arbitrary S3 keys', () => {
  assert.throws(() => objectsFromQueueEvent(event('originals/')), /Unexpected archive key/);
  assert.throws(() => objectsFromQueueEvent(event('originals/../secret.pdf')), /Unexpected archive key/);
});
test('BC-007 rejects wrong bucket or event source', () => {
  assert.throws(() => objectsFromQueueEvent(event(undefined, { source: 'other' })), /Unexpected queue message type/);
  assert.throws(() => objectsFromQueueEvent(event(undefined, { detail: { bucket: { name: 'different' }, object: { key: 'originals/Don Bosco en España_1923.pdf' } } })), /Unexpected archive bucket/);
});
test('BC-007 rejects huge object before downloading it', () => {
  assert.throws(() => objectsFromQueueEvent(event(undefined, { detail: { bucket: { name: 'boscochat-archivo-pdfs' }, object: { key: 'originals/Don Bosco en España_1923.pdf', size: 500000000 } } })), /Invalid S3 object size/);
});

test('BC-017 acknowledges safe nonannual original PDFs for later cataloguing without indexing', () => {
  assert.deepEqual(objectsFromQueueEvent(event('originals/Memoria Histórica 1982.pdf')), []);
  assert.deepEqual(objectsFromQueueEvent(event('originals/Boletín Salesiano.pdf')), []);
  assert.throws(() => objectsFromQueueEvent(event('originals/../secreto.pdf')), /Unexpected archive key/);
  assert.throws(() => objectsFromQueueEvent(event('originals/Memoria Histórica 1982.pdf', {
    detail: { bucket: { name: 'boscochat-archivo-pdfs' }, object: { key: 'originals/Memoria Histórica 1982.pdf', size: 500000000 } },
  })), /Invalid S3 object size/);
});

test('BC-106 acknowledges TIFF ZIP, job and review S3 events without touching PDF index', () => {
  const keys = [
    'imports/tiff/550e8400-e29b-41d4-a716-446655440000/lote.zip',
    'imports/jobs/550e8400-e29b-41d4-a716-446655440000.json',
    'imports/reviews/550e8400-e29b-41d4-a716-446655440000.json',
  ];
  for (const key of keys) assert.deepEqual(objectsFromQueueEvent(event(key)), []);
});
