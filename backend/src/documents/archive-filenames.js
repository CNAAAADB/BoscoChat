// Only a single basename under the private originals/ prefix is accepted.
// No folder separators, traversal, control characters, leading dots or URLs.
export function safeArchivePdfFilename(value) {
  if (typeof value !== 'string') return null;
  const filename = value.normalize('NFC');
  if (filename.length < 5 || filename.length > 160 || filename.includes('..')
      || filename.trim() !== filename
      || !/^[\p{L}\p{N}][\p{L}\p{N} ._()\-]{0,155}\.pdf$/iu.test(filename)) return null;
  return filename;
}

export function safeArchivePdfKey(value) {
  const name = safeArchivePdfFilename(value);
  return name ? 'originals/' + name : null;
}
