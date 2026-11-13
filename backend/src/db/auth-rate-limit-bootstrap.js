// One-shot production bootstrap: matches the auth_rate_limits table in scripts/migrate.js.
// Enable AUTH_RATE_LIMIT_SCHEMA_BOOTSTRAP only for a controlled deployment, then disable it.
export async function ensureAuthRateLimitTable(pool) {
  await pool.execute(`CREATE TABLE IF NOT EXISTS auth_rate_limits (
    bucket_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    attempt_count INT UNSIGNED NOT NULL,
    reset_at DATETIME(3) NOT NULL,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (bucket_key),
    KEY ix_auth_rate_limits_reset_at (reset_at)
  ) ENGINE=InnoDB`);
}
