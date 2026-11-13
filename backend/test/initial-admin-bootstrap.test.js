import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureInitialAdministrator } from '../src/db/initial-admin-bootstrap.js';

function fakePool({ admins = [], user = { id: 7, role: 'free', suspendedAt: null }, updateCount = 1 } = {}) {
  const queries = [];
  const tx = { began: 0, committed: 0, rolledBack: 0, released: 0 };
  return {
    queries, tx,
    async getConnection() {
      return {
        async beginTransaction() { tx.began++; },
        async commit() { tx.committed++; },
        async rollback() { tx.rolledBack++; },
        release() { tx.released++; },
        async execute(sql, values = []) {
          queries.push({ sql, values });
          if (sql.includes('role = \'administrator\'') && sql.includes('FOR UPDATE')) return [admins];
          if (sql.includes('FROM users WHERE email')) return [user ? [user] : []];
          if (sql.startsWith('UPDATE users')) return [{ affectedRows: updateCount }];
          if (sql.startsWith('INSERT INTO admin_audit_logs')) return [{ affectedRows: 1 }];
          throw new Error('Unexpected SQL');
        },
      };
    },
  };
}

test('BC-002 promotes precisely the matched active user if there are no active administrators', async () => {
  const pool = fakePool();
  const result = await ensureInitialAdministrator(pool, 'owner@example.org');
  assert.deepEqual(result, { status: 'promoted' });
  assert.equal(pool.tx.committed, 1);
  assert.equal(pool.tx.rolledBack, 0);
  assert.equal(pool.tx.released, 1);
  const lookup = pool.queries.find(({ sql }) => sql.includes('FROM users WHERE email'));
  assert.deepEqual(lookup.values, ['owner@example.org']);
  const update = pool.queries.find(({ sql }) => sql.startsWith('UPDATE users'));
  assert.deepEqual(update.values, [7]);
  const audit = pool.queries.find(({ sql }) => sql.startsWith('INSERT INTO admin_audit_logs'));
  assert.deepEqual(audit.values.slice(0, 4), [7, 7, 'bootstrap.admin.initial', 'success']);
  assert.equal(pool.queries.filter(({ sql }) => sql.startsWith('UPDATE users')).length, 1);
});

test('BC-002 does not change an account if an administrator already exists', async () => {
  const pool = fakePool({ admins: [{ id: 4 }] });
  const result = await ensureInitialAdministrator(pool, 'owner@example.org');
  assert.equal(result.status, 'administrator_exists');
  assert.equal(pool.tx.rolledBack, 1);
  assert.equal(pool.queries.length, 1);
});

test('BC-002 rejects missing and suspended accounts without side effects', async () => {
  for (const input of [null, { id: 7, role: 'free', suspendedAt: new Date() }]) {
    const pool = fakePool({ user: input });
    const result = await ensureInitialAdministrator(pool, 'owner@example.org');
    assert.equal(result.status, input ? 'account_suspended' : 'account_missing');
    assert.equal(pool.queries.filter(({ sql }) => sql.startsWith('UPDATE')).length, 0);
    assert.equal(pool.tx.committed, 0);
    assert.equal(pool.tx.rolledBack, 1);
  }
});

test('BC-002 requires a valid exact email and rolls back when audit cannot be written', async () => {
  await assert.rejects(ensureInitialAdministrator(fakePool(), 'wrong'), /INITIAL_ADMIN_EMAIL_INVALID/);
  const pool = fakePool({ updateCount: 0 });
  await assert.rejects(ensureInitialAdministrator(pool, 'owner@example.org'), /INITIAL_ADMIN_UPDATE_FAILED/);
  assert.equal(pool.tx.committed, 0);
  assert.equal(pool.tx.rolledBack, 1);
});
