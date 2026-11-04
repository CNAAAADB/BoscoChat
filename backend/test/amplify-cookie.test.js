import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { MemoryAuthRateLimitStore } from '../src/middleware/auth-rate-limit.js';

const authService = {
  async register() {
    return { id: 1, username: 'Test', email: 'test@example.com', role: 'free' };
  },
  async login() {
    return {
      token: 'test-token',
      user: { id: 1, username: 'Test', email: 'test@example.com', role: 'free' },
      expiresAt: new Date(Date.now() + 60_000),
    };
  },
  async session() {
    return null;
  },
  async logout() {},
};

test('Amplify/App Runner deployment can emit a cross-site secure session cookie', async (t) => {
  const app = createApp({
    authService,
    authRateLimitStore: new MemoryAuthRateLimitStore(),
    environment: {
      NODE_ENV: 'production',
      AUTH_RATE_LIMIT_HMAC_KEY: 'test-only-auth-rate-limit-key-32-bytes',
      CORS_ORIGINS: 'https://main.example.amplifyapp.com',
      SESSION_COOKIE_SAME_SITE: 'none',
    },
  });
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://main.example.amplifyapp.com',
    },
    body: JSON.stringify({ email: 'test@example.com', password: 'irrelevant' }),
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://main.example.amplifyapp.com');
  assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
  const setCookie = response.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /Secure/i);
  assert.match(setCookie, /SameSite=None/i);
});

test('production fails closed without a shared authentication limiter', () => {
  assert.throws(
    () => createApp({ authService, environment: { NODE_ENV: 'production' } }),
    /AUTH_RATE_LIMIT_STORE_REQUIRED/,
  );
});

test('production rejects a missing or weak limiter pseudonymization key', () => {
  assert.throws(
    () => createApp({
      authService,
      authRateLimitStore: new MemoryAuthRateLimitStore(),
      environment: { NODE_ENV: 'production' },
    }),
    /AUTH_RATE_LIMIT_HMAC_KEY_REQUIRED/,
  );
});

