import assert from 'node:assert/strict';
import test from 'node:test';
import { ensurePasswordResetSchema } from '../src/db/password-reset-bootstrap.js';

test('BC-002 creates only the token table with the actual users.id type', async () => {
  const queries = [];
  const pool = { async execute(sql, values) {
    queries.push({ sql, values });
    return queries.length === 1 ? [[{ type: 'bigint unsigned' }]] : [[]];
  } };
  await ensurePasswordResetSchema(pool);
  assert.equal(queries.length, 2);
  assert.match(queries[1].sql, /^CREATE TABLE IF NOT EXISTS password_reset_tokens/);
  assert.match(queries[1].sql, /user_id bigint unsigned NOT NULL/);
  assert.match(queries[1].sql, /FOREIGN KEY \(user_id\) REFERENCES users\(id\) ON DELETE CASCADE/);
  assert.doesNotMatch(queries[1].sql, /DROP|TRUNCATE|UPDATE\s+users/i);
});

test('BC-002 rejects unexpected schema metadata before issuing DDL', async () => {
  let calls = 0;
  await assert.rejects(ensurePasswordResetSchema({ async execute() {
    calls++;
    return [[{ type: 'varchar(255)' }]];
  } }), /INVALID_USERS_ID_COLUMN_TYPE/);
  assert.equal(calls, 1);
});
