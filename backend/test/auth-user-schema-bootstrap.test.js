import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureUserSuspensionColumn } from '../src/db/auth-user-schema-bootstrap.js';

test('BC-001 detects existing suspension column without modification', async () => {
  const statements = [];
  await ensureUserSuspensionColumn({ async execute(sql) { statements.push(sql); return [[{ count: 1 }]]; } });
  assert.equal(statements.length, 1);
  assert.match(statements[0], /information_schema.COLUMNS/);
});

test('BC-001 adds only a nullable suspension timestamp when absent', async () => {
  const statements = [];
  await ensureUserSuspensionColumn({ async execute(sql) { statements.push(sql); return statements.length === 1 ? [[{ count: 0 }]] : [[]]; } });
  assert.equal(statements.length, 2);
  assert.equal(statements[1], 'ALTER TABLE users ADD COLUMN suspended_at TIMESTAMP NULL DEFAULT NULL AFTER role');
});

test('BC-001 does not change accounts when schema inspection fails', async () => {
  await assert.rejects(ensureUserSuspensionColumn({ async execute() { return [[]]; } }), /Cannot verify/);
});
