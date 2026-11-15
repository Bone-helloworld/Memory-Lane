/** Pool settings for Azure SQL. The free serverless tier may sleep; the connect timeout covers the wake-up. */
export function mssqlConfig(config) {
  const base = {
    connectionTimeout: 60_000,
    requestTimeout: 30_000,
    pool: { min: 0, max: 5, idleTimeoutMillis: 30_000 },
    options: {
      encrypt: true,
      trustServerCertificate: Boolean(config.trustServerCertificate),
      enableArithAbort: true,
    },
  };
  if (config.connectionString) return { ...base, connectionString: config.connectionString };
  return {
    ...base,
    server: config.server,
    port: Number(config.port) || 1433,
    database: config.database,
    user: config.user,
    password: config.password,
  };
}

/** Drop a password if a driver error repeats the connection string. */
export function redactSecret(message, secret) {
  const text = String(message ?? '');
  if (!secret || !text.includes(secret)) return text;
  return text.split(secret).join('***');
}
