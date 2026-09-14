import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { createApp } from '../src/app.js';
import { AuthService } from '../src/auth/service.js';

class MemoryAuthRepository {
  constructor() {
    this.users = [];
    this.sessions = new Map();
  }

  async createUser({ username, email, passwordHash }) {
    if (this.users.some((user) => user.email === email)) {
      const error = new Error('duplicate');
      error.code = 'ER_DUP_ENTRY';
      throw error;
    }
    const user = { id: this.users.length + 1, username, email, passwordHash, role: 'free' };
    this.users.push(user);
    return user;
  }

  async findUserByEmail(email) {
    return this.users.find((user) => user.email === email) ?? null;
  }

  async createSession({ tokenHash, userId, expiresAt }) {
    this.sessions.set(tokenHash, { userId, expiresAt });
  }

  async findSession(tokenHash) {
    const session = this.sessions.get(tokenHash);
    if (!session || session.expiresAt <= new Date()) return null;
    return this.users.find((user) => user.id === session.userId) ?? null;
  }

  async deleteSession(tokenHash) {
    this.sessions.delete(tokenHash);
  }
}

async function jsonRequest(baseUrl, path, { method = 'GET', body, cookie } = {}) {
  const headers = {};
  if (body) headers['content-type'] = 'application/json';
  if (cookie) headers.cookie = cookie;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return { response, data: text ? JSON.parse(text) : null };
}

describe('BC-001 / RF-USER-01 / RF-USER-02 authentication API', () => {
  const repository = new MemoryAuthRepository();
  const app = createApp({ authService: new AuthService(repository), environment: { CORS_ORIGINS: 'http://localhost:5173' } });
  let server;
  let baseUrl;

  before(async () => {
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

  test('registers a normalized account with Free role and never returns/stores plaintext', async () => {
    const { response, data } = await jsonRequest(baseUrl, '/api/auth/register', {
      method: 'POST',
      body: { username: '  Bosco User  ', email: 'USER@Example.com ', password: 'very-secure-password' },
    });

    assert.equal(response.status, 201);
    assert.deepEqual(data.user, { id: 1, username: 'Bosco User', email: 'user@example.com', role: 'free' });
    assert.equal('passwordHash' in data.user, false);
    assert.notEqual(repository.users[0].passwordHash, 'very-secure-password');
    assert.match(repository.users[0].passwordHash, /^scrypt\$/);
  });

  test('rejects duplicate email and invalid registration input safely', async () => {
    const duplicate = await jsonRequest(baseUrl, '/api/auth/register', {
      method: 'POST',
      body: { username: 'Other User', email: 'user@example.com', password: 'another-secure-password' },
    });
    assert.equal(duplicate.response.status, 409);
    assert.equal(duplicate.data.error.code, 'EMAIL_ALREADY_REGISTERED');

    const invalid = await jsonRequest(baseUrl, '/api/auth/register', {
      method: 'POST',
      body: { username: 'x', email: 'invalid', password: 'short' },
    });
    assert.equal(invalid.response.status, 400);
  });

  test('logs in with valid credentials and creates a server-side session cookie', async () => {
    const { response, data } = await jsonRequest(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: 'USER@example.com', password: 'very-secure-password' },
    });

    assert.equal(response.status, 200);
    assert.equal(data.user.email, 'user@example.com');
    const setCookie = response.headers.get('set-cookie');
    assert.match(setCookie, /^boscochat_session=/);
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Lax/i);
    assert.equal(repository.sessions.size, 1);

    const cookie = setCookie.split(';', 1)[0];
    const session = await jsonRequest(baseUrl, '/api/auth/session', { cookie });
    assert.equal(session.response.status, 200);
    assert.equal(session.data.user.id, 1);

    const logout = await jsonRequest(baseUrl, '/api/auth/logout', { method: 'POST', cookie });
    assert.equal(logout.response.status, 204);
    assert.equal(repository.sessions.size, 0);
    const expired = await jsonRequest(baseUrl, '/api/auth/session', { cookie });
    assert.equal(expired.response.status, 401);
  });

  test('rejects wrong and unknown credentials with the same safe response', async () => {
    const wrongPassword = await jsonRequest(baseUrl, '/api/auth/login', {
      method: 'POST', body: { email: 'user@example.com', password: 'definitely-wrong' },
    });
    const unknownUser = await jsonRequest(baseUrl, '/api/auth/login', {
      method: 'POST', body: { email: 'missing@example.com', password: 'definitely-wrong' },
    });

    assert.equal(wrongPassword.response.status, 401);
    assert.equal(unknownUser.response.status, 401);
    assert.deepEqual(wrongPassword.data, unknownUser.data);
  });

  test('RNF-SEC-03 limits repeated authentication attempts', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const result = await jsonRequest(baseUrl, '/api/auth/login', {
        method: 'POST', body: { email: 'limited@example.com', password: 'invalid-password' },
      });
      assert.equal(result.response.status, 401);
    }
    const limited = await jsonRequest(baseUrl, '/api/auth/login', {
      method: 'POST', body: { email: 'limited@example.com', password: 'invalid-password' },
    });
    assert.equal(limited.response.status, 429);
    assert.equal(limited.data.error.code, 'TOO_MANY_ATTEMPTS');
    assert.ok(Number(limited.response.headers.get('retry-after')) > 0);
  });
});

test('RNF-SEC-03 enforces the server session on existing protected endpoints', async (t) => {
  const repository = new MemoryAuthRepository();
  const authService = new AuthService(repository);
  const calls = [];
  const pool = {
    async execute(sql, parameters) {
      calls.push({ sql, parameters });
      if (sql.includes('SELECT d.title')) return [[{ title: 'Boletín', text_content: 'Texto', page_number: 1 }]];
      return [{ affectedRows: 1 }];
    },
  };
  const app = createApp({ pool, authService, environment: { CORS_ORIGINS: 'http://localhost:5173' } });
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  await authService.register({ username: 'Search User', email: 'search@example.com', password: 'very-secure-password' });
  const loginResult = await jsonRequest(baseUrl, '/api/auth/login', {
    method: 'POST', body: { email: 'search@example.com', password: 'very-secure-password' },
  });
  const cookie = loginResult.response.headers.get('set-cookie').split(';', 1)[0];

  const anonymousSearch = await jsonRequest(baseUrl, '/api/search?q=texto&userId=999');
  assert.equal(anonymousSearch.response.status, 401);

  const search = await jsonRequest(baseUrl, '/api/search?q=texto&userId=999', { cookie });
  assert.equal(search.response.status, 200);
  const counterUpdate = calls.find(({ sql }) => sql.startsWith('UPDATE users SET query_count'));
  assert.deepEqual(counterUpdate.parameters, [1]);

  const unauthorizedAdmin = await jsonRequest(baseUrl, '/api/admin/upload-doc', {
    method: 'POST', cookie, body: { title: 'x', content: 'y', page: 1 },
  });
  assert.equal(unauthorizedAdmin.response.status, 403);

  repository.users[0].role = 'gestor';
  const unauthorizedRoleChange = await jsonRequest(baseUrl, '/api/update-role', {
    method: 'POST', cookie, body: { userId: 999, newRole: 'admin' },
  });
  assert.equal(unauthorizedRoleChange.response.status, 403);
  assert.equal(calls.some(({ sql }) => sql.startsWith('UPDATE users SET role')), false);
});
