// Run on a trusted host with network access to the private RDS instance.
// SQL DDL can auto-commit in MySQL; apply first in staging and back up production.
import pool from '../src/db/connection.js';
import { bc017Statements } from '../src/db/archive-migration.js';
import { fragmentationStatements } from '../src/db/fragmentation-migration.js';

const statements = [
  `CREATE TABLE IF NOT EXISTS archive_documents (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    s3_key VARCHAR(512) NOT NULL,
    publication VARCHAR(180) NOT NULL,
    publication_year SMALLINT UNSIGNED NOT NULL,
    file_size_bytes BIGINT UNSIGNED NULL,
    indexed_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY ux_archive_documents_s3_key (s3_key),
    KEY ix_archive_documents_year (publication_year)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ...bc017Statements,
  `CREATE TABLE IF NOT EXISTS archive_pages (
    document_id BIGINT UNSIGNED NOT NULL,
    page_number INT UNSIGNED NOT NULL,
    text_content MEDIUMTEXT NOT NULL,
    text_quality VARCHAR(24) NOT NULL DEFAULT 'unreviewed',
    PRIMARY KEY (document_id, page_number),
    FULLTEXT KEY ft_archive_pages_text (text_content),
    CONSTRAINT fk_archive_pages_doc FOREIGN KEY (document_id)
      REFERENCES archive_documents(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ...fragmentationStatements,
];
try {
  for (const statement of statements) await pool.query(statement);
  console.log('Archive search schema ready');
} catch (error) {
  console.error('Archive schema migration failed:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
