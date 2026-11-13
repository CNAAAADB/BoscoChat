import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureAuthRateLimitTable } from '../src/db/auth-rate-limit-bootstrap.js';

test('BC-008 bootstraps only the existing canonical auth-rate-limit schema', async () => {
  const statements = [];
  await ensureAuthRateLimitTable({ async execute(sql) { statements.push(sql); return [[], []]; } });
  assert.equal(statements.length, 1);
  assert.match(statements[0], /^CREATE TABLE IF NOT EXISTS auth_rate_limits/);
  assert.match(statements[0], /bucket_key CHAR\(64\) CHARACTER SET ascii COLLATE ascii_bin/);
  assert.match(statements[0], /PRIMARY KEY \(bucket_key\)/);
  assert.match(statements[0], /ix_auth_rate_limits_reset_at \(reset_at\)/);
  assert.doesNotMatch(statements[0], /DROP|TRUNCATE|DELETE|UPDATE\s+auth_rate_limits/i);
});

test('BC-008 schema bootstrap propagates database errors instead of serving unthrottled traffic', async () => {
  await assert.rejects(ensureAuthRateLimitTable({ async execute() { throw new Error('permission denied'); } }), /permission denied/);
});
