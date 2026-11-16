import assert from 'node:assert/strict';
import test from 'node:test';
import { saveDocument } from '../worker/handler.js';

function database(deletedVersion) {
  const actions = [];
  return {
    actions,
    async getConnection() {
      return {
        async beginTransaction() { actions.push('begin'); },
        async execute(sql, params) {
          actions.push({ sql, params });
          if (sql.includes('FROM archive_deleted_sources')) {
            return [[deletedVersion ? { source_version_id: deletedVersion } : undefined]];
          }
          if (sql.includes('SELECT id FROM archive_documents')) return [[{ id: 8 }]];
          if (sql.includes('SELECT COUNT(*) AS total')) return [[{ total: 1 }]];
          return [[]];
        },
        async commit() { actions.push('commit'); },
        async rollback() { actions.push('rollback'); },
        release() { actions.push('release'); },
      };
    },
  };
}

const metadata = { key: 'originals/Don Bosco en España_1923.pdf', publication: 'Don Bosco en España', year: 1923 };
const pages = [{ pageNumber: 1, text: 'Don Bosco', quality: 'unreviewed' }];

test('BC-017 worker refuses to republish a deleted PDF version', async () => {
  const db = database('old-version');
  const persisted = await saveDocument(db, metadata, 1000, pages, 'old-version');
  assert.equal(persisted, false);
  assert.deepEqual(db.actions.filter(x => typeof x === 'string'), ['begin', 'rollback', 'release']);
  assert.equal(db.actions.filter(x => typeof x === 'object').length, 1);
});

test('BC-017 worker accepts a newly uploaded PDF version after deletion', async () => {
  const db = database('old-version');
  const persisted = await saveDocument(db, metadata, 1000, pages, 'new-version');
  assert.equal(persisted, true);
  assert.deepEqual(db.actions.filter(x => typeof x === 'string'), ['begin', 'commit', 'release']);
  assert.equal(db.actions.filter(x => typeof x === 'object' && x.sql.includes('INSERT INTO archive_pages')).length, 1);
});

test('BC-017 worker indexes originals without a deletion marker', async () => {
  const db = database(null);
  const persisted = await saveDocument(db, metadata, 1000, pages, 'original-version');
  assert.equal(persisted, true);
  assert.ok(db.actions.includes('commit'));
});
