// Parse source-qualified document names, never authorization from filenames.
const ROOT = 'originals/';
const VALID_EXT = /\.pdf$/i;

export function parseArchiveKey(key) {
  if (typeof key !== 'string' || !key.startsWith(ROOT) || !VALID_EXT.test(key)) {
    return { status: 'unsupported', key, reason: 'Not a PDF under originals/' };
  }
  const relative = key.slice(ROOT.length);
  if (!relative || relative.includes('/') || relative.includes('\\') || relative.includes('..')) {
    return { status: 'unsupported', key, reason: 'Unexpected PDF key layout' };
  }
  const name = relative.normalize('NFC');
  const annual = /^Don Bosco en Espa(?:ñ|n)a[_ -](\d{4})\.pdf$/i.exec(name);
  if (annual) {
    const year = Number(annual[1]);
    if (year < 1922 || year > 2100) {
      return { status: 'review', key, reason: 'Year outside expected range' };
    }
    return { status: 'recognized', key, publication: 'Don Bosco en España', year, originalFilename: relative };
  }
  const monthly = /^Bolet[ií]n Salesiano[ _-](\d{4})(0[1-9]|1[0-2])[ _-]N(\d{3,4})\.pdf$/iu.exec(name);
  if (monthly) {
    const year = Number(monthly[1]), month = Number(monthly[2]), issueNumber = Number(monthly[3]);
    if (year < 1886 || year > 2100 || issueNumber < 1) {
      return { status: 'review', key, reason: 'Year or issue outside expected range' };
    }
    return { status: 'recognized', key, publication: 'Boletín Salesiano', year, month, issueNumber, originalFilename: relative };
  }
  return { status: 'review', key, reason: 'Publication and issue metadata not recognized' };
}

export function analyzeArchiveKeys(keys) {
  if (!Array.isArray(keys)) throw new TypeError('S3 keys must be an array');
  const entries = keys.map(parseArchiveKey);
  const seen = new Map();
  for (const entry of entries) {
    if (entry.status !== 'recognized') continue;
    const identity = entry.month
      ? [entry.publication, entry.year, entry.month, entry.issueNumber].join('|')
      : [entry.publication, entry.year, 'annual'].join('|');
    const prior = seen.get(identity);
    if (prior) {
      const reason = entry.month ? 'Duplicate publication issue' : 'Duplicate publication year';
      entry.status = 'review';
      entry.reason = reason;
      prior.status = 'review';
      prior.reason = reason;
    } else seen.set(identity, entry);
  }
  return {
    total: entries.length,
    recognized: entries.filter((entry) => entry.status === 'recognized').length,
    review: entries.filter((entry) => entry.status === 'review').length,
    unsupported: entries.filter((entry) => entry.status === 'unsupported').length,
    entries,
  };
}
