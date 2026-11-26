import { boletinIssue } from './boletin-issue.js';
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

// A year selects at most a few dozen historical issues. Drive the query from
// the indexed year first, then evaluate page text within those documents.
// A corpus-wide FULLTEXT COUNT timed out the production Lambda on 2026-11-26.
// Every LIKE pattern comes exclusively from the validated letters/digits of searchTerms().
async function searchArchivePagesWithinYear(pool, plan, { year, publication, monthParams, pageSize, offset }) {
  const patterns = (plan.mode === 'exact' ? [plan.words.join(' ')] : plan.words)
    .map((word) => '%' + word + '%');
  const clauses = patterns.map(() => 'p.text_content LIKE ?');
  const predicate = clauses.join(plan.mode === 'all' || plan.mode === 'exact' ? ' AND ' : ' OR ');
  const where = 'FROM archive_documents d STRAIGHT_JOIN archive_pages p ON p.document_id = d.id'
    + ' WHERE d.indexed_at IS NOT NULL AND d.publication_year = ?'
    + (publication !== null ? ' AND d.publication = ?' : '')
    + (monthParams.length ? ' AND d.s3_key REGEXP ?' : '')
    + ' AND (' + predicate + ')';
  const conditions = [year, ...(publication !== null ? [publication] : []), ...monthParams, ...patterns];
  const [countRows] = await pool.execute('SELECT COUNT(*) AS total ' + where, conditions);
  const total = Number(countRows[0]?.total ?? 0);
  const ranking = patterns.map(() => '(CASE WHEN p.text_content LIKE ? THEN 1 ELSE 0 END)').join(' + ');
  const [rows] = await pool.execute(
    'SELECT d.id AS document_id, d.s3_key, d.publication, d.publication_year,'
    + ' p.page_number, LEFT(p.text_content, 1600) AS text_content,'
    + ' (' + ranking + ') AS relevance '
    + where
    + ' ORDER BY relevance DESC, d.publication_year ASC, d.id ASC, p.page_number ASC'
    + ' LIMIT ? OFFSET ?',
    [...patterns, ...conditions, pageSize, offset],
  );
  return { rows, total };
}

export async function searchArchivePages(pool, rawQuery, { year = null, month = null, publication = null, page = 1, pageSize = 10, mode = 'relevance' } = {}) {
  const plan = searchPlan(rawQuery, mode);
  const parsedYear = year == null || year === '' ? null : Number(year);
  if (parsedYear !== null && (!Number.isInteger(parsedYear) || parsedYear < 1800 || parsedYear > 2100)) {
    throw searchError('INVALID_SEARCH_YEAR', 'El año de búsqueda no es válido.');
  }
  const byMonth = month !== null && month !== '';
  if (byMonth && !/^(0?[1-9]|1[0-2])$/.test(String(month))) {
    throw searchError('INVALID_SEARCH_MONTH', 'El mes debe estar entre 1 y 12.');
  }
  const monthParams = byMonth ? ['^originals/Bolet[ií]n Salesiano[ _-][0-9]{4}' + String(month).padStart(2, '0') + '[ _-]N[0-9]{3,4}[.]pdf$'] : [];
  let source = null;
  if (publication !== null && publication !== '') {
    if (typeof publication !== 'string' || publication !== publication.trim()
      || publication.length < 2 || publication.length > 180 || /[\x00-\x1f]/u.test(publication)) {
      throw searchError('INVALID_SEARCH_PUBLICATION', 'Selecciona una fuente válida.');
    }
    source = publication.normalize('NFC');
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
  if (parsedYear !== null) {
    const { rows, total } = await searchArchivePagesWithinYear(pool, plan, {
      year: parsedYear, publication: source, monthParams,
      pageSize: safePageSize, offset,
    });
    const results = rows.map((row) => ({
      document_id: row.document_id,
      ...boletinIssue(row.s3_key),
      publication: row.publication,
      publication_year: row.publication_year,
      page_number: row.page_number,
      text_content: excerptNearMatch(row.text_content, plan.words),
    }));
    return { results, total, page: safePage, pageSize: safePageSize,
      totalPages: Math.ceil(total / safePageSize) };
  }
  const sqlMode = plan.sqlMode; // An internal constant, not supplied by a caller.
  const where = `FROM archive_pages p JOIN archive_documents d ON d.id = p.document_id
      WHERE d.indexed_at IS NOT NULL
        AND MATCH(p.text_content) AGAINST (? IN ${sqlMode} MODE)
        AND (? IS NULL OR d.publication_year = ?)
        AND (? IS NULL OR d.publication = ?)${byMonth ? ' AND d.s3_key REGEXP ?' : ''}`;
  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total ${where}`,
    [plan.expression, parsedYear, parsedYear, source, source, ...monthParams],
  );
  const total = Number(countRows[0]?.total ?? 0);
  const [rows] = await pool.execute(
    `SELECT d.id AS document_id, d.s3_key, d.publication, d.publication_year,
            p.page_number, LEFT(p.text_content, 1600) AS text_content,
            MATCH(p.text_content) AGAINST (? IN ${sqlMode} MODE) AS relevance
       ${where}
      ORDER BY relevance DESC, d.publication_year ASC, d.id ASC, p.page_number ASC
      LIMIT ? OFFSET ?`,
    [plan.expression, plan.expression, parsedYear, parsedYear, source, source, ...monthParams, safePageSize, offset],
  );
  const results = rows.map((row) => ({
    document_id: row.document_id,
    ...boletinIssue(row.s3_key),
    publication: row.publication,
    publication_year: row.publication_year,
    page_number: row.page_number,
    text_content: excerptNearMatch(row.text_content, plan.words),
  }));
  return { results, total, page: safePage, pageSize: safePageSize, totalPages: Math.ceil(total / safePageSize) };
}
