// SQS envelope for S3 EventBridge notifications. Strict allowlist: annual PDFs only.
import { parseArchiveKey } from '../../src/documents/archive-keys.js';

export function objectsFromQueueEvent(event) {
  if (!Array.isArray(event?.Records)) throw new TypeError('Expected SQS records');
  const objects = [];
  for (const record of event.Records) {
    const payload = JSON.parse(record.body);
    if (payload.source !== 'aws.s3' || payload['detail-type'] !== 'Object Created') {
      throw new Error('Unexpected queue message type');
    }
    if (payload.detail?.bucket?.name !== 'boscochat-archivo-pdfs') {
      throw new Error('Unexpected archive bucket');
    }
    const key = payload.detail?.object?.key;
    if (parseArchiveKey(key).status !== 'recognized') {
      throw new Error('Unexpected archive key');
    }
    const size = payload.detail?.object?.size;
    if (size != null && (!Number.isSafeInteger(size) || size < 1 || size > 350 * 1024 * 1024)) {
      throw new Error('Invalid S3 object size');
    }
    objects.push({ key, eventId: payload.id });
  }
  return objects;
}
