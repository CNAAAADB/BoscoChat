import mysql from 'mysql2/promise';
import { databaseConfig } from '../config/database.js';

export function createDatabasePool(environment = process.env) {
  return mysql.createPool(databaseConfig(environment));
}

export default createDatabasePool();
