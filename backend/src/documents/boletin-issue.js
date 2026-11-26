import { parseArchiveKey } from './archive-keys.js';

// Read issue metadata from a verified S3 basename, not from unreliable OCR.
export function boletinIssue(key) {
  const meta = parseArchiveKey(key);
  return meta.status === 'recognized' && meta.publication === 'Boletín Salesiano'
    ? { month: meta.month, issue_number: meta.issueNumber } : {};
}
