// BC-017: additive, repeatable RDS schema preflight for archive deletion/reindexing.
// Never drops or truncates tables and never reads or returns document/user content.
export const bc017Statements = Object.freeze([
  `CREATE TABLE IF NOT EXISTS archive_deleted_sources (
    s3_key VARCHAR(512) NOT NULL,
    source_version_id VARCHAR(255) NOT NULL,
    deleted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (s3_key)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS archive_manual_index_requests (
    s3_key VARCHAR(512) NOT NULL,
    requested_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (s3_key)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
]);

const expected = Object.freeze({
  archive_deleted_sources: ['s3_key', 'source_version_id', 'deleted_at'],
  archive_manual_index_requests: ['s3_key', 'requested_at'],
});

export async function applyBc017Schema(pool) {
  for (const statement of bc017Statements) await pool.query(statement);
  const [rows] = await pool.execute(
    `SELECT TABLE_NAME, COLUMN_NAME, IS_NULLABLE, COLUMN_KEY
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN ('archive_deleted_sources', 'archive_manual_index_requests')`,
  );
  for (const [table, columns] of Object.entries(expected)) {
    for (const name of columns) {
      const found = rows.find((row) => row.TABLE_NAME === table && row.COLUMN_NAME === name);
      if (!found || found.IS_NULLABLE !== 'NO') {
        throw new Error('BC017_SCHEMA_INCOMPATIBLE: ' + table + '.' + name);
      }
      if (name === 's3_key' && found.COLUMN_KEY !== 'PRI') {
        throw new Error('BC017_SCHEMA_MISSING_PRIMARY_KEY: ' + table);
      }
    }
  }
  const [foreignKeys] = await pool.execute(
    `SELECT DELETE_RULE FROM information_schema.REFERENTIAL_CONSTRAINTS
       WHERE CONSTRAINT_SCHEMA = DATABASE()
         AND TABLE_NAME = 'archive_pages'
         AND REFERENCED_TABLE_NAME = 'archive_documents'`,
  );
  if (!foreignKeys.some((key) => key.DELETE_RULE === 'CASCADE')) {
    throw new Error('BC017_ARCHIVE_PAGES_CASCADE_REQUIRED');
  }
  return { tables: Object.keys(expected), archivePagesOnDeleteCascade: true };
}
