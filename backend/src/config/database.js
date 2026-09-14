const DEFAULTS = Object.freeze({
  host: '127.0.0.1',
  port: 3306,
  database: 'boscochat',
});

function required(environment, name) {
  const value = environment[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} must be set`);
  }
  return value;
}

export function databaseConfig(environment = process.env) {
  const port = Number(environment.DB_PORT ?? DEFAULTS.port);
  const connectionLimit = Number(environment.DB_CONNECTION_LIMIT ?? 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('DB_PORT must be an integer between 1 and 65535');
  }
  if (!Number.isInteger(connectionLimit) || connectionLimit < 1 || connectionLimit > 100) {
    throw new Error('DB_CONNECTION_LIMIT must be an integer between 1 and 100');
  }

  return {
    host: environment.DB_HOST ?? DEFAULTS.host,
    port,
    user: required(environment, 'DB_USER'),
    password: required(environment, 'DB_PASSWORD'),
    database: environment.DB_NAME ?? DEFAULTS.database,
    waitForConnections: true,
    connectionLimit,
    enableKeepAlive: true,
  };
}
