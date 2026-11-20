import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.js';

test('BC-012 visual page endpoint rejects anonymous and malformed requests before any S3/Lambda access', async () => {
  let dbCalls = 0;
  const pool = { async execute() { dbCalls += 1; return [[]]; } };
  const fakeService = {
    repository: {},
    async session(token) {
      return token === 'existing-session' ? { id: 42, role: 'free', username: 'Reader' } : null;
    },
  };
  const app = createApp({
    pool,
    authService: fakeService,
    authRateLimitStore: { async consume() { return null; }, async clear() {} },
    environment: {
      NODE_ENV: 'test',
      CORS_ORIGINS: 'http://localhost:5173',
      ARCHIVE_PAGE_IMAGE_ENABLED: 'true',
      ARCHIVE_WATERMARK_HMAC_KEY: 'z'.repeat(48),
    },
  });
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const anonymous = await fetch(base + '/api/archive/documents/7/pages/2/image');
    assert.equal(anonymous.status, 401);
    const malformed = await fetch(base + '/api/archive/documents/7/pages/0/image', {
      headers: { cookie: 'boscochat_session=existing-session' },
    });
    assert.equal(malformed.status, 400);
    const missing = await fetch(base + '/api/archive/documents/7/pages/2/image', {
      headers: { cookie: 'boscochat_session=existing-session' },
    });
    assert.equal(missing.status, 404);
    assert.equal(dbCalls, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('BC-012 visual page gate requires a strong dedicated watermark secret', () => {
  assert.throws(() => createApp({
    pool: { execute: async () => [[]] },
    authService: { repository: {}, session: async () => null },
    environment: { NODE_ENV: 'test', ARCHIVE_PAGE_IMAGE_ENABLED: 'true', ARCHIVE_WATERMARK_HMAC_KEY: 'short' },
  }), /ARCHIVE_WATERMARK_HMAC_KEY_REQUIRED/);
});

test('BC-012 authenticated page-view gate reports exhausted MySQL deadlock as retriable 503, not generic 500', async () => {
  let pageLookupCalls = 0;
  const app = createApp({
    pool: { async execute() { pageLookupCalls += 1; return [[]]; } },
    authService: { repository: {}, async session() { return { id: 42, role: 'administrator', username: 'Admin' }; } },
    authRateLimitStore: {
      async consume() {
        throw Object.assign(new Error('InnoDB deadlock'), { code: 'ER_LOCK_DEADLOCK', sqlState: '40001' });
      },
    },
    environment: {
      NODE_ENV: 'test',
      CORS_ORIGINS: 'http://localhost:5173',
      ARCHIVE_PAGE_IMAGE_ENABLED: 'true',
      ARCHIVE_WATERMARK_HMAC_KEY: 'z'.repeat(48),
    },
  });
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  try {
    const response = await fetch('http://127.0.0.1:' + server.address().port + '/api/archive/documents/33/pages/23/image', {
      headers: { cookie: 'boscochat_session=existing-session' },
    });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('retry-after'), '1');
    assert.equal((await response.json()).error.code, 'TEMPORARY_DATABASE_CONTENTION');
    assert.equal(pageLookupCalls, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
