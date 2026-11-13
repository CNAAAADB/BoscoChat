import { createHmac } from 'node:crypto';

// Invisible per-user JPEG COM marker. Metadata-only traceability is a
// preliminary control; robust resilient watermarking still needs BC-012 review.
export function watermarkPageJpeg(jpeg, { userId, documentId, pageNumber, secret }) {
  if (!Buffer.isBuffer(jpeg) || jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) {
    throw new Error('INVALID_JPEG');
  }
  if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32) {
    throw new Error('ARCHIVE_WATERMARK_SECRET_REQUIRED');
  }
  const digest = createHmac('sha256', secret)
    .update('boscochat-image-watermark-v1:' + String(userId) + ':' + String(documentId) + ':' + String(pageNumber))
    .digest('hex');
  const marker = Buffer.from('BoscoChat:v1:' + digest, 'ascii');
  const size = marker.length + 2;
  const header = Buffer.from([0xff, 0xfe, (size >> 8) & 0xff, size & 0xff]);
  return Buffer.concat([jpeg.subarray(0, 2), header, marker, jpeg.subarray(2)]);
}
