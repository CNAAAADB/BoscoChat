import assert from 'node:assert/strict';
import test from 'node:test';
import { booleanSearchExpression, searchArchivePages } from '../src/documents/archive-search.js';

test('BC-008 transforms normal terms into required boolean terms without MySQL operators', () => {
  assert.equal(booleanSearchExpression('Don Bosco Barcelona'), '+Don +Bosco +Barcelona');
  assert.equal(booleanSearchExpression('  escuela* +salesiana  '), '+escuela +salesiana');
  assert.equal(booleanSearchExpression('María y José'), '+María +José');
  assert.throws(() => booleanSearchExpression(' '), (error) => error.status === 400);
  assert.throws(() => booleanSearchExpression('x'.repeat(181)), (error) => error.status === 400);
});

test('BC-008 searches indexed pages with bound parameters and optional annual filter', async () => {
  let statement, values;
  const pool = { async execute(sql, params) { statement = sql; values = params; return [[{ document_id: 1, publication_year: 1922, page_number: 8 }]]; } };
  const rows = await searchArchivePages(pool, 'Don Bosco', { year: '1922', limit: 500 });
  assert.equal(rows[0].page_number, 8);
  assert.equal(rows.length, 1);
  assert.match(statement, /MATCH\(p.text_content\)/);
  assert.deepEqual(values, ['+Don +Bosco', '+Don +Bosco', 1922, 1922, 10]);
  await assert.rejects(searchArchivePages(pool, 'Don Bosco', { year: 'not-a-year' }), /año/);
});
