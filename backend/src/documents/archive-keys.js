// Parse document metadata only from trusted S3 inventory keys; never infer authorization from filenames.
const ROOT = 'originals/';
const YEAR_MIN = 1922;
const YEAR_MAX = 2100;
const VALID_EXT = /\.pdf$/i;

export function parseArchiveKey(key) {
  if (typeof key !== 'string' || !key.startsWith(ROOT) || !VALID_EXT.test(key)) {
    return { status: 'unsupported', key, reason: 'Not a PDF under originals/' };
  }
  const relative = key.slice(ROOT.length);
  if (!relative || relative.includes('/') || relative.includes('\\') || relative.includes('..')) {
    return { status: 'unsupported', key, reason: 'Unexpected PDF key layout' };
  }
  const match = /^Don Bosco en Espa(?:ñ|n)a[_ -](\d{4})\.pdf$/i.exec(relative.normalize('NFC'));
  if (!match) {
    return { status: 'review', key, reason: 'Publication or annual year not recognized' };
  }
  const year = Number(match[1]);
  if (!Number.isInteger(year) || year < YEAR_MIN || year > YEAR_MAX) {
    return { status: 'review', key, reason: 'Year outside expected range' };
  }
  return {
    status: 'recognized',
    key,
    publication: 'Don Bosco en España',
    year,
    originalFilename: relative,
  };
}

export function analyzeArchiveKeys(keys) {
  if (!Array.isArray(keys)) throw new TypeError('S3 keys must be an array');
  const entries = keys.map(parseArchiveKey);
  const years = new Map();
  for (const entry of entries) {
    if (entry.status !== 'recognized') continue;
    const prior = years.get(entry.year);
    if (prior) {
      entry.status = 'review';
      entry.reason = 'Duplicate publication year';
      prior.status = 'review';
      prior.reason = 'Duplicate publication year';
    } else {
      years.set(entry.year, entry);
    }
  }
  return {
    total: entries.length,
    recognized: entries.filter((entry) => entry.status === 'recognized').length,
    review: entries.filter((entry) => entry.status === 'review').length,
    unsupported: entries.filter((entry) => entry.status === 'unsupported').length,
    entries,
  };
}
