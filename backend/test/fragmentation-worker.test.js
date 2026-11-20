import assert from 'node:assert/strict';
import test from 'node:test';
import { processFragmentation } from '../worker/fragmentation.js';

class HeadObjectCommand { constructor(input) { this.input = input; } }
class GetObjectCommand { constructor(input) { this.input = input; } }
class PutObjectCommand { constructor(input) { this.input = input; } }
const jobId = '00000000-0000-4000-8000-000000000105';

test('BC-105 ignores replayed jobs, without fetching or mutating source PDFs', async () => {
  const calls = [];
  const pool = { async execute(sql) { calls.push(sql); return [{ affectedRows: 0 }]; } };
  const s3 = { async send() { throw new Error('S3 should not be called'); } };
  const result = await processFragmentation(jobId, { pool, s3 });
  assert.deepEqual(result, { status: 'not_queued' });
  assert.equal(calls.length, 1);
});

test('BC-105 fails closed if the source S3 VersionId differs', async () => {
  const statements = [];
  const job = { id: jobId, source_key: 'originals/Don Bosco en España_1954.pdf',
    source_version_id: 'immutable-original-v1', publication: 'Don Bosco en España', publication_year: 1954,
    page_count: 3, status: 'processing',
    segments_json: JSON.stringify([
      { startPage: 1, endPage: 1, monthStart: 1, monthEnd: 1, issueNumber: '' },
      { startPage: 2, endPage: 3, monthStart: 2, monthEnd: 2, issueNumber: '' },
    ]) };
  const pool = { async execute(sql, params) {
    statements.push({ sql, params });
    if (sql.startsWith('UPDATE') && sql.includes("status = 'processing'")) return [{ affectedRows: 1 }];
    if (sql.startsWith('SELECT * FROM archive_fragmentation_jobs')) return [[job]];
    return [{ affectedRows: 1 }];
  }};
  const s3 = { async send(command) {
    assert.ok(command instanceof HeadObjectCommand);
    return { VersionId: 'unexpected-v2', ContentLength: 1024 };
  }};
  await assert.rejects(() => processFragmentation(jobId, {
    pool, s3, GetObjectCommand, HeadObjectCommand, PutObjectCommand,
  }), /SOURCE_CHANGED/);
  assert.ok(statements.some(x => x.sql.includes("status = 'failed'") && x.params[0] === 'SOURCE_CHANGED'));
  assert.equal(statements.filter(x => x.sql.includes('archive_documents')).length, 0);
});

test('BC-105 refuses invalid job IDs without any database calls', async () => {
  await assert.rejects(() => processFragmentation('../../oops', { pool: {
    async execute() { throw new Error('unexpected db call'); },
  } }), /INVALID_JOB_ID/);
});
