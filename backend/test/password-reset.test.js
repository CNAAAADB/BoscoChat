import assert from 'node:assert/strict';
import test from 'node:test';
import { PasswordResetService, resetTokenHash } from '../src/auth/password-reset-service.js';

test('BC-002 admin can issue random single-use reset token with 20-minute expiry', async () => {
  let record;
  const now = new Date('2026-11-13T12:00:00Z');
  const service = new PasswordResetService({
    async createPasswordReset(entry) { record = entry; return true; },
  }, { now: () => now });
  const issued = await service.issueByAdministrator(1, 23);
  assert.match(issued.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(issued.expiresAt, '2026-11-13T12:20:00.000Z');
  assert.equal(record.targetId, 23);
  assert.equal(record.actorId, 1);
  assert.equal(record.digest, resetTokenHash(issued.token));
  assert.ok(!record.digest.includes(issued.token));
  await assert.rejects(service.issueByAdministrator(1, 1), (e) => e.code === 'SELF_RESET_FORBIDDEN');
});

test('BC-002 reset token is validated, bound to password hash and not reusable', async () => {
  let digest;
  let calls = 0;
  const service = new PasswordResetService({
    async createPasswordReset({ digest: hash }) { digest = hash; return true; },
    async consumePasswordReset({ digest: supplied, passwordHash }) {
      calls += 1;
      assert.equal(supplied, digest);
      assert.match(passwordHash, /^scrypt\$/);
      return calls === 1;
    },
  });
  const { token } = await service.issueByAdministrator(1, 5);
  assert.deepEqual(await service.redeem({ token, password: 'a-strong-new-password' }), { changed: true });
  await assert.rejects(service.redeem({ token, password: 'a-strong-new-password' }), (e) => e.code === 'INVALID_RESET_TOKEN');
  await assert.rejects(service.redeem({ token: '../wrong', password: 'a-strong-new-password' }), (e) => e.code === 'INVALID_RESET_TOKEN');
  await assert.rejects(service.redeem({ token, password: 'short' }), (e) => e.code === 'INVALID_PASSWORD');
  assert.equal(calls, 2);
});

test('BC-002 repository issue absent target does not produce link', async () => {
  const service = new PasswordResetService({
    async createPasswordReset() { return false; },
  });
  await assert.rejects(service.issueByAdministrator(5, 9), (e) => e.code === 'USER_NOT_FOUND');
});
