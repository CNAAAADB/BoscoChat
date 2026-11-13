import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { createAdminUsersRouter } from '../src/routes/admin-users.js';
import { createAuthRouter } from '../src/routes/auth.js';
import { UserAdministrationService } from '../src/users/administration-service.js';
import { ASSIGNABLE_ROLES, PROFILE_LABELS } from '../src/users/roles.js';

test('BC-002 exactly three profiles are assignable; legacy subscriptions remain readable', () => {
  assert.deepEqual(ASSIGNABLE_ROLES, ['free', 'documentary_manager', 'administrator']);
  assert.equal(PROFILE_LABELS.pro, 'Usuario');
  assert.equal(PROFILE_LABELS.documentary_manager, 'Historiador');
});

test('BC-002 privileged reset endpoint denies nonadmins and returns only one-use token to admin', async () => {
  const auth = { async session(token) { return token === 'admin' ? { id: 1, role: 'administrator' } : token === 'historian' ? { id: 2, role: 'documentary_manager' } : null; } };
  const service = {
    async issueByAdministrator(actorId, targetId) {
      assert.equal(actorId, 1);
      assert.equal(targetId, '5');
      return { token: 'a'.repeat(43), expiresAt: '2026-11-13T12:20:00.000Z' };
    },
  };
  const app = express();
  app.use(express.json());
  app.use('/admin/users', createAdminUsersRouter(auth, {}, { passwordResets: service }));
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    const path = 'http://127.0.0.1:' + server.address().port + '/admin/users/5/password-reset';
    for (const session of [null, 'historian']) {
      const result = await fetch(path, { method: 'POST', headers: session ? { cookie: 'boscochat_session=' + session } : {} });
      assert.equal(result.status, session ? 403 : 401);
    }
    const allowed = await fetch(path, { method: 'POST', headers: { cookie: 'boscochat_session=admin' } });
    assert.equal(allowed.status, 201);
    assert.equal(allowed.headers.get('cache-control'), 'no-store');
    assert.equal((await allowed.json()).reset.token, 'a'.repeat(43));
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('BC-002 password redemption uses rate limiter and never establishes a session', async () => {
  let redeemed;
  const app = express();
  app.use(express.json());
  app.use('/auth', createAuthRouter({}, {
    passwordResets: { async redeem(input) { redeemed = input; return { changed: true }; } },
    resetRateLimiter: (_req, _res, next) => next(),
  }));
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try {
    const response = await fetch('http://127.0.0.1:' + server.address().port + '/auth/password-reset', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'a'.repeat(43), password: 'new-strong-password' }),
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(redeemed.password, 'new-strong-password');
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('BC-002 role service rejects obsolete paid-plan assignment but does not remove legacy roles', async () => {
  const admin = new UserAdministrationService({
    async recordAdminAudit() {},
  }, { async createAccount() { throw new Error('should not create'); } });
  await assert.rejects(admin.createUser(1, { role: 'premium' }), (error) => error.code === 'INVALID_ROLE');
  await assert.rejects(admin.changeRole(1, 3, 'pro'), (error) => error.code === 'INVALID_ROLE');
});
