import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { createFragmentationRouter } from '../src/routes/fragmentation.js';

class HeadObjectCommand { constructor(input) { this.input = input; } }
const sessions = {
  admin: { id: 1, role: 'administrator' },
  historian: { id: 2, role: 'documentary_manager' },
  user: { id: 3, role: 'free' },
};
const auth = { async session(token) { return sessions[token] ?? null; } };
const source = 'originals/Don Bosco en España_1954.pdf';

function fakePool() {
  let current = null;
  return {
    async execute(sql, params) {
      if (sql.includes('SELECT id, publication, publication_year, indexed_at FROM archive_documents')) {
        return [[{ id: 6, publication: 'Don Bosco en España', publication_year: 1954, indexed_at: new Date() }]];
      }
      if (sql.includes('SELECT page_number, LEFT(text_content')) return [[
        { page_number: 1, text_content: 'Don Bosco en España. Enero 1954. Número 1' },
        { page_number: 2, text_content: 'Un artículo histórico' },
        { page_number: 3, text_content: 'Don Bosco en España. Febrero 1954. Número 2' },
      ]];
      if (sql.startsWith('INSERT INTO archive_fragmentation_jobs')) {
        current = {
          id: params[0], source_key: params[1], source_version_id: params[2],
          publication: params[3], publication_year: params[4], page_count: params[5],
          segments_json: params[6], status: params[7], created_by: params[8], error_code: null,
        };
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('SELECT * FROM archive_fragmentation_jobs')) {
        if (sql.includes('WHERE id = ?')) return [current?.id === params[0] ? [current] : []];
        return [current && current.source_key === params[0] ? [current] : []];
      }
      if (sql.startsWith('UPDATE archive_fragmentation_jobs') && sql.includes("status = 'queued'")) {
        if (current.status !== 'proposed' && current.status !== 'failed') return [{ affectedRows: 0 }];
        current.status = 'queued';
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('UPDATE archive_fragmentation_jobs') && sql.includes('segments_json = ?')) {
        current.segments_json = params[0]; current.status = 'proposed';
        return [{ affectedRows: 1 }];
      }
      return [{ affectedRows: 1 }];
    },
  };
}
async function withServer(fn, { enabled = true, pool = fakePool(), version = 'source-v1', invoke = async () => {} } = {}) {
  const app = express();
  app.use(express.json());
  app.use('/api/admin/historical', createFragmentationRouter(pool, auth, {
    enabled, S3HeadCommand: HeadObjectCommand,
    s3Client: { async send() { return { VersionId: version, ContentLength: 10000 }; } },
    invokeFragmenter: invoke,
  }));
  const server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try { await fn('http://127.0.0.1:' + server.address().port + '/api/admin/historical'); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
function request(base, route, role, data = undefined, method = 'POST') {
  return fetch(base + route, {
    method, headers: { cookie: 'boscochat_session=' + role, 'Content-Type': 'application/json' },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
}
test('BC-105 denies scan for anonymous/normal users and when feature disabled', async () => {
  await withServer(async base => {
    assert.equal((await request(base, '/documents/fragmentation-scan', 'user', { filename: source.slice(10) })).status, 403);
    assert.equal((await fetch(base + '/documents/fragmentation-scan', { method: 'POST' })).status, 401);
  });
  await withServer(async base => {
    assert.equal((await request(base, '/documents/fragmentation-scan', 'historian', { filename: source.slice(10) })).status, 503);
  }, { enabled: false });
});
test('BC-105 scan, edit and dispatch require a reviewed, fully covered issue range', async () => {
  let dispatched = '';
  await withServer(async base => {
    const scanned = await request(base, '/documents/fragmentation-scan', 'historian', { filename: source.slice(10) });
    assert.equal(scanned.status, 200);
    const { job } = await scanned.json();
    assert.equal(job.segments.length, 2);
    const route = '/fragmentation-jobs/' + job.id;
    const invalid = await request(base, route + '/segments', 'admin', { segments: [
      { ...job.segments[0], endPage: 3 }, job.segments[1],
    ] }, 'PUT');
    assert.equal(invalid.status, 400);
    const good = await request(base, route + '/segments', 'admin',
      { segments: job.segments.map(s => ({ ...s, issueNumber: '1a' })) }, 'PUT');
    assert.equal(good.status, 200);
    const committed = await request(base, route + '/commit', 'historian', {});
    assert.equal(committed.status, 202);
    assert.equal(dispatched, job.id);
    assert.equal((await request(base, route + '/commit', 'historian', {})).status, 409);
  }, { invoke: async id => { dispatched = id; } });
});
