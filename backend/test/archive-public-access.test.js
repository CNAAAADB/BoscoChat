import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import express from 'express';
import { createArchiveSearchRouter } from '../src/routes/archive-search.js';
import { createArchiveDocumentRouter } from '../src/routes/archive-documents.js';

async function withServer(router, path, callback) {
  const app = express();
  app.use(path, router);
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try { await callback('http://127.0.0.1:' + server.address().port); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test('public archive discovery paginates results without a session', async () => {
  const statements = [];
  const pool = { async execute(sql, params) {
    statements.push({ sql, params });
    if (sql.includes('COUNT(*)')) {
      assert.deepEqual(params, ['Bosco', null, null]);
      return [[{ total: 81 }]];
    }
    assert.match(sql, /LIMIT \\? OFFSET \\?/);
    return [[{ document_id: 7, publication: 'Don Bosco en España', publication_year: 1922, page_number: 12, text_content: 'Bosco' }]];
  } };
  await withServer(createArchiveSearchRouter(pool), '/api/archive', async (base) => {
    const response = await fetch(base + '/api/archive/search?q=Bosco');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-boscochat-search-api'), 'paginated-v1');
    const payload = await response.json();
    assert.equal(payload.results.length, 1);
    assert.equal(payload.results[0].page_number, 12);
    assert.deepEqual({ total: payload.total, page: payload.page, pageSize: payload.pageSize, totalPages: payload.totalPages },
      { total: 81, page: 1, pageSize: 10, totalPages: 9 });
    assert.deepEqual(statements[1].params, ['Bosco', 'Bosco', null, null, 10, 0]);

    const later = await fetch(base + '/api/archive/search?q=Bosco&page=3&pageSize=20');
    assert.equal(later.status, 200);
    const laterPayload = await later.json();
    assert.deepEqual({ page: laterPayload.page, pageSize: laterPayload.pageSize, totalPages: laterPayload.totalPages },
      { page: 3, pageSize: 20, totalPages: 5 });
    assert.deepEqual(statements[3].params, ['Bosco', 'Bosco', null, null, 20, 40]);

    for (const invalid of ['page=0', 'page=abc', 'pageSize=1000']) {
      const response = await fetch(base + '/api/archive/search?q=Bosco&' + invalid);
      assert.equal(response.status, 400, invalid);
    }
    assert.equal(statements.length, 4, 'invalid pagination must not reach the database');
  });
});

test('anonymous users cannot retrieve a full source page', async () => {
  const authService = { async session() { return null; } };
  const pool = { async execute() { throw new Error('database should not be accessed'); } };
  await withServer(createArchiveDocumentRouter(pool, authService), '/api/archive/documents', async (base) => {
    const response = await fetch(base + '/api/archive/documents/7/pages/12');
    assert.equal(response.status, 401);
  });
});

test('authenticated source page returns only the requested document page', async () => {
  const authService = { async session() { return { id: 1, role: 'free' }; } };
  let values;
  const pool = { async execute(sql, params) {
    values = params;
    return [[{ id: 7, page_number: 12, publication: 'Don Bosco en España', publication_year: 1922, text_content: 'Texto de la página' }]];
  } };
  await withServer(createArchiveDocumentRouter(pool, authService), '/api/archive/documents', async (base) => {
    const response = await fetch(base + '/api/archive/documents/7/pages/12', { headers: { cookie: 'boscochat_session=test' } });
    assert.equal(response.status, 200);
    assert.deepEqual(values, [7, 12]);
    assert.equal((await response.json()).page.page_number, 12);
  });
});
