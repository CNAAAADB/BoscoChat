import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { databaseConfig } from '../src/config/database.js';

test('BC-001 regression: database credentials must come from the environment', async () => {
  assert.throws(() => databaseConfig({ DB_USER: 'boscochat' }), /DB_PASSWORD must be set/);
  const source = await readFile(new URL('../src/db/connection.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /password\s*:\s*['"][^'"]+['"]/i);
  const ignoreRules = await readFile(new URL('../.gitignore', import.meta.url), 'utf8');
  assert.match(ignoreRules, /^node_modules\/$/m);
  assert.match(ignoreRules, /^\.env$/m);
});

test('database configuration validates its port', () => {
  assert.throws(
    () => databaseConfig({ DB_USER: 'user', DB_PASSWORD: 'secret', DB_PORT: 'not-a-port' }),
    /DB_PORT/,
  );
  assert.throws(
    () => databaseConfig({ DB_USER: 'user', DB_PASSWORD: 'secret', DB_CONNECTION_LIMIT: '0' }),
    /DB_CONNECTION_LIMIT/,
  );
});
