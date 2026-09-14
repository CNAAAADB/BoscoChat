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

    await connection.commit();
    console.log('Authentication schema migration completed');
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

migrate().catch((error) => {
  console.error('Authentication schema migration failed:', error.message);
  process.exitCode = 1;
});
