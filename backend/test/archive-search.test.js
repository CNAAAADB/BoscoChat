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

test('BC-008 searches safely with bound params, relevance and year filter', async () => {
  let statement, values;
  const pool = { async execute(sql, params) { statement = sql; values = params; return [[{ document_id: 1, publication_year: 1922, page_number: 8, text_content: 'Early text. Don Bosco visited Barcelona.' }]]; } };
  const rows = await searchArchivePages(pool, 'Don Bosco', { year: '1922', limit: 500 });
  assert.equal(rows[0].page_number, 8);
  assert.equal(rows.length, 1);
  assert.match(statement, /IN NATURAL LANGUAGE MODE/);
  assert.match(statement, /MATCH\(p.text_content\)/);
  assert.deepEqual(values, ['Don Bosco', 'Don Bosco', 1922, 1922, 10]);
  await searchArchivePages(pool, 'Don Bosco', { mode: 'exact' });
  assert.match(statement, /IN BOOLEAN MODE/);
  assert.deepEqual(values, ['"Don Bosco"', '"Don Bosco"', null, null, 10]);
  await assert.rejects(searchArchivePages(pool, 'Don Bosco', { year: 'not-a-year' }), /año/);
});

test('BC-011 snippets include the search term even when text begins elsewhere', () => {
  const snippet = excerptNearMatch('a'.repeat(700) + ' Don Bosco is here ' + 'b'.repeat(700), ['Bosco']);
  assert.match(snippet, /Bosco/);
  assert.ok(snippet.length <= 282);
  assert.ok(snippet.startsWith('…'));
});
