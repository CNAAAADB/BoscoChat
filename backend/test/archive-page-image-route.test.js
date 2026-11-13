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
