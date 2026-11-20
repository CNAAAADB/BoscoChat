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
    return { mode, expression: words.join(' '), sqlMode: 'NATURAL LANGUAGE', words };
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

export async function searchArchivePages(pool, rawQuery, { year = null, page = 1, pageSize = 10, mode = 'relevance', issueMetadataEnabled = false } = {}) {
  const plan = searchPlan(rawQuery, mode);
  const parsedYear = year == null || year === '' ? null : Number(year);
  if (parsedYear !== null && (!Number.isInteger(parsedYear) || parsedYear < 1922 || parsedYear > 2100)) {
    throw searchError('INVALID_SEARCH_YEAR', 'El año de búsqueda no es válido.');
  }
  // Bound the amount of work per request; pages remain independently retrievable.
  const safePage = Number(page);
  const safePageSize = Number(pageSize);
  if (!Number.isSafeInteger(safePage) || safePage < 1 || safePage > 1000000) {
    throw searchError('INVALID_SEARCH_PAGE', 'La página solicitada no es válida.');
  }
  if (![10, 20, 50].includes(safePageSize)) {
    throw searchError('INVALID_SEARCH_PAGE_SIZE', 'Selecciona 10, 20 o 50 resultados por página.');
  }
  const offset = (safePage - 1) * safePageSize;
  const sqlMode = plan.sqlMode; // An internal constant, not supplied by a caller.
  const issueJoin = issueMetadataEnabled ? 'LEFT JOIN archive_fragmentation_issues fi ON fi.document_id = d.id' : '';
  const issueColumns = issueMetadataEnabled
    ? 'fi.month_start AS month_start, fi.month_end AS month_end, fi.issue_number AS issue_number'
    : 'NULL AS month_start, NULL AS month_end, NULL AS issue_number';
  const where = `FROM archive_pages p JOIN archive_documents d ON d.id = p.document_id
      ${issueJoin}
      WHERE d.indexed_at IS NOT NULL
        AND MATCH(p.text_content) AGAINST (? IN ${sqlMode} MODE)
        AND (? IS NULL OR d.publication_year = ?)`;
  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total ${where}`,
    [plan.expression, parsedYear, parsedYear],
  );
  const total = Number(countRows[0]?.total ?? 0);
  const [rows] = await pool.execute(
    `SELECT d.id AS document_id, d.publication, d.publication_year,
            ${issueColumns},
            p.page_number, LEFT(p.text_content, 1600) AS text_content,
            MATCH(p.text_content) AGAINST (? IN ${sqlMode} MODE) AS relevance
       ${where}
      ORDER BY relevance DESC, d.publication_year ASC, d.id ASC, p.page_number ASC
      LIMIT ? OFFSET ?`,
    [plan.expression, plan.expression, parsedYear, parsedYear, safePageSize, offset],
  );
  const results = rows.map((row) => ({
    document_id: row.document_id,
    publication: row.publication,
    publication_year: row.publication_year,
    month_start: row.month_start ?? null,
    month_end: row.month_end ?? null,
    issue_number: row.issue_number ?? null,
    page_number: row.page_number,
    text_content: excerptNearMatch(row.text_content, plan.words),
  }));
  return { results, total, page: safePage, pageSize: safePageSize, totalPages: Math.ceil(total / safePageSize) };
}
