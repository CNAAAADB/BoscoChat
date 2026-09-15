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

function sslConfig(environment) {
  const mode = (environment.DB_SSL_MODE ?? 'disable').toLowerCase();
  if (!['disable', 'require'].includes(mode)) {
    throw new Error('DB_SSL_MODE must be either disable or require');
  }
  if (mode === 'disable') return undefined;

  const ssl = { rejectUnauthorized: true };
  if (environment.DB_SSL_CA_BASE64) {
    try {
      ssl.ca = Buffer.from(environment.DB_SSL_CA_BASE64, 'base64').toString('utf8');
    } catch {
      throw new Error('DB_SSL_CA_BASE64 must contain a valid base64-encoded CA bundle');
    }
  }
  return ssl;
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
    ...(sslConfig(environment) ? { ssl: sslConfig(environment) } : {}),
  };
}
