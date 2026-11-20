export class MysqlAuthRateLimitStore {
  constructor(pool, { cleanupIntervalMs = 15 * 60 * 1000 } = {}) {
    this.pool = pool;
    this.cleanupIntervalMs = cleanupIntervalMs;
    this.nextCleanupAt = 0;
  }

  async consume(keys, { timestamp, resetAt, ipLimit, identityLimit }) {
    // InnoDB may abort one transaction when independent Lambda requests touch
    // the same two rate-limit buckets concurrently (ER_LOCK_DEADLOCK / 40001).
    // A rolled-back transaction has not consumed the quota; retry it in full,
    // never bypassing the shared rate limit or incrementing twice.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await this.#cleanup(timestamp);
        return await this.#consumeOnce(keys, { timestamp, resetAt, ipLimit, identityLimit });
      } catch (error) {
        if (!isRetryableRateLimitConflict(error) || attempt === 2) throw error;
        await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)));
      }
    }
    throw new Error('UNREACHABLE_RATE_LIMIT_RETRY');
  }

  async #consumeOnce(keys, { timestamp, resetAt, ipLimit, identityLimit }) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const ipEntry = await increment(connection, keys.ip, timestamp, resetAt, ipLimit);
      if (ipEntry.count > ipLimit) {
        await connection.commit();
        return ipEntry;
      }
      const identityEntry = await increment(connection, keys.identity, timestamp, resetAt, identityLimit);
      await connection.commit();
      return identityEntry.count > identityLimit ? identityEntry : null;
    } catch (error) {
      try {
        await connection.rollback();
      } catch {
        // Keep the original database error; a failed rollback also fails closed.
      }
      throw error;
    } finally {
      connection.release();
    }
  }

  async clear(key) {
    if (!key) return;
    await this.pool.execute('DELETE FROM auth_rate_limits WHERE bucket_key = ?', [key]);
  }

  async #cleanup(timestamp) {
    if (timestamp < this.nextCleanupAt) return;
    this.nextCleanupAt = timestamp + this.cleanupIntervalMs;
    try {
      await this.pool.execute(
        'DELETE FROM auth_rate_limits WHERE reset_at <= ? LIMIT 10000',
        [new Date(timestamp)],
      );
    } catch (error) {
      this.nextCleanupAt = 0;
      throw error;
    }
  }
}

async function increment(connection, key, timestamp, resetAt, limit) {
  await connection.execute(
    `INSERT INTO auth_rate_limits (bucket_key, attempt_count, reset_at)
     VALUES (?, 1, ?)
     ON DUPLICATE KEY UPDATE
       attempt_count = IF(reset_at <= ?, 1, LEAST(attempt_count + 1, ?)),
       reset_at = IF(reset_at <= ?, VALUES(reset_at), reset_at)`,
    [key, new Date(resetAt), new Date(timestamp), limit + 1, new Date(timestamp)],
  );
  const [rows] = await connection.execute(
    'SELECT attempt_count, reset_at FROM auth_rate_limits WHERE bucket_key = ? FOR UPDATE',
    [key],
  );
  return { count: rows[0].attempt_count, resetAt: new Date(rows[0].reset_at).getTime() };
}

function isRetryableRateLimitConflict(error) {
  return error?.code === 'ER_LOCK_DEADLOCK'
    || error?.code === 'ER_LOCK_WAIT_TIMEOUT'
    || error?.errno === 1213
    || error?.errno === 1205
    || error?.sqlState === '40001';
}
