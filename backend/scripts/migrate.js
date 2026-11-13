import { hashPassword } from '../src/auth/password.js';
import pool from '../src/db/connection.js';

async function columnNames(connection, table) {
  const [rows] = await connection.execute(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table],
  );
  return new Set(rows.map((row) => row.COLUMN_NAME));
}

async function indexNames(connection, table) {
  const [rows] = await connection.execute(
    `SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table],
  );
  return new Set(rows.map((row) => row.INDEX_NAME));
}

async function integerColumnType(connection, table, column) {
  const [rows] = await connection.execute(
    `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  const columnType = rows[0]?.COLUMN_TYPE;
  if (typeof columnType !== 'string' || !/^(tinyint|smallint|mediumint|int|bigint)( unsigned)?$/i.test(columnType)) {
    throw new Error(`Migration stopped: ${table}.${column} must use an integer type`);
  }
  return columnType;
}

async function migrate() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(`CREATE TABLE IF NOT EXISTS users (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      username VARCHAR(80) NOT NULL,
      email VARCHAR(254) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(32) NOT NULL DEFAULT 'free',
      suspended_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY ux_users_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    const [duplicateEmails] = await connection.execute(
      'SELECT email FROM users GROUP BY email HAVING COUNT(*) > 1 LIMIT 1',
    );
    if (duplicateEmails.length > 0) {
      throw new Error('Migration stopped: duplicate user emails must be resolved before enforcing uniqueness');
    }

    let columns = await columnNames(connection, 'users');
    if (!columns.has('username')) {
      await connection.execute('ALTER TABLE users ADD COLUMN username VARCHAR(80) NULL AFTER id');
      if (columns.has('name')) await connection.execute("UPDATE users SET username = COALESCE(NULLIF(TRIM(name), ''), CONCAT('user-', id)) WHERE username IS NULL");
      else await connection.execute("UPDATE users SET username = CONCAT('user-', id) WHERE username IS NULL");
      await connection.execute('ALTER TABLE users MODIFY username VARCHAR(80) NOT NULL');
    }
    if (!columns.has('password_hash')) {
      await connection.execute('ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL AFTER email');
    }
    if (!columns.has('role')) {
      await connection.execute("ALTER TABLE users ADD COLUMN role VARCHAR(32) NOT NULL DEFAULT 'free' AFTER password_hash");
    }
    if (!columns.has('suspended_at')) {
      await connection.execute('ALTER TABLE users ADD COLUMN suspended_at TIMESTAMP NULL DEFAULT NULL AFTER role');
    }

    columns = await columnNames(connection, 'users');
    if (columns.has('password')) {
      const [legacyUsers] = await connection.execute('SELECT id, password FROM users WHERE password_hash IS NULL');
      for (const user of legacyUsers) {
        const passwordHash = await hashPassword(String(user.password));
        await connection.execute('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, user.id]);
      }
      await connection.execute('ALTER TABLE users DROP COLUMN password');
    }

    const [missingHashes] = await connection.execute('SELECT COUNT(*) AS count FROM users WHERE password_hash IS NULL');
    if (Number(missingHashes[0].count) !== 0) throw new Error('Migration stopped: users without a password hash remain');
    await connection.execute('ALTER TABLE users MODIFY password_hash VARCHAR(255) NOT NULL');

    await connection.execute("UPDATE users SET role = 'administrator' WHERE LOWER(role) = 'admin'");
    await connection.execute("UPDATE users SET role = 'documentary_manager' WHERE LOWER(role) IN ('gestor', 'gestor_documental')");
    await connection.execute('UPDATE users SET role = LOWER(role)');
    const [unsupportedRoles] = await connection.execute(
      `SELECT DISTINCT role FROM users
        WHERE role IS NULL OR role NOT IN ('free', 'pro', 'premium', 'advanced', 'administrator', 'documentary_manager')
        LIMIT 1`,
    );
    if (unsupportedRoles.length > 0) {
      throw new Error('Migration stopped: unsupported user roles must be resolved');
    }
    await connection.execute("ALTER TABLE users MODIFY role VARCHAR(32) NOT NULL DEFAULT 'free'");

    const indexes = await indexNames(connection, 'users');
    if (!indexes.has('ux_users_email')) {
      await connection.execute('CREATE UNIQUE INDEX ux_users_email ON users (email)');
    }

    const userIdType = await integerColumnType(connection, 'users', 'id');
    await connection.execute(`CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash CHAR(64) NOT NULL,
      user_id ${userIdType} NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (token_hash),
      KEY ix_auth_sessions_user_id (user_id),
      KEY ix_auth_sessions_expires_at (expires_at),
      CONSTRAINT fk_auth_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await connection.execute(`CREATE TABLE IF NOT EXISTS auth_rate_limits (
      bucket_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      attempt_count INT UNSIGNED NOT NULL,
      reset_at DATETIME(3) NOT NULL,
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (bucket_key),
      KEY ix_auth_rate_limits_reset_at (reset_at)
    ) ENGINE=InnoDB`);

    await connection.execute(`CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      actor_user_id ${userIdType} NOT NULL,
      target_user_id ${userIdType} NULL,
      action VARCHAR(48) NOT NULL,
      outcome VARCHAR(16) NOT NULL,
      details_json JSON NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      KEY ix_admin_audit_actor_created (actor_user_id, created_at),
      KEY ix_admin_audit_target_created (target_user_id, created_at),
      KEY ix_admin_audit_action_created (action, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await connection.execute(`CREATE TABLE IF NOT EXISTS password_reset_tokens (
      token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      user_id ${userIdType} NOT NULL,
      expires_at DATETIME(3) NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (token_hash),
      UNIQUE KEY ux_reset_user (user_id),
      KEY ix_reset_expiry (expires_at),
      CONSTRAINT fk_password_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await connection.execute(`CREATE TABLE IF NOT EXISTS query_logs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id ${userIdType} NOT NULL,
      query_type VARCHAR(16) NOT NULL,
      parameters_json JSON NOT NULL,
      outcome VARCHAR(24) NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      KEY ix_query_logs_user_type_created (user_id, query_type, created_at),
      CONSTRAINT fk_query_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await connection.execute(`CREATE TABLE IF NOT EXISTS query_usage_counters (
      user_id ${userIdType} NOT NULL,
      plan VARCHAR(32) NOT NULL,
      query_type VARCHAR(16) NOT NULL,
      period_start DATETIME(3) NOT NULL,
      period_end DATETIME(3) NOT NULL,
      query_count INT UNSIGNED NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, query_type, period_start, period_end),
      KEY ix_query_usage_period_end (period_end),
      CONSTRAINT fk_query_usage_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await connection.commit();
    console.log('Authentication, authorization and usage schema migration completed');
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

migrate().catch((error) => {
  console.error('Authentication, authorization and usage schema migration failed:', error.message);
  process.exitCode = 1;
});



