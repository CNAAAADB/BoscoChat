import assert from 'node:assert/strict';
import test from 'node:test';
import { MysqlAuthRateLimitStore } from '../src/db/auth-rate-limit-store.js';

const keys = { ip: 'a'.repeat(64), identity: 'b'.repeat(64) };
const options = { timestamp: 1_700_000_000_000, resetAt: 1_700_000_060_000, ipLimit: 20, identityLimit: 20 };
const deadlock = () => Object.assign(new Error('Deadlock found when trying to get lock'), {
  code: 'ER_LOCK_DEADLOCK', errno: 1213, sqlState: '40001',
});

function fakePool({ transientFailures = 0, errorFactory = deadlock } = {}) {
  const metrics = { transactions: 0, commits: 0, rollbacks: 0, releases: 0, increments: 0, cleanups: 0 };
  const pool = {
    async execute() { metrics.cleanups += 1; return [[]]; },
    async getConnection() {
      return {
        async beginTransaction() { metrics.transactions += 1; },
        async execute(sql) {
          if (sql.includes('INSERT INTO auth_rate_limits')) {
            if (metrics.transactions <= transientFailures) throw errorFactory();
            metrics.increments += 1;
            return [{ affectedRows: 1 }];
          }
          assert.match(sql, /FOR UPDATE/);
          return [[{ attempt_count: 1, reset_at: new Date(options.resetAt) }]];
        },
        async commit() { metrics.commits += 1; },
        async rollback() { metrics.rollbacks += 1; },
        release() { metrics.releases += 1; },
      };
    },
  };
  return { pool, metrics };
}

test('BC-012 MySQL deadlock on image rate limit retries whole rolled-back transaction without opening access', async () => {
  const { pool, metrics } = fakePool({ transientFailures: 1 });
  const store = new MysqlAuthRateLimitStore(pool);
  const decision = await store.consume(keys, options);
  assert.equal(decision, null);
  assert.equal(metrics.transactions, 2);
  assert.equal(metrics.rollbacks, 1);
  assert.equal(metrics.commits, 1);
  assert.equal(metrics.releases, 2);
  assert.equal(metrics.increments, 2);
});

test('BC-012 shared limiter fails closed after bounded deadlock retries', async () => {
  const { pool, metrics } = fakePool({ transientFailures: 10 });
  const store = new MysqlAuthRateLimitStore(pool);
  await assert.rejects(store.consume(keys, options), { code: 'ER_LOCK_DEADLOCK', sqlState: '40001' });
  assert.equal(metrics.transactions, 3);
  assert.equal(metrics.rollbacks, 3);
  assert.equal(metrics.commits, 0);
  assert.equal(metrics.releases, 3);
});

test('BC-012 non-transient database errors are not retried', async () => {
  const { pool, metrics } = fakePool({
    transientFailures: 5,
    errorFactory: () => Object.assign(new Error('bad table'), { code: 'ER_NO_SUCH_TABLE' }),
  });
  const store = new MysqlAuthRateLimitStore(pool);
  await assert.rejects(store.consume(keys, options), { code: 'ER_NO_SUCH_TABLE' });
  assert.equal(metrics.transactions, 1);
  assert.equal(metrics.rollbacks, 1);
});

test('BC-012 deadlock during expired bucket cleanup gets retried before page access', async () => {
  let cleaned = 0;
  const { pool, metrics } = fakePool();
  pool.execute = async () => {
    cleaned += 1;
    if (cleaned === 1) throw deadlock();
    return [[]];
  };
  const store = new MysqlAuthRateLimitStore(pool);
  assert.equal(await store.consume(keys, options), null);
  assert.equal(cleaned, 2);
  assert.equal(metrics.transactions, 1);
});
