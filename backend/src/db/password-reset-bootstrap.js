// Controlled one-shot migration: flag PASSWORD_RESET_SCHEMA_BOOTSTRAP=true.
// Only creates the missing token table; no user/account/archival data modifications.
export async function ensurePasswordResetSchema(pool) {
  const [columns] = await pool.execute(
    'SELECT COLUMN_TYPE AS type FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    ['users', 'id'],
  );
  const type = columns[0]?.type;
  if (typeof type !== 'string' || !/^(tinyint|smallint|mediumint|int|bigint)( unsigned)?$/i.test(type)) {
    throw new Error('INVALID_USERS_ID_COLUMN_TYPE');
  }
  await pool.execute(`CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_id ${type} NOT NULL,
    expires_at DATETIME(3) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (token_hash),
    UNIQUE KEY ux_reset_user (user_id),
    KEY ix_reset_expiry (expires_at),
    CONSTRAINT fk_password_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}
