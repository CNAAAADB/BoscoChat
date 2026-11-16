// Restricted one-off diagnosis and additive repair for archive operations.
// Exposes only schema metadata, never document/user content.
import mysql from 'mysql2/promise';
import { databaseConfig } from '../src/config/database.js';

const TABLES = Object.freeze(['users', 'archive_documents', 'archive_pages', 'archive_deleted_sources', 'archive_manual_index_requests', 'admin_audit_logs']);

export async function inspectArchiveOperationalSchema(pool) {
  const [rows] = await pool.execute(
    `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME IN ('users', 'archive_documents', 'archive_pages', 'archive_deleted_sources', 'archive_manual_index_requests', 'admin_audit_logs')`,
  );
  const present = new Set(rows.map(row => row.TABLE_NAME));
  return { present: TABLES.filter(name => present.has(name)), missing: TABLES.filter(name => !present.has(name)) };
}

export async function ensureAdminAuditTable(pool) {
  const [types] = await pool.execute(
    `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id'`,
  );
  const idType = types[0]?.COLUMN_TYPE;
  if (!/^(tinyint|smallint|mediumint|int|bigint)( unsigned)?$/i.test(idType ?? '')) {
    throw new Error('INVALID_USERS_PRIMARY_KEY_TYPE');
  }
  await pool.query(`CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    actor_user_id ${idType} NOT NULL,
    target_user_id ${idType} NULL,
    action VARCHAR(48) NOT NULL,
    outcome VARCHAR(16) NOT NULL,
    details_json JSON NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY ix_admin_audit_actor_created (actor_user_id, created_at),
    KEY ix_admin_audit_target_created (target_user_id, created_at),
    KEY ix_admin_audit_action_created (action, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  const [columns] = await pool.execute(
    `SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_TYPE FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_audit_logs'`,
  );
  const expected = new Set(['id', 'actor_user_id', 'target_user_id', 'action', 'outcome', 'details_json', 'created_at']);
  for (const name of expected) {
    if (!columns.some(row => row.COLUMN_NAME === name)) throw new Error('INCOMPATIBLE_ADMIN_AUDIT_SCHEMA: ' + name);
  }
  if (columns.find(row => row.COLUMN_NAME === 'actor_user_id')?.COLUMN_TYPE !== idType) {
    throw new Error('ADMIN_AUDIT_USER_ID_TYPE_MISMATCH');
  }
  return { auditedTableVerified: true };
}

export async function handler(event) {
  const operation = event?.operation;
  if (!['inspect-archive-schema', 'repair-archive-audit-schema'].includes(operation)) {
    throw new Error('OPERATION_NOT_ALLOWED');
  }
  const pool = mysql.createPool(databaseConfig({ ...process.env, DB_CONNECTION_LIMIT: '1' }));
  try {
    const before = await inspectArchiveOperationalSchema(pool);
    if (operation === 'inspect-archive-schema') return { status: 'inspected', ...before };
    if (before.missing.some(name => name !== 'admin_audit_logs')) {
      throw new Error('OTHER_ARCHIVE_TABLES_MISSING');
    }
    const verified = await ensureAdminAuditTable(pool);
    const after = await inspectArchiveOperationalSchema(pool);
    if (after.missing.length) throw new Error('ARCHIVE_AUDIT_SCHEMA_REPAIR_INCOMPLETE');
    return { status: 'verified', beforeMissing: before.missing, ...verified, remainingMissing: [] };
  } finally { await pool.end(); }
}
