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

test('public archive discovery returns results without a session and max ten', async () => {
  const pool = { async execute(sql, params) {
    assert.match(sql, /LIMIT \?/);
    assert.equal(params.at(-1), 10);
    return [[{ document_id: 7, publication: 'Don Bosco en España', publication_year: 1922, page_number: 12, text_content: 'Bosco' }]];
  } };
  await withServer(createArchiveSearchRouter(pool), '/api/archive', async (base) => {
    const response = await fetch(base + '/api/archive/search?q=Bosco');
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.results.length, 1);
    assert.equal(payload.results[0].page_number, 12);
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
