// Source labels are visible even before a new collection has been indexed.
export const ARCHIVE_PUBLICATIONS = Object.freeze([
  { value: '', label: 'Todas las fuentes' },
  { value: 'Don Bosco en España', label: 'Don Bosco en España' },
  { value: 'Boletín Salesiano', label: 'Boletín Salesiano' },
]);

export function filterHistoricalDocuments(documents, { query = '', publication = '', year = '' } = {}) {
  const needle = String(query).trim().toLocaleLowerCase('es');
  return documents.filter((doc) => {
    const name = String(doc.filename ?? '').toLocaleLowerCase('es');
    const source = String(doc.publication ?? '');
    return (!needle || name.includes(needle) || source.toLocaleLowerCase('es').includes(needle))
      && (!publication || source === publication)
      && (!year || String(doc.year ?? '') === String(year));
  });
}
