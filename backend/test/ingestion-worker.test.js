import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Readable } from 'node:stream';
import { writeFile } from 'node:fs/promises';
import { ingestOne, saveDocumentWithRetry } from '../worker/handler.js';

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
    if (command.input.head) return { ContentLength: pdf.length, VersionId: 'source-version-1' };
    return { Body: Readable.from([pdf]) };
  }};
  const result = await ingestOne({
    key: 'originals/Don Bosco en España_1923.pdf', s3,
    S3HeadCommand: class { constructor(input) { this.input = { ...input, head: true }; } },
    S3GetCommand: class { constructor(input) { this.input = input; } },
    pool: { async getConnection() { return connection; } },
    pdfinfo: async () => ({ stdout: 'Pages:          3\n' }),
    pdftotext: async (_cmd, args) => { await writeFile(args.at(-1), 'Texto de la primera página con contenido histórico suficiente y legible para superar el umbral de calidad normal.'.repeat(2) + '\f\f' + 'Texto de la tercera página con contenido histórico suficiente y legible para superar el umbral de calidad normal.'.repeat(2) + '\f', 'utf8'); },
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

test('BC-017 manual indexing can catalogue a safe nonannual PDF', async () => {
  const sqlCalls = [];
  const pdf = Buffer.from('%PDF-1.7\nmock-pdf');
  const s3 = { async send(command) {
    if (command.input.head) return { ContentLength: pdf.length, VersionId: 'catalog-v1' };
    return { Body: Readable.from([pdf]) };
  } };
  const pool = { async getConnection() {
    return {
      async beginTransaction() {},
      async execute(sql, params) {
        sqlCalls.push({ sql, params });
        if (sql.includes('SELECT id FROM archive_documents')) return [[{ id: 11 }]];
        if (sql.includes('SELECT COUNT(*) AS total')) return [[{ total: 1 }]];
        return [[]];
      },
      async commit() {},
      async rollback() {},
      release() {},
    };
  } };
  const result = await ingestOne({
    key: 'originals/Boletín de la casa 1950.pdf',
    catalog: { publication: 'Boletín de la casa', year: 1950 },
    s3,
    S3HeadCommand: class { constructor(input) { this.input = { ...input, head: true }; } },
    S3GetCommand: class { constructor(input) { this.input = input; } },
    pool,
    pdfinfo: async () => ({ stdout: 'Pages: 1\n' }),
    pdftotext: async (_cmd, args) => {
      await writeFile(args.at(-1), 'Texto histórico de la publicación con información suficiente para indexar.\f', 'utf8');
    },
  });
  assert.equal(result.pages, 1);
  const inserted = sqlCalls.find(x => x.sql.includes('INSERT INTO archive_documents'));
  assert.deepEqual(inserted.params.slice(0, 3), ['originals/Boletín de la casa 1950.pdf', 'Boletín de la casa', 1950]);
  await assert.rejects(ingestOne({
    key: 'originals/Boletín de la casa 1950.pdf', catalog: { publication: 'A', year: 1950 }, s3,
  }), /Invalid manual catalogue/);
});

test('BC-110 automatically indexes source-qualified monthly PDF', async () => {
  const pdf = Buffer.from('%PDF-1.7\nmock-pdf');
  const queries = [];
  const connection = {
    async beginTransaction() {},
    async execute(sql, params) {
      queries.push({ sql, params });
      if (sql.includes('SELECT id FROM archive_documents')) return [[{ id: 20 }]];
      if (sql.includes('SELECT COUNT(*)')) return [[{ total: 1 }]];
      return [[]];
    },
    async commit() {}, async rollback() {}, release() {},
  };
  const result = await ingestOne({
    key: 'originals/Boletin Salesiano 188610 N001.pdf',
    s3: { async send(command) {
      return command.input.head ? { ContentLength: pdf.length, VersionId: 'v1' }
        : { Body: Readable.from([pdf]) };
    } },
    S3HeadCommand: class { constructor(input) { this.input = { ...input, head: true }; } },
    S3GetCommand: class { constructor(input) { this.input = input; } },
    pool: { async getConnection() { return connection; } },
    pdfinfo: async () => ({ stdout: 'Pages: 1\n' }),
    pdftotext: async (_cmd, args) => {
      await writeFile(args.at(-1), 'El Boletín Salesiano de octubre de 1886 relata la historia de Don Bosco.\f');
    },
  });
  assert.equal(result.pages, 1);
  const insert = queries.find((x) => x.sql.includes('INSERT INTO archive_documents'));
  assert.deepEqual(insert.params.slice(0, 3), [
    'originals/Boletin Salesiano 188610 N001.pdf', 'Boletín Salesiano', 1886,
  ]);
});

test('BC-110 retries the entire transaction following a recoverable deadlock', async () => {
  let attempts = 0, rollbacks = 0, commits = 0;
  const pool = { async getConnection() {
    return {
      async beginTransaction() { attempts++; },
      async execute(sql) {
        if (sql.startsWith('INSERT INTO archive_documents') && attempts === 1) {
          throw Object.assign(new Error('deadlock'), { code: 'ER_LOCK_DEADLOCK' });
        }
        if (sql.includes('SELECT id FROM archive_documents')) return [[{ id: 4 }]];
        if (sql.includes('SELECT COUNT(*)')) return [[{ total: 1 }]];
        return [[]];
      },
      async commit() { commits++; },
      async rollback() { rollbacks++; },
      release() {},
    };
  } };
  const persisted = await saveDocumentWithRetry(
    pool, { key: 'originals/Boletin Salesiano 188610 N001.pdf', publication: 'Boletín Salesiano', year: 1886 },
    120, [{ pageNumber: 1, text: 'Page', quality: 'unreviewed' }], 'v1',
    { pause: async () => {} },
  );
  assert.equal(persisted, true);
  assert.equal(attempts, 2);
  assert.equal(rollbacks, 1);
  assert.equal(commits, 1);
});
