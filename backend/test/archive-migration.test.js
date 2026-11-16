import assert from 'node:assert/strict';
import test from 'node:test';
import { applyBc017Schema, bc017Statements } from '../src/db/archive-migration.js';

function mockDatabase({ includeCascade = true, missingColumn = false } = {}) {
  const statements = [];
  const rows = [
    ...['s3_key', 'source_version_id', 'deleted_at'].map((name) => ({
      TABLE_NAME: 'archive_deleted_sources', COLUMN_NAME: name,
      IS_NULLABLE: 'NO', COLUMN_KEY: name === 's3_key' ? 'PRI' : '',
    })),
    ...['s3_key', 'requested_at'].map((name) => ({
      TABLE_NAME: 'archive_manual_index_requests', COLUMN_NAME: name,
      IS_NULLABLE: 'NO', COLUMN_KEY: name === 's3_key' ? 'PRI' : '',
    })),
  ].filter((row) => !missingColumn || row.COLUMN_NAME !== 'source_version_id');
  return {
    statements,
    async query(sql) { statements.push(sql); return [[]]; },
    async execute(sql) {
      if (sql.includes('information_schema.COLUMNS')) return [rows];
      if (sql.includes('information_schema.REFERENTIAL_CONSTRAINTS')) return [includeCascade ? [{ DELETE_RULE: 'CASCADE' }] : []];
      throw new Error('Unexpected SQL');
    },
  };
}

test('BC-017 creates only two additive tables and verifies the existing archive cascade', async () => {
  const db = mockDatabase();
  const result = await applyBc017Schema(db);
  assert.deepEqual(result.tables, ['archive_deleted_sources', 'archive_manual_index_requests']);
  assert.equal(result.archivePagesOnDeleteCascade, true);
  assert.deepEqual(db.statements, bc017Statements);
  for (const statement of db.statements) {
    assert.match(statement, /^CREATE TABLE IF NOT EXISTS /);
    assert.doesNotMatch(statement, /DROP|TRUNCATE|DELETE FROM|ALTER TABLE/i);
  }
});

test('BC-017 refuses incompatible existing tables rather than silently declaring success', async () => {
  const db = mockDatabase({ missingColumn: true });
  await assert.rejects(applyBc017Schema(db), /BC017_SCHEMA_INCOMPATIBLE/);
});

test('BC-017 refuses missing delete cascade on archive_pages', async () => {
  const db = mockDatabase({ includeCascade: false });
  await assert.rejects(applyBc017Schema(db), /BC017_ARCHIVE_PAGES_CASCADE_REQUIRED/);
});
