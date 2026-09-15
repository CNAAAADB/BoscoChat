import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { AuthService } from '../src/auth/service.js';
import { createApp } from '../src/app.js';
import { UsageRepository } from '../src/db/usage-repository.js';
import { queryQuotaConfig } from '../src/usage/quota-config.js';
import { UsageError, UsageService } from '../src/usage/service.js';

class MemoryUsageRepository {
  constructor() {
    this.counters = new Map();
    this.logs = [];
  }

  async consume(entry) {
    const key = `${entry.userId}|${entry.type}|${entry.periodStart.toISOString()}`;
    const used = this.counters.get(key) ?? 0;
    const consumed = used < entry.limit;
    this.logs.push({ ...entry, outcome: consumed ? 'accepted' : 'blocked_quota' });
    if (consumed) this.counters.set(key, used + 1);
    return { consumed, used: consumed ? used + 1 : used };
  }
}

class MemoryAuthRepository {
  constructor() {
    this.users = [];
    this.sessions = new Map();
  }

  async createUser({ username, email, passwordHash }) {
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
    return this.users.find(({ id }) => id === session.userId) ?? null;
  }

  async deleteSession(tokenHash) {
    this.sessions.delete(tokenHash);
  }
}

const quotas = Object.freeze({
  free: Object.freeze({
    search: Object.freeze({ limit: 2, periodSeconds: 60 }),
    chat: Object.freeze({ limit: 1, periodSeconds: 60 }),
  }),
});

async function jsonRequest(baseUrl, path, { method = 'GET', body, cookie } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (cookie) headers.cookie = cookie;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { response, data: text ? JSON.parse(text) : null };
}

test('BC-003 / RF-USAGE-02 validates configurable per-plan limits and periods', () => {
  const result = queryQuotaConfig({
    QUERY_QUOTAS_JSON: JSON.stringify({ free: { search: { limit: 12, periodSeconds: 3600 } } }),
  });
  assert.deepEqual(result.free.search, { limit: 12, periodSeconds: 3600 });
  assert.throws(() => queryQuotaConfig({ QUERY_QUOTAS_JSON: '{' }), /valid JSON/);
  assert.throws(() => queryQuotaConfig({
    QUERY_QUOTAS_JSON: JSON.stringify({ free: { search: { limit: 0, periodSeconds: 3600 } } }),
  }), /limit/);
});

test('BC-003 / RF-USAGE-01 / RF-USAGE-02 keeps query types independent and resets periods', async () => {
  const repository = new MemoryUsageRepository();
  let now = new Date('2026-09-15T12:00:05.000Z');
  const service = new UsageService(repository, { quotas, now: () => now });
  const user = { id: 7, role: 'free' };

  assert.equal((await service.consume({ user, type: 'search', parameters: { query: 'Bosco' } })).remaining, 1);
  assert.equal((await service.consume({ user, type: 'chat', parameters: { message: 'Hola' } })).remaining, 0);
  assert.equal((await service.consume({ user, type: 'search', parameters: { query: 'Salesianos' } })).remaining, 0);
  await assert.rejects(
    service.consume({ user, type: 'search', parameters: { query: 'agotada' } }),
    (error) => error instanceof UsageError && error.code === 'QUERY_LIMIT_EXCEEDED' && error.details.remaining === 0,
  );

  now = new Date('2026-09-15T12:01:01.000Z');
  assert.equal((await service.consume({ user, type: 'search', parameters: { query: 'nuevo periodo' } })).remaining, 1);
  assert.deepEqual(repository.logs.map(({ type, outcome }) => [type, outcome]), [
    ['search', 'accepted'], ['chat', 'accepted'], ['search', 'accepted'],
    ['search', 'blocked_quota'], ['search', 'accepted'],
  ]);
  assert.deepEqual(JSON.parse(repository.logs[0].parametersJson), { query: 'Bosco' });
});

test('BC-003 fails closed when a plan has no configured quota and bounds logged parameters', async () => {
  const service = new UsageService(new MemoryUsageRepository(), { quotas: {} });
  await assert.rejects(
    service.consume({ user: { id: 1, role: 'free' }, type: 'search', parameters: {} }),
    (error) => error.code === 'QUOTA_NOT_CONFIGURED' && error.status === 503,
  );

  const configured = new UsageService(new MemoryUsageRepository(), { quotas });
  await assert.rejects(
    configured.consume({ user: { id: 1, role: 'free' }, type: 'chat', parameters: { message: 'x'.repeat(5000) } }),
    (error) => error.code === 'QUERY_PARAMETERS_TOO_LARGE' && error.status === 413,
  );
});

test('BC-003 / RF-USAGE-02 serializes MySQL counter updates and logs blocked attempts', async () => {
  const calls = [];
  const connection = {
    async beginTransaction() { calls.push('begin'); },
    async execute(sql, parameters) {
      calls.push({ sql, parameters });
      if (sql.includes('SELECT query_count')) return [[{ queryCount: 2 }]];
      return [{ affectedRows: 1 }];
    },
    async commit() { calls.push('commit'); },
    async rollback() { calls.push('rollback'); },
    release() { calls.push('release'); },
  };
  const repository = new UsageRepository({ async getConnection() { return connection; } });
  const periodStart = new Date('2026-09-15T12:00:00.000Z');
  const periodEnd = new Date('2026-09-15T13:00:00.000Z');
  const result = await repository.consume({
    userId: 9, plan: 'free', type: 'search', parametersJson: '{"query":"Bosco"}',
    timestamp: new Date('2026-09-15T12:05:00.000Z'), periodStart, periodEnd, limit: 2,
  });

  assert.deepEqual(result, { consumed: false, used: 2 });
  assert.equal(calls.some((entry) => typeof entry === 'object' && entry.sql.includes('FOR UPDATE')), true);
  const log = calls.find((entry) => typeof entry === 'object' && entry.sql.includes('INSERT INTO query_logs'));
  assert.equal(log.parameters[3], 'blocked_quota');
  assert.equal(calls.some((entry) => typeof entry === 'object' && entry.sql.includes('SET query_count')), false);
  assert.deepEqual(calls.slice(-2), ['commit', 'release']);
});

describe('BC-003 / RF-USAGE-01 / RF-USAGE-03 query endpoint enforcement', () => {
  const authRepository = new MemoryAuthRepository();
  const authService = new AuthService(authRepository);
  const usageRepository = new MemoryUsageRepository();
  const usageService = new UsageService(usageRepository, {
    quotas,
    now: () => new Date('2026-09-15T12:00:05.000Z'),
  });
  const pool = {
    async execute(sql) {
      if (sql.includes('SELECT d.title')) return [[{ title: 'Boletín', text_content: 'Don Bosco', page_number: 12 }]];
      return [{ affectedRows: 1 }];
    },
  };
  let server;
  let baseUrl;
  let cookie;

  before(async () => {
    await authService.register({ username: 'Usage User', email: 'usage@example.com', password: 'usage-test-password' });
    server = await new Promise((resolve) => {
      const listener = createApp({ pool, authService, usageService, environment: { CORS_ORIGINS: 'http://localhost:5173' } })
        .listen(0, '127.0.0.1', () => resolve(listener));
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    const login = await jsonRequest(baseUrl, '/api/auth/login', {
      method: 'POST', body: { email: 'usage@example.com', password: 'usage-test-password' },
    });
    cookie = login.response.headers.get('set-cookie').split(';', 1)[0];
  });

  after(async () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

  test('authentication is enforced before usage is logged', async () => {
    const anonymous = await jsonRequest(baseUrl, '/api/search?q=Bosco');
    assert.equal(anonymous.response.status, 401);
    assert.equal(usageRepository.logs.length, 0);
  });

  test('search quota emits remaining/reset metadata and a safe upgrade response', async () => {
    const first = await jsonRequest(baseUrl, '/api/search?q=Bosco', { cookie });
    const second = await jsonRequest(baseUrl, '/api/search?q=Salesianos', { cookie });
    const blocked = await jsonRequest(baseUrl, '/api/search?q=otra', { cookie });

    assert.equal(first.response.status, 200);
    assert.equal(first.response.headers.get('ratelimit-remaining'), '1');
    assert.equal(second.response.headers.get('ratelimit-remaining'), '0');
    assert.equal(blocked.response.status, 429);
    assert.equal(blocked.data.error.code, 'QUERY_LIMIT_EXCEEDED');
    assert.match(blocked.data.error.message, /Mejora tu plan/);
    assert.equal(blocked.data.error.details.type, 'search');
  });

  test('chat uses an independent counter and records user, type, timestamp and parameters', async () => {
    const chat = await jsonRequest(baseUrl, '/api/chat', { method: 'POST', cookie, body: { message: '¿Quién fue Don Bosco?' } });
    const blocked = await jsonRequest(baseUrl, '/api/chat', { method: 'POST', cookie, body: { message: 'Otra pregunta' } });

    assert.equal(chat.response.status, 200);
    assert.equal(chat.response.headers.get('ratelimit-remaining'), '0');
    assert.equal(blocked.response.status, 429);
    const accepted = usageRepository.logs.find(({ type, outcome }) => type === 'chat' && outcome === 'accepted');
    assert.equal(accepted.userId, 1);
    assert.equal(accepted.timestamp.toISOString(), '2026-09-15T12:00:05.000Z');
    assert.deepEqual(JSON.parse(accepted.parametersJson), { message: '¿Quién fue Don Bosco?' });
  });
});
