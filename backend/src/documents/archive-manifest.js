import { analyzeArchiveKeys } from './archive-keys.js';

// AWS CLI list-objects-v2 produces JSON Contents[].Key, Size, ETag, LastModified.
// This input is untrusted inventory metadata; it is NOT proof of file integrity.
export function summarizeS3Inventory(response) {
  if (!response || !Array.isArray(response.Contents)) {
    throw new TypeError('Expected AWS S3 list-objects-v2 JSON with Contents array');
  }
  const objects = response.Contents.filter((object) => object && typeof object.Key === 'string');
  const parsed = analyzeArchiveKeys(objects.map((object) => object.Key));
  const records = parsed.entries.map((entry, index) => ({
    ...entry,
    sizeBytes: Number.isSafeInteger(objects[index].Size) && objects[index].Size >= 0 ? objects[index].Size : null,
    lastModified: typeof objects[index].LastModified === 'string' ? objects[index].LastModified : null,
  }));
  return {
    bucket: 'boscochat-archivo-pdfs',
    prefix: 'originals/',
    scanned: objects.length,
    recognized: records.filter((record) => record.status === 'recognized').length,
    needsReview: records.filter((record) => record.status !== 'recognized').length,
    truncated: Boolean(response.IsTruncated),
    records,
  };
}
