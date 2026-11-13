import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.js';

test('BC-002 authenticated API responses cannot be cached by a shared first-party reverse proxy', async () => {
  const service = {
    repository: {},
    async session() { return null; },
  };
  const app = createApp({ authService: service, administrationService: {} });
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  try {
    const base = 'http://127.0.0.1:' + server.address().port;
    for (const path of ['/api/auth/session', '/api/admin/users']) {
      const response = await fetch(base + path);
      assert.equal(response.status, 401, path);
      assert.equal(response.headers.get('cache-control'), 'private, no-store', path);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
