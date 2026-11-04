import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthRateLimiter } from '../src/middleware/auth-rate-limit.js';

function invoke(limiter, { ip = '203.0.113.8', email }) {
  const result = { status: null, body: null, next: false, retryAfter: null };
  const req = { ip, body: { email } };
  const res = {
    locals: {},
    set(name, value) { if (name === 'Retry-After') result.retryAfter = value; },
    status(value) { result.status = value; return this; },
    json(value) { result.body = value; return this; },
  };
  limiter(req, res, () => { result.next = true; });
  return result;
}

test('CWE-400: rotating identities cannot bypass the aggregate IP limit', () => {
  const limiter = createAuthRateLimiter({ limit: 5, ipLimit: 4, windowMs: 60_000, now: () => 1_000 });
  for (let index = 0; index < 4; index += 1) {
    assert.equal(invoke(limiter, { email: `rotated-${index}@example.test` }).next, true);
  }
  const blocked = invoke(limiter, { email: 'new-identity@example.test' });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.error.code, 'TOO_MANY_ATTEMPTS');
  assert.equal(blocked.retryAfter, '60');
});

test('clearing a successful identity does not clear the aggregate IP bucket', () => {
  const limiter = createAuthRateLimiter({ limit: 2, ipLimit: 3, windowMs: 60_000, now: () => 1_000 });
  const first = invoke(limiter, { email: 'known@example.test' });
  limiter.clear('identity:203.0.113.8|known@example.test');
  assert.equal(first.next, true);
  assert.equal(invoke(limiter, { email: 'second@example.test' }).next, true);
  assert.equal(invoke(limiter, { email: 'third@example.test' }).next, true);
  assert.equal(invoke(limiter, { email: 'fourth@example.test' }).status, 429);
});
