import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { normalizeRole, ROLE_VALUES, ROLES } from '../src/users/roles.js';

test('BC-002 / RF-USER-04 defines exactly the six supported roles', () => {
  assert.deepEqual(ROLE_VALUES, [
    'free', 'pro', 'premium', 'advanced', 'administrator', 'documentary_manager',
  ]);
  assert.equal(new Set(ROLE_VALUES).size, 6);
});

test('BC-002 migration aliases are accepted only at authorization boundaries', () => {
  assert.equal(normalizeRole('admin'), null);
  assert.equal(normalizeRole('gestor'), null);
  assert.equal(normalizeRole('admin', { acceptLegacyAliases: true }), ROLES.ADMINISTRATOR);
  assert.equal(normalizeRole('gestor', { acceptLegacyAliases: true }), ROLES.DOCUMENTARY_MANAGER);
  assert.equal(normalizeRole('owner', { acceptLegacyAliases: true }), null);
});

test('BC-002 migration persists suspension and rejects unsupported database roles', async () => {
  const migration = await readFile(new URL('../scripts/migrate.js', import.meta.url), 'utf8');
  assert.match(migration, /suspended_at TIMESTAMP NULL/);
  assert.match(migration, /'free', 'pro', 'premium', 'advanced', 'administrator', 'documentary_manager'/);
  assert.match(migration, /unsupported user roles must be resolved/);
});
