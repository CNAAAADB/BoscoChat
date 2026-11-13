// Controlled one-time fix for pre-BC-002 production user schemas.
// Does not change existing user details, password hashes, or sessions.
export async function ensureUserSuspensionColumn(pool) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'suspended_at'`,
  );
  if (!rows.length || !Number.isFinite(Number(rows[0].count))) {
    throw new Error('Cannot verify users.suspended_at schema');
  }
  if (Number(rows[0].count) === 0) {
    await pool.execute('ALTER TABLE users ADD COLUMN suspended_at TIMESTAMP NULL DEFAULT NULL AFTER role');
  }
}
