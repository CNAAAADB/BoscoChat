import assert from 'node:assert/strict';
import test from 'node:test';
import { booleanSearchExpression, searchArchivePages, searchPlan, excerptNearMatch } from '../src/documents/archive-search.js';

test('BC-008 keeps compatible explicit all-word boolean expression with safe words only', () => {
  assert.equal(booleanSearchExpression('Don Bosco Barcelona'), '+Don +Bosco +Barcelona');
  assert.equal(booleanSearchExpression('  escuela* +salesiana  '), '+escuela +salesiana');
  assert.equal(booleanSearchExpression('María y José'), '+María +José');
  assert.throws(() => booleanSearchExpression(' '), (error) => error.status === 400);
  assert.throws(() => booleanSearchExpression('x'.repeat(181)), (error) => error.status === 400);
});

test('BC-008 defaults to relevance-ranked search and permits partial matching', () => {
  const p = searchPlan('Don Bosco en Barcelona');
  assert.deepEqual({ mode: p.mode, sqlMode: p.sqlMode, expression: p.expression }, {
    mode: 'relevance', sqlMode: 'NATURAL LANGUAGE', expression: 'Don Bosco en Barcelona',
  });
  assert.equal(searchPlan('Don Bosco', 'all').expression, '+Don +Bosco');
  assert.equal(searchPlan('Don Bosco', 'any').expression, 'Don Bosco');
  assert.equal(searchPlan('Don Bosco', 'exact').expression, '"Don Bosco"');
  assert.throws(() => searchPlan('Don Bosco', 'unsupported'), (e) => e.code === 'INVALID_SEARCH_MODE');
});

test('BC-008/BC-011 paginates all matches with a bounded page size and stable ranking', async () => {
  const queries = [];
  const pool = { async execute(sql, params) {
    queries.push({ sql, params });
    if (sql.includes('COUNT(*)')) return [[{ total: 127 }]];
    return [[{ document_id: 1, publication: 'Don Bosco en España', publication_year: 1922, page_number: 8, text_content: 'Early text. Don Bosco visited Barcelona.' }]];
  } };
  const first = await searchArchivePages(pool, 'Don Bosco', { year: '1922' });
  assert.equal(first.total, 127);
  assert.equal(first.totalPages, 13);
  assert.equal(first.page, 1);
  assert.equal(first.pageSize, 10);
  assert.equal(first.results[0].page_number, 8);
  assert.match(queries[0].sql, /COUNT\(\*\)/);
  assert.deepEqual(queries[0].params, ['Don Bosco', 1922, 1922]);
  assert.match(queries[1].sql, /ORDER BY relevance DESC, d.publication_year ASC, d.id ASC, p.page_number ASC/);
  assert.deepEqual(queries[1].params, ['Don Bosco', 'Don Bosco', 1922, 1922, 10, 0]);

  const later = await searchArchivePages(pool, 'Don Bosco', { page: '3', pageSize: '20', mode: 'exact' });
  assert.equal(later.totalPages, 7);
  assert.equal(later.page, 3);
  assert.equal(later.pageSize, 20);
  assert.match(queries[3].sql, /IN BOOLEAN MODE/);
  assert.deepEqual(queries[3].params, ['"Don Bosco"', '"Don Bosco"', null, null, 20, 40]);
  await assert.rejects(searchArchivePages(pool, 'Don Bosco', { year: 'not-a-year' }), (e) => e.code === 'INVALID_SEARCH_YEAR');
  for (const options of [{ page: '0' }, { page: '1.5' }, { page: 'many' }, { pageSize: '1000' }, { pageSize: '0' }, { page: '1000001' }]) {
    await assert.rejects(searchArchivePages(pool, 'Don Bosco', options), (e) => e.status === 400);
  }
});

test('BC-011 snippets include the search term even when text begins elsewhere', () => {
  const snippet = excerptNearMatch('a'.repeat(700) + ' Don Bosco is here ' + 'b'.repeat(700), ['Bosco']);
  assert.match(snippet, /Bosco/);
  assert.ok(snippet.length <= 282);
  assert.ok(snippet.startsWith('…'));
});
