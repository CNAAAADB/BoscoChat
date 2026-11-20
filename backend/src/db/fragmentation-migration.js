// BC-105 additive schema. Apply in staging first; MySQL DDL commits independently.
export const fragmentationStatements = Object.freeze([
  `CREATE TABLE IF NOT EXISTS archive_fragmentation_jobs (
    id CHAR(36) NOT NULL,
    source_key VARCHAR(512) NOT NULL,
    source_version_id VARCHAR(255) NOT NULL,
    publication VARCHAR(180) NOT NULL,
    publication_year SMALLINT UNSIGNED NOT NULL,
    page_count INT UNSIGNED NOT NULL,
    segments_json JSON NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'proposed',
    error_code VARCHAR(80) NULL,
    created_by BIGINT UNSIGNED NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY ux_fragmentation_source_version (source_key, source_version_id),
    KEY ix_fragmentation_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS archive_fragmentation_issues (
    job_id CHAR(36) NOT NULL,
    document_id BIGINT UNSIGNED NOT NULL,
    parent_s3_key VARCHAR(512) NOT NULL,
    source_page_start INT UNSIGNED NOT NULL,
    source_page_end INT UNSIGNED NOT NULL,
    month_start TINYINT UNSIGNED NOT NULL,
    month_end TINYINT UNSIGNED NOT NULL,
    issue_number VARCHAR(20) NULL,
    PRIMARY KEY (job_id, document_id),
    UNIQUE KEY ux_fragmentation_document (document_id),
    CONSTRAINT fk_fragment_issue_job FOREIGN KEY (job_id)
      REFERENCES archive_fragmentation_jobs(id),
    CONSTRAINT fk_fragment_issue_doc FOREIGN KEY (document_id)
      REFERENCES archive_documents(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
]);
