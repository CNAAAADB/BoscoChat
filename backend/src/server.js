import pool from './db/connection.js';
import { createApp } from './app.js';
import { ensureAuthRateLimitTable } from './db/auth-rate-limit-bootstrap.js';

const port = Number(process.env.PORT ?? 3000);
const app = createApp({ pool });
if (process.env.AUTH_RATE_LIMIT_SCHEMA_BOOTSTRAP === 'true') {
  await ensureAuthRateLimitTable(pool);
  console.log('Auth rate-limit schema bootstrap completed');
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
