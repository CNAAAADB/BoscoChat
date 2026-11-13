// Ranked archive discovery. Never interpolate user input into SQL syntax.
function searchError(code, message) {
  const error = new Error(message);
  error.status = 400;
  error.code = code;
  return error;
}

export function searchTerms(query) {
  if (typeof query !== 'string') throw searchError('INVALID_SEARCH_QUERY', 'Introduce una búsqueda válida.');
  const normalized = query.trim().normalize('NFC');
  if (normalized.length < 2 || normalized.length > 180) {
    throw searchError('INVALID_SEARCH_QUERY', 'La búsqueda debe contener entre 2 y 180 caracteres.');
  }
  const words = normalized.match(/[\p{L}\p{N}]{2,}/gu) ?? [];
  if (words.length === 0 || words.length > 12) {
    throw searchError('INVALID_SEARCH_QUERY', 'Introduce entre 1 y 12 palabras de al menos dos caracteres.');
  }
  return { normalized, words };
}

export function booleanSearchExpression(query) {
  return searchTerms(query).words.map((word) => '+' + word).join(' ');
}

export function searchPlan(rawQuery, rawMode = 'relevance') {
  const { normalized, words } = searchTerms(rawQuery);
  const mode = rawMode ?? 'relevance';
  if (!['relevance', 'all', 'any', 'exact'].includes(mode)) {
    throw searchError('INVALID_SEARCH_MODE', 'El tipo de búsqueda no es válido.');
  }
  if (mode === 'relevance') {
    // MySQL natural-language search ranks matching pages even when only some terms match.
    return { mode, expression: normalized.replace(/["'+~*<>()[\]{}]/g, ' '), sqlMode: 'NATURAL LANGUAGE', words };
  }
  if (mode === 'exact') {
    // Build the phrase from normalized words: user-supplied Boolean syntax is never forwarded.
    return { mode, expression: '"' + words.join(' ') + '"', sqlMode: 'BOOLEAN', words };
  }
  return { mode, expression: words.map((word) => (mode === 'all' ? '+' : '') + word).join(' '), sqlMode: 'BOOLEAN', words };
}

export function excerptNearMatch(text, words, maxLength = 280) {
  const value = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
  if (value.length <= maxLength) return value;
  const lowercase = value.toLocaleLowerCase('es');
  const matches = words.map((word) => lowercase.indexOf(word.toLocaleLowerCase('es'))).filter((index) => index >= 0);
  const first = matches.length ? Math.min(...matches) : 0;
  const start = Math.max(0, first - 70);
  const end = Math.min(value.length, start + maxLength);
  return (start ? '…' : '') + value.slice(start, end) + (end < value.length ? '…' : '');
}

export async function searchArchivePages(pool, rawQuery, { year = null, limit = 10, mode = 'relevance' } = {}) {
  const plan = searchPlan(rawQuery, mode);
  const parsedYear = year == null || year === '' ? null : Number(year);
  if (parsedYear !== null && (!Number.isInteger(parsedYear) || parsedYear < 1922 || parsedYear > 2100)) {
    throw searchError('INVALID_SEARCH_YEAR', 'El año de búsqueda no es válido.');
  }
  const safeLimit = 10;
  const sqlMode = plan.sqlMode; // An internal constant, not supplied by a caller.
  const [rows] = await pool.execute(
    `SELECT d.id AS document_id, d.publication, d.publication_year,
            p.page_number, LEFT(p.text_content, 1600) AS text_content,
            MATCH(p.text_content) AGAINST (? IN ${sqlMode} MODE) AS relevance
       FROM archive_pages p JOIN archive_documents d ON d.id = p.document_id
      WHERE d.indexed_at IS NOT NULL
        AND MATCH(p.text_content) AGAINST (? IN ${sqlMode} MODE)
        AND (? IS NULL OR d.publication_year = ?)
      ORDER BY relevance DESC, d.publication_year ASC, p.page_number ASC
      LIMIT ?`,
    [plan.expression, plan.expression, parsedYear, parsedYear, safeLimit],
  );
  return rows.map((row) => ({
    document_id: row.document_id,
    publication: row.publication,
    publication_year: row.publication_year,
    page_number: row.page_number,
    text_content: excerptNearMatch(row.text_content, plan.words),
  }));
}
