import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Readable } from 'node:stream';
import { writeFile } from 'node:fs/promises';
import { ingestOne } from '../worker/handler.js';

test('BC-007 worker preserves empty physical pages and commits only after verifying count', async () => {
  const calls = [];
  const connection = {
    async beginTransaction() { calls.push('begin'); },
    async execute(sql, params) {
      calls.push(sql);
      if (sql.includes('SELECT id FROM archive_documents')) return [[{ id: 18 }]];
      if (sql.includes('SELECT COUNT(*) AS total')) return [[{ total: 3 }]];
      if (sql.includes('INSERT INTO archive_pages')) {
        assert.ok([1, 2, 3].includes(params[1]));
        if (params[1] === 2) {
          assert.equal(params[2], '');
          assert.equal(params[3], 'needs_review');
        }
      }
      return [[]];
    },
    async commit() { calls.push('commit'); },
    async rollback() { calls.push('rollback'); },
    release() {},
  };
  const pdf = Buffer.from('%PDF-1.7\nmock-pdf');
  const s3 = { async send(command) {
    if (command.input.head) return { ContentLength: pdf.length };
    return { Body: Readable.from([pdf]) };
  }};
  const result = await ingestOne({
    key: 'originals/Don Bosco en España_1923.pdf', s3,
    S3HeadCommand: class { constructor(input) { this.input = { ...input, head: true }; } },
    S3GetCommand: class { constructor(input) { this.input = input; } },
    pool: { async getConnection() { return connection; } },
    pdfinfo: async () => ({ stdout: 'Pages:          3\n' }),
    pdftotext: async (_cmd, args) => { await writeFile(args.at(-1), 'Texto primera página\f\fTexto tercera página\f', 'utf8'); },
  });
  assert.equal(result.pages, 3);
  assert.equal(result.needsReview, 1);
  assert.equal(calls.at(-1), 'commit');
  assert.ok(!calls.includes('rollback'));
});

test('BC-007 worker refuses a page-count mismatch without writing to DB', async () => {
  const pdf = Buffer.from('%PDF-1.7\nmock-pdf');
  const s3 = { async send(command) {
    return command.input.head ? { ContentLength: pdf.length } : { Body: Readable.from([pdf]) };
  }};
  let dbCalled = false;
  await assert.rejects(() => ingestOne({
    key: 'originals/Don Bosco en España_1923.pdf', s3,
    S3HeadCommand: class { constructor(input) { this.input = { ...input, head: true }; } },
    S3GetCommand: class { constructor(input) { this.input = input; } },
    pool: { async getConnection() { dbCalled = true; } },
    pdfinfo: async () => ({ stdout: 'Pages:          4\n' }),
    pdftotext: async (_cmd, args) => { await writeFile(args.at(-1), 'Uno\fDos\fTres\f', 'utf8'); },
  }), /page count differ/);
  assert.equal(dbCalled, false);
});
