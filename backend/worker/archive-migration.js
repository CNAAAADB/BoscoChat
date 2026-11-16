// One-off, private migration Lambda. No API Gateway/function URL is created.
import mysql from 'mysql2/promise';
import { databaseConfig } from '../src/config/database.js';
import { applyBc017Schema } from '../src/db/archive-migration.js';

export async function handler(event) {
  if (event?.operation !== 'apply-bc017-additive-schema') {
    throw new Error('MIGRATION_OPERATION_NOT_ALLOWED');
  }
  const pool = mysql.createPool(databaseConfig({ ...process.env, DB_CONNECTION_LIMIT: '1' }));
  try {
    const verified = await applyBc017Schema(pool);
    return { status: 'verified', ...verified };
  } finally {
    await pool.end();
  }
}
