import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectArchiveOperationalSchema, ensureAdminAuditTable } from '../worker/archive-audit-schema.js';

const tables = ['users', 'archive_documents', 'archive_pages', 'archive_deleted_sources', 'archive_manual_index_requests', 'admin_audit_logs'];

test('BC-017 diagnosis reports schema names only, without reading data', async () => {
  const seen = [];
  const pool = { async execute(sql) {
    seen.push(sql);
    return [tables.filter(name => name !== 'admin_audit_logs').map(TABLE_NAME => ({ TABLE_NAME }))];
  } };
  const result = await inspectArchiveOperationalSchema(pool);
  assert.deepEqual(result.missing, ['admin_audit_logs']);
  assert.deepEqual(result.present, tables.filter(name => name !== 'admin_audit_logs'));
  assert.equal(seen.length, 1);
  assert.match(seen[0], /information_schema\.TABLES/);
});

test('BC-017 audit repair uses the exact users.id type and additive DDL', async () => {
  const executed = [];
  const pool = {
    async execute(sql) {
      executed.push(sql);
      if (sql.includes('COLUMN_TYPE FROM information_schema.COLUMNS')) return [[{ COLUMN_TYPE: 'bigint unsigned' }]];
      return [[
        'id', 'actor_user_id', 'target_user_id', 'action', 'outcome', 'details_json', 'created_at',
      ].map(COLUMN_NAME => ({ COLUMN_NAME, COLUMN_TYPE: COLUMN_NAME === 'actor_user_id' ? 'bigint unsigned' : 'varchar(48)' }))];
    },
    async query(sql) { executed.push(sql); return [[]]; },
  };
  assert.deepEqual(await ensureAdminAuditTable(pool), { auditedTableVerified: true });
  const ddl = executed.find(sql => sql.startsWith('CREATE TABLE'));
  assert.match(ddl, /^CREATE TABLE IF NOT EXISTS admin_audit_logs/);
  assert.match(ddl, /actor_user_id bigint unsigned NOT NULL/);
  assert.doesNotMatch(ddl, /DROP|TRUNCATE|DELETE FROM|ALTER TABLE/i);
});

test('BC-017 audit repair fails closed if users.id type is incompatible', async () => {
  let ddl = false;
  const pool = {
    async execute() { return [[{ COLUMN_TYPE: 'text' }]]; },
    async query() { ddl = true; },
  };
  await assert.rejects(ensureAdminAuditTable(pool), /INVALID_USERS_PRIMARY_KEY_TYPE/);
  assert.equal(ddl, false);
});
