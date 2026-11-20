// SQS envelope for S3 EventBridge notifications. Strict allowlist: annual PDFs only.
import { parseArchiveKey } from '../src/documents/archive-keys.js';
import { safeArchivePdfKey } from '../src/documents/archive-filenames.js';

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
    const size = payload.detail?.object?.size;
    if (size != null && (!Number.isSafeInteger(size) || size < 1 || size > 350 * 1024 * 1024)) {
      throw new Error('Invalid S3 object size');
    }
    // The OCR staging prefix has its own explicit submit API. Its S3
    // notifications must be acknowledged, not retried as malformed PDFs.
    if (typeof key === 'string'
      && (/^imports\/(?:tiff|jobs|reviews)\//.test(key))) continue;
    if (parseArchiveKey(key).status !== 'recognized') {
      // A safe, nonannual PDF belongs in the private directory but awaits
      // cataloguing; acknowledge its notification without poisoning the DLQ.
      if (typeof key === 'string' && key.startsWith('originals/')
        && safeArchivePdfKey(key.slice('originals/'.length)) === key) continue;
      throw new Error('Unexpected archive key');
    }
    objects.push({ key, eventId: payload.id });
  }
  return objects;
}
