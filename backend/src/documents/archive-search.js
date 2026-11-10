// Initial full-text keyword search; no PDF is searchable until its pages are ingested.
export function booleanSearchExpression(query) {
  if (typeof query !== 'string') throw new TypeError('Search query must be a string');
  const normalized = query.trim().normalize('NFC');
  if (normalized.length < 2 || normalized.length > 180) {
    const error = new Error('La búsqueda debe contener entre 2 y 180 caracteres.');
    error.status = 400;
    error.code = 'INVALID_SEARCH_QUERY';
    throw error;
  }
  // Keep only words; never forward user-supplied boolean operators or special operators to MySQL.
  const terms = normalized.match(/[\p{L}\p{N}]{2,}/gu) ?? [];
  if (terms.length === 0 || terms.length > 12) {
    const error = new Error('Introduce entre 1 y 12 palabras de al menos dos caracteres.');
    error.status = 400;
    error.code = 'INVALID_SEARCH_QUERY';
    throw error;
  }
  return terms.map((word) => '+' + word).join(' ');
}

export async function searchArchivePages(pool, rawQuery, { year = null, limit = 10 } = {}) {
  const expression = booleanSearchExpression(rawQuery);
  const parsedYear = year == null || year === '' ? null : Number(year);
  if (parsedYear !== null && (!Number.isInteger(parsedYear) || parsedYear < 1922 || parsedYear > 2100)) {
    const error = new Error('El año de búsqueda no es válido.');
    error.status = 400;
    error.code = 'INVALID_SEARCH_YEAR';
    throw error;
  }
  const safeLimit = 10; // Public preview has a fixed maximum of ten results.
  const [rows] = await pool.execute(
    `SELECT d.id AS document_id, d.publication, d.publication_year,
            p.page_number, LEFT(p.text_content, 220) AS text_content,
            MATCH(p.text_content) AGAINST (? IN BOOLEAN MODE) AS relevance
       FROM archive_pages p JOIN archive_documents d ON d.id = p.document_id
      WHERE d.indexed_at IS NOT NULL
        AND MATCH(p.text_content) AGAINST (? IN BOOLEAN MODE)
        AND (? IS NULL OR d.publication_year = ?)
      ORDER BY relevance DESC, d.publication_year ASC, p.page_number ASC
      LIMIT ?`,
    [expression, expression, parsedYear, parsedYear, safeLimit],
  );
  return rows.map((row) => ({ document_id: row.document_id, publication: row.publication, publication_year: row.publication_year, page_number: row.page_number, text_content: row.text_content }));
}
