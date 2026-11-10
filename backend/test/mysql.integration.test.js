import assert from 'node:assert/strict';
import test from 'node:test';
import mysql from 'mysql2/promise';
import { databaseConfig } from '../src/config/database.js';
import { AuthRepository } from '../src/db/auth-repository.js';
import { MysqlAuthRateLimitStore } from '../src/db/auth-rate-limit-store.js';

// This proves engine-level migration and locking semantics; staging configuration and load remain separate gates.
test('MySQL 8 migration supports shared limits and concurrent administrator invariants', {
  skip: process.env.MYSQL_INTEGRATION !== '1',
  timeout: 30_000,
}, async (t) => {
  const pool = mysql.createPool(databaseConfig());
  t.after(() => pool.end());

  await pool.execute('DELETE FROM auth_rate_limits');
  const firstStore = new MysqlAuthRateLimitStore(pool, { cleanupIntervalMs: 60_000 });
  const secondStore = new MysqlAuthRateLimitStore(pool, { cleanupIntervalMs: 60_000 });
  const sourceKey = 'a'.repeat(64);
  const attempts = await Promise.all(Array.from({ length: 10 }, (_, index) => {
    const store = index % 2 === 0 ? firstStore : secondStore;
    return store.consume(
      { ip: sourceKey, identity: String(index).padStart(64, 'b') },
      { timestamp: 1_000, resetAt: 61_000, ipLimit: 4, identityLimit: 5 },
    );
  }));
  assert.equal(attempts.filter((entry) => entry === null).length, 4);
  assert.equal(attempts.filter((entry) => entry?.count === 5).length, 6);
  const [sourceRows] = await pool.execute(
    'SELECT attempt_count FROM auth_rate_limits WHERE bucket_key = ?',
    [sourceKey],
  );
  assert.equal(sourceRows[0].attempt_count, 5);

  const afterWindow = await secondStore.consume(
    { ip: sourceKey, identity: 'c'.repeat(64) },
    { timestamp: 62_000, resetAt: 122_000, ipLimit: 4, identityLimit: 5 },
  );
  assert.equal(afterWindow, null);

  const [firstAdmin] = await pool.execute(
    "INSERT INTO users (username, email, password_hash, role) VALUES ('First', 'mysql-first@example.test', 'test-only', 'administrator')",
  );
  const [secondAdmin] = await pool.execute(
    "INSERT INTO users (username, email, password_hash, role) VALUES ('Second', 'mysql-second@example.test', 'test-only', 'administrator')",
  );
  const repository = new AuthRepository(pool);
  const demotions = await Promise.allSettled([
    repository.updateUserRole(firstAdmin.insertId, secondAdmin.insertId, 'free'),
    repository.updateUserRole(secondAdmin.insertId, firstAdmin.insertId, 'free'),
  ]);
  assert.equal(demotions.filter(({ status }) => status === 'fulfilled').length, 1);
  const rejected = demotions.find(({ status }) => status === 'rejected');
  assert.equal(rejected.reason.code, 'LAST_ACTIVE_ADMIN');
  const [activeAdmins] = await pool.execute(
    "SELECT COUNT(*) AS count FROM users WHERE role = 'administrator' AND suspended_at IS NULL",
  );
  assert.equal(Number(activeAdmins[0].count), 1);

  const [member] = await pool.execute(
    "INSERT INTO users (username, email, password_hash, role) VALUES ('Member', 'mysql-member@example.test', 'test-only', 'free')",
  );
  await pool.execute(
    "INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 1 HOUR))",
    ['d'.repeat(64), member.insertId],
  );
  const actorId = demotions[0].status === 'fulfilled' ? firstAdmin.insertId : secondAdmin.insertId;
  await repository.setUserSuspended(actorId, member.insertId, true);
  const [sessions] = await pool.execute('SELECT COUNT(*) AS count FROM auth_sessions WHERE user_id = ?', [member.insertId]);
  assert.equal(Number(sessions[0].count), 0);
});
