import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthRateLimiter, MemoryAuthRateLimitStore } from '../src/middleware/auth-rate-limit.js';

async function invoke(limiter, { ip = '203.0.113.8', email }) {
  const result = { status: null, body: null, next: false, error: null, retryAfter: null, authRateLimitKey: null };
  const req = { ip, body: { email } };
  const res = {
    locals: {},
    set(name, value) { if (name === 'Retry-After') result.retryAfter = value; },
    status(value) { result.status = value; return this; },
    json(value) { result.body = value; return this; },
  };
  await limiter(req, res, (error) => {
    result.error = error ?? null;
    result.next = !error;
  });
  result.authRateLimitKey = res.locals.authRateLimitKey ?? null;
  return result;
}

test('CWE-400: rotating identities cannot bypass the aggregate IP limit', async () => {
  const limiter = createAuthRateLimiter({ limit: 5, ipLimit: 4, windowMs: 60_000, now: () => 1_000 });
  for (let index = 0; index < 4; index += 1) {
    assert.equal((await invoke(limiter, { email: `rotated-${index}@example.test` })).next, true);
  }
  const blocked = await invoke(limiter, { email: 'new-identity@example.test' });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.error.code, 'TOO_MANY_ATTEMPTS');
  assert.equal(blocked.retryAfter, '60');
});

test('clearing a successful identity does not clear the aggregate IP bucket', async () => {
  const limiter = createAuthRateLimiter({ limit: 2, ipLimit: 3, windowMs: 60_000, now: () => 1_000 });
  const first = await invoke(limiter, { email: 'known@example.test' });
  await limiter.clear(first.authRateLimitKey);
  assert.equal(first.next, true);
  assert.equal((await invoke(limiter, { email: 'second@example.test' })).next, true);
  assert.equal((await invoke(limiter, { email: 'third@example.test' })).next, true);
  assert.equal((await invoke(limiter, { email: 'fourth@example.test' })).status, 429);
});

test('CWE-400: independent application instances share the aggregate IP limit', async () => {
  const store = new MemoryAuthRateLimitStore();
  const options = { store, scope: 'login', limit: 5, ipLimit: 3, windowMs: 60_000, now: () => 1_000 };
  const instanceA = createAuthRateLimiter(options);
  const instanceB = createAuthRateLimiter(options);
  assert.equal((await invoke(instanceA, { email: 'one@example.test' })).next, true);
  assert.equal((await invoke(instanceB, { email: 'two@example.test' })).next, true);
  assert.equal((await invoke(instanceA, { email: 'three@example.test' })).next, true);
  assert.equal((await invoke(instanceB, { email: 'four@example.test' })).status, 429);
});

test('authentication fails closed when the shared limiter is unavailable', async () => {
  const store = { async consume() { throw new Error('shared store unavailable'); }, async clear() {} };
  const limiter = createAuthRateLimiter({ store });
  const result = await invoke(limiter, { email: 'known@example.test' });
  assert.equal(result.next, false);
  assert.match(result.error.message, /shared store unavailable/);
});
