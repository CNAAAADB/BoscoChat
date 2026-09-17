export class UsageRepository {
  constructor(pool) {
    this.pool = pool;
  }

  // BC-003 / RF-USAGE-01 / RF-USAGE-02 / RF-USAGE-03: lock the period counter so
  // concurrent requests cannot consume more than the configured plan limit.
  async consume({ userId, plan, type, parametersJson, timestamp, periodStart, periodEnd, limit }) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        `INSERT INTO query_usage_counters
          (user_id, plan, query_type, period_start, period_end, query_count)
         VALUES (?, ?, ?, ?, ?, 0)
         ON DUPLICATE KEY UPDATE plan = ?, period_end = ?`,
        [userId, plan, type, periodStart, periodEnd, plan, periodEnd],
      );
      const [rows] = await connection.execute(
        `SELECT query_count AS queryCount FROM query_usage_counters
          WHERE user_id = ? AND query_type = ? AND period_start = ? AND period_end = ? FOR UPDATE`,
        [userId, type, periodStart, periodEnd],
      );
      const used = Number(rows[0]?.queryCount ?? 0);
      const consumed = used < limit;

      if (consumed) {
        await connection.execute(
          `INSERT INTO query_logs (user_id, query_type, parameters_json, outcome, created_at)
           VALUES (?, ?, CAST(? AS JSON), 'accepted', ?)`,
          [userId, type, parametersJson, timestamp],
        );
        await connection.execute(
          `UPDATE query_usage_counters SET query_count = query_count + 1
            WHERE user_id = ? AND query_type = ? AND period_start = ? AND period_end = ?`,
          [userId, type, periodStart, periodEnd],
        );
      } else {
        await connection.execute(
          `INSERT INTO query_logs (user_id, query_type, parameters_json, outcome, created_at)
           SELECT ?, ?, CAST(? AS JSON), 'blocked_quota', ?
           WHERE NOT EXISTS (
             SELECT 1 FROM query_logs
              WHERE user_id = ? AND query_type = ? AND outcome = 'blocked_quota'
                AND created_at >= ? AND created_at < ?
           )`,
          [userId, type, parametersJson, timestamp, userId, type, periodStart, periodEnd],
        );
      }
      await connection.commit();
      return { consumed, used: consumed ? used + 1 : used };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}
