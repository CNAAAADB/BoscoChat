import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { createApp } from '../src/app.js';
import { AuthService } from '../src/auth/service.js';
import { UserAdministrationService } from '../src/users/administration-service.js';
import { ROLE_VALUES, ROLES } from '../src/users/roles.js';

class MemoryUserRepository {
  constructor() {
    this.users = [];
    this.sessions = new Map();
    this.auditLogs = [];
    this.administrationQueue = Promise.resolve();
  }

  async createUser({ username, email, passwordHash, role, actorId = null }) {
    if (this.users.some((user) => user.email === email)) {
      const error = new Error('duplicate');
      error.code = 'ER_DUP_ENTRY';
      throw error;
    }
    const user = {
      id: this.users.length === 0 ? 1 : Math.max(...this.users.map(({ id }) => id)) + 1,
      username, email, passwordHash, role, suspendedAt: null,
    };
    this.users.push(user);
    if (actorId !== null) {
      this.auditLogs.push({ actorId, targetId: user.id, action: 'user.create', outcome: 'success', details: { role } });
    }
    return user;
  }

  async findUserByEmail(email) {
    return this.users.find((user) => user.email === email) ?? null;
  }

  async findUserById(id) {
    return this.users.find((user) => user.id === id) ?? null;
  }

  async listUsers() {
    return [...this.users].sort((left, right) => left.id - right.id);
  }

  async withAdministrationLock(operation) {
    const previous = this.administrationQueue;
    let release;
    this.administrationQueue = new Promise((resolve) => { release = resolve; });
    await previous;
    try { return await operation(); } finally { release(); }
  }

  activeAdministrators() {
    return this.users.filter((user) => user.role === ROLES.ADMINISTRATOR && !user.suspendedAt);
  }

  assertAdministratorRemains(user, removesActiveAdministrator) {
    if (removesActiveAdministrator && user.role === ROLES.ADMINISTRATOR
      && !user.suspendedAt && this.activeAdministrators().length <= 1) {
      const error = new Error('At least one active administrator must remain');
      error.code = 'LAST_ACTIVE_ADMIN';
      throw error;
    }
  }

  async updateUserRole(actorId, id, role) {
    return this.withAdministrationLock(async () => {
      const user = await this.findUserById(id);
      if (!user) return null;
      this.assertAdministratorRemains(user, role !== ROLES.ADMINISTRATOR);
      user.role = role;
      this.auditLogs.push({ actorId, targetId: id, action: 'user.role.change', outcome: 'success', details: { role } });
      return user;
    });
  }

  async setUserSuspended(actorId, id, suspended) {
    return this.withAdministrationLock(async () => {
      const user = await this.findUserById(id);
      if (!user) return null;
      this.assertAdministratorRemains(user, suspended);
      user.suspendedAt = suspended ? new Date() : null;
      if (suspended) {
        for (const [token, session] of this.sessions) {
          if (session.userId === id) this.sessions.delete(token);
        }
      }
      this.auditLogs.push({ actorId, targetId: id, action: suspended ? 'user.suspend' : 'user.reactivate', outcome: 'success' });
      return user;
    });
  }

  async deleteUser(actorId, id) {
    return this.withAdministrationLock(async () => {
      const index = this.users.findIndex((user) => user.id === id);
      if (index < 0) return false;
      const user = this.users[index];
      this.assertAdministratorRemains(user, true);
      this.users.splice(index, 1);
      for (const [token, session] of this.sessions) {
        if (session.userId === id) this.sessions.delete(token);
      }
      this.auditLogs.push({ actorId, targetId: id, action: 'user.delete', outcome: 'success', details: { priorRole: user.role } });
      return true;
    });
  }

  async recordAdminAudit(entry) {
    this.auditLogs.push(entry);
  }

  async createSession({ tokenHash, userId, expiresAt }) {
    this.sessions.set(tokenHash, { userId, expiresAt });
  }

  async findSession(tokenHash) {
    const session = this.sessions.get(tokenHash);
    if (!session || session.expiresAt <= new Date()) return null;
    const user = await this.findUserById(session.userId);
    return user && !user.suspendedAt ? user : null;
  }

  async deleteSession(tokenHash) {
    this.sessions.delete(tokenHash);
  }
}

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

async function loginCookie(baseUrl, email, password) {
  const result = await jsonRequest(baseUrl, '/api/auth/login', { method: 'POST', body: { email, password } });
  return { ...result, cookie: result.response.headers.get('set-cookie')?.split(';', 1)[0] };
}

describe('BC-002 / RF-USER-04 / RF-ADMIN-01 role authorization', () => {
  const repository = new MemoryUserRepository();
  const authService = new AuthService(repository);
  const poolCalls = [];
  const pool = {
    async execute(sql, parameters) {
      poolCalls.push({ sql, parameters });
      if (sql.startsWith('INSERT INTO documents')) return [{ insertId: 7 }];
      return [{ affectedRows: 1 }];
    },
  };
  const app = createApp({
    pool,
    authService,
    usageService: { async consume() { return { limit: 10, remaining: 9, resetsAt: '2026-10-30T12:00:00.000Z' }; } },
    environment: { CORS_ORIGINS: 'http://localhost:5173' },
  });
  let server;
  let baseUrl;
  let adminCookie;
  let freeCookie;

  before(async () => {
    await authService.createAccount(
      { username: 'Administrator', email: 'admin@example.com', password: 'administrator-password' },
      ROLES.ADMINISTRATOR,
    );
    await authService.register({ username: 'Free user', email: 'free@example.com', password: 'free-user-password' });
    server = await new Promise((resolve) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    adminCookie = (await loginCookie(baseUrl, 'admin@example.com', 'administrator-password')).cookie;
    freeCookie = (await loginCookie(baseUrl, 'free@example.com', 'free-user-password')).cookie;
  });

  after(async () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

  test('RNF-SEC-03 rejects anonymous and non-administrator account management consistently', async () => {
    const anonymous = await jsonRequest(baseUrl, '/api/admin/users');
    assert.equal(anonymous.response.status, 401);
    assert.equal(anonymous.data.error.code, 'AUTHENTICATION_REQUIRED');

    const forbidden = await jsonRequest(baseUrl, '/api/admin/users', { cookie: freeCookie });
    assert.equal(forbidden.response.status, 403);
    assert.deepEqual(forbidden.data, { error: { code: 'FORBIDDEN', message: 'No tienes permiso para realizar esta acción.' } });

    const createForbidden = await jsonRequest(baseUrl, '/api/admin/users', {
      method: 'POST', cookie: freeCookie,
      body: { username: 'No access', email: 'blocked@example.com', password: 'blocked-password', role: ROLES.PRO },
    });
    assert.equal(createForbidden.response.status, 403);
    assert.equal(repository.users.some(({ email }) => email === 'blocked@example.com'), false);
  });

  test('administrator can create accounts for every supported role and list only safe records', async () => {
    for (const [index, role] of ROLE_VALUES.entries()) {
      const created = await jsonRequest(baseUrl, '/api/admin/users', {
        method: 'POST', cookie: adminCookie,
        body: { username: `Role ${role}`, email: `role-${index}@example.com`, password: 'created-by-administrator', role },
      });
      assert.equal(created.response.status, 201);
      assert.equal(created.data.user.role, role);
      assert.equal(created.data.user.suspended, false);
      assert.equal('passwordHash' in created.data.user, false);
    }

    const users = await jsonRequest(baseUrl, '/api/admin/users', { cookie: adminCookie });
    assert.equal(users.response.status, 200);
    assert.deepEqual(new Set(users.data.users.map(({ role }) => role)), new Set(ROLE_VALUES));
    assert.equal(users.data.users.some((record) => 'passwordHash' in record), false);

    const invalid = await jsonRequest(baseUrl, '/api/admin/users', {
      method: 'POST', cookie: adminCookie,
      body: { username: 'Invalid', email: 'invalid-role@example.com', password: 'invalid-role-password', role: 'owner' },
    });
    assert.equal(invalid.response.status, 400);
    assert.equal(invalid.data.error.code, 'INVALID_ROLE');
  });

  test('role changes are immediate while self-demotion is rejected safely', async () => {
    const freeUser = repository.users.find(({ email }) => email === 'free@example.com');
    const updated = await jsonRequest(baseUrl, `/api/admin/users/${freeUser.id}/role`, {
      method: 'PATCH', cookie: adminCookie, body: { role: ROLES.DOCUMENTARY_MANAGER },
    });
    assert.equal(updated.response.status, 200);
    assert.equal(updated.data.user.role, ROLES.DOCUMENTARY_MANAGER);

    const upload = await jsonRequest(baseUrl, '/api/admin/upload-doc', {
      method: 'POST', cookie: freeCookie, body: { title: 'Boletín', content: 'OCR', page: 1 },
    });
    assert.equal(upload.response.status, 200);

    const administrator = repository.users.find(({ email }) => email === 'admin@example.com');
    const selfDemotion = await jsonRequest(baseUrl, `/api/admin/users/${administrator.id}/role`, {
      method: 'PATCH', cookie: adminCookie, body: { role: ROLES.FREE },
    });
    assert.equal(selfDemotion.response.status, 409);
    assert.equal(selfDemotion.data.error.code, 'SELF_ADMINISTRATION_FORBIDDEN');
    assert.equal(administrator.role, ROLES.ADMINISTRATOR);
    assert.equal(repository.auditLogs.some(({ action, outcome }) => action === 'user.role.change' && outcome === 'denied'), true);
  });

  test('CWE-362 regression: concurrent cross-demotions preserve one active administrator', async () => {
    const isolatedRepository = new MemoryUserRepository();
    const isolatedAuthService = new AuthService(isolatedRepository);
    const service = new UserAdministrationService(isolatedRepository, isolatedAuthService);
    const first = await isolatedAuthService.createAccount(
      { username: 'First admin', email: 'first-admin@example.com', password: 'first-admin-password' },
      ROLES.ADMINISTRATOR,
    );
    const second = await isolatedAuthService.createAccount(
      { username: 'Second admin', email: 'second-admin@example.com', password: 'second-admin-password' },
      ROLES.ADMINISTRATOR,
    );

    const results = await Promise.allSettled([
      service.changeRole(first.id, second.id, ROLES.FREE),
      service.changeRole(second.id, first.id, ROLES.FREE),
    ]);

    assert.equal(results.filter(({ status }) => status === 'fulfilled').length, 1);
    const rejection = results.find(({ status }) => status === 'rejected');
    assert.equal(rejection.reason.code, 'LAST_ACTIVE_ADMIN_REQUIRED');
    assert.equal(isolatedRepository.activeAdministrators().length, 1);
    assert.equal(isolatedRepository.auditLogs.some(({ action, outcome, details }) =>
      action === 'user.role.change' && outcome === 'denied' && details.code === 'LAST_ACTIVE_ADMIN_REQUIRED'), true);
  });

  test('documentary manager permission is distinct from paid-user roles', async () => {
    const proUser = repository.users.find(({ role }) => role === ROLES.PRO);
    const proLogin = await loginCookie(baseUrl, proUser.email, 'created-by-administrator');
    const forbidden = await jsonRequest(baseUrl, '/api/admin/upload-doc', {
      method: 'POST', cookie: proLogin.cookie, body: { title: 'Denied', content: 'OCR', page: 1 },
    });
    assert.equal(forbidden.response.status, 403);
    assert.equal(poolCalls.filter(({ sql }) => sql.startsWith('INSERT INTO documents')).length, 1);
  });

  test('administrator can suspend, reactivate and delete an account with session revocation', async () => {
    const target = repository.users.find(({ role }) => role === ROLES.PREMIUM);
    const activeLogin = await loginCookie(baseUrl, target.email, 'created-by-administrator');
    assert.equal(activeLogin.response.status, 200);

    const suspended = await jsonRequest(baseUrl, `/api/admin/users/${target.id}/suspension`, {
      method: 'PATCH', cookie: adminCookie, body: { suspended: true },
    });
    assert.equal(suspended.response.status, 200);
    assert.equal(suspended.data.user.suspended, true);
    assert.equal((await jsonRequest(baseUrl, '/api/auth/session', { cookie: activeLogin.cookie })).response.status, 401);
    const blockedLogin = await loginCookie(baseUrl, target.email, 'created-by-administrator');
    assert.equal(blockedLogin.response.status, 403);
    assert.equal(blockedLogin.data.error.code, 'ACCOUNT_SUSPENDED');

    const reactivated = await jsonRequest(baseUrl, `/api/admin/users/${target.id}/suspension`, {
      method: 'PATCH', cookie: adminCookie, body: { suspended: false },
    });
    assert.equal(reactivated.response.status, 200);
    assert.equal((await loginCookie(baseUrl, target.email, 'created-by-administrator')).response.status, 200);

    const deleted = await jsonRequest(baseUrl, `/api/admin/users/${target.id}`, { method: 'DELETE', cookie: adminCookie });
    assert.equal(deleted.response.status, 204);
    assert.equal(await repository.findUserById(target.id), null);
  });

  test('not-found, invalid ID and administrator self-removal return safe errors', async () => {
    const administrator = repository.users.find(({ email }) => email === 'admin@example.com');
    const invalid = await jsonRequest(baseUrl, '/api/admin/users/not-a-number/role', {
      method: 'PATCH', cookie: adminCookie, body: { role: ROLES.FREE },
    });
    assert.equal(invalid.response.status, 400);
    assert.equal(invalid.data.error.code, 'INVALID_USER_ID');

    const missing = await jsonRequest(baseUrl, '/api/admin/users/999999', { method: 'DELETE', cookie: adminCookie });
    assert.equal(missing.response.status, 404);
    assert.equal(missing.data.error.code, 'USER_NOT_FOUND');

    const selfDelete = await jsonRequest(baseUrl, `/api/admin/users/${administrator.id}`, { method: 'DELETE', cookie: adminCookie });
    assert.equal(selfDelete.response.status, 409);
    assert.equal(selfDelete.data.error.code, 'SELF_ADMINISTRATION_FORBIDDEN');
    assert.equal(repository.auditLogs.some(({ action, outcome }) => action === 'user.delete' && outcome === 'denied'), true);
  });
});

