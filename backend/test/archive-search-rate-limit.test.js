import assert from 'node:assert/strict';
import test from 'node:test';
import { createArchiveSearchRateLimiter } from '../src/middleware/archive-search-rate-limit.js';

function makeResponse() {
  return {
    statusCode: 200, headers: {}, payload: null,
    set(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

test('BC-008 public search is limited per IP with opaque, stable keys and 429 headers', async () => {
  const entries = new Map();
  const store = {
    async consume(keys, options) {
      assert.match(keys.ip, /^[a-f0-9]{64}$/);
      assert.notEqual(keys.ip, keys.identity);
      const count = (entries.get(keys.ip) ?? 0) + 1;
      entries.set(keys.ip, count);
      return count > options.ipLimit ? { resetAt: options.resetAt } : null;
    },
  };
  const middleware = createArchiveSearchRateLimiter({ store, hashKey: 'a'.repeat(32), now: () => 1000, limit: 2 });
  const invoke = async (ip) => {
    const res = makeResponse();
    let continued = false;
    await middleware({ ip }, res, () => { continued = true; });
    return { res, continued };
  };
  assert.equal((await invoke('203.0.113.10')).continued, true);
  assert.equal((await invoke('203.0.113.10')).continued, true);
  const denied = await invoke('203.0.113.10');
  assert.equal(denied.res.statusCode, 429);
  assert.equal(denied.res.payload.error.code, 'SEARCH_RATE_LIMITED');
  assert.equal(denied.res.headers['Retry-After'], '60');
  assert.equal(denied.res.headers['Cache-Control'], 'no-store');
  assert.equal((await invoke('203.0.113.11')).continued, true);
  assert.equal(entries.size, 2);
});

test('BC-008 public search fails closed if the shared store is unavailable', async () => {
  const middleware = createArchiveSearchRateLimiter({
    store: { async consume() { throw new Error('database unavailable'); } },
  });
  let observed;
  await middleware({ ip: '127.0.0.1' }, makeResponse(), (error) => { observed = error; });
  assert.match(observed.message, /database unavailable/);
});
