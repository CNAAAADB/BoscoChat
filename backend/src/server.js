import pool from './db/connection.js';
import { createApp } from './app.js';
import { ensureAuthRateLimitTable } from './db/auth-rate-limit-bootstrap.js';
import { ensureUserSuspensionColumn } from './db/auth-user-schema-bootstrap.js';
import { ensurePasswordResetSchema } from './db/password-reset-bootstrap.js';
import { ensureInitialAdministrator } from './db/initial-admin-bootstrap.js';

const port = Number(process.env.PORT ?? 3000);
const app = createApp({ pool });
if (process.env.AUTH_RATE_LIMIT_SCHEMA_BOOTSTRAP === 'true') {
  await ensureAuthRateLimitTable(pool);
  console.log('Auth rate-limit schema bootstrap completed');
}

if (process.env.AUTH_USER_SCHEMA_BOOTSTRAP === 'true') {
  await ensureUserSuspensionColumn(pool);
  console.log('User suspension schema bootstrap completed');
}

if (process.env.PASSWORD_RESET_SCHEMA_BOOTSTRAP === 'true') {
  await ensurePasswordResetSchema(pool);
  console.log('Password reset token schema bootstrap completed');
}

if (process.env.INITIAL_ADMIN_BOOTSTRAP === 'true') {
  try {
    const result = await ensureInitialAdministrator(pool, process.env.INITIAL_ADMIN_EMAIL);
    console.log('Initial administrator bootstrap:', result.status);
  } catch (error) {
    console.error('Initial administrator bootstrap failed:', error.code ?? 'SCHEMA_OR_TRANSACTION_ERROR');
  }
}

const server = app.listen(port, () => console.log(`BoscoChat API listening on port ${port}`));

async function shutdown(signal) {
  console.log(`Received ${signal}; shutting down`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
