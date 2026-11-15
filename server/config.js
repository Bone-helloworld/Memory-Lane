import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Load .env if present (built into Node — no dotenv package needed).
try {
  process.loadEnvFile(path.join(ROOT, '.env'));
} catch {
  // .env is optional; defaults below are fine for local development.
}

/**
 * Azure SQL when the connection settings are present, otherwise null (SQLite).
 * A connection string wins when both styles are set. A half-set group is a mistake:
 * falling back to a local file on App Service would look healthy and then lose every write.
 */
export function readAzureSql(env) {
  const connectionString = text(env.AZURE_SQL_CONNECTION_STRING);
  const server = text(env.AZURE_SQL_SERVER);
  const database = text(env.AZURE_SQL_DATABASE);
  const user = text(env.AZURE_SQL_USER);
  const password = typeof env.AZURE_SQL_PASSWORD === 'string' ? env.AZURE_SQL_PASSWORD : '';
  const trustServerCertificate = env.AZURE_SQL_TRUST_SERVER_CERTIFICATE === 'true';
  const anyPart = server || database || user || password !== '';
  if (!connectionString && !anyPart) return null;
  if (connectionString) return { connectionString, trustServerCertificate };
  if (!server || !database || !user || password === '') {
    throw new Error(
      'Azure SQL is only partly configured. Set AZURE_SQL_CONNECTION_STRING, or all of AZURE_SQL_SERVER, AZURE_SQL_DATABASE, AZURE_SQL_USER and AZURE_SQL_PASSWORD.',
    );
  }
  return { server, database, user, password, trustServerCertificate };
}

/**
 * Azure Blob when storage settings are present, otherwise null (DATA_DIR/uploads).
 * The container stays private. A connection string wins when both styles are set.
 */
export function readAzureStorage(env) {
  const connectionString = text(env.AZURE_STORAGE_CONNECTION_STRING);
  const account = text(env.AZURE_STORAGE_ACCOUNT) || text(env.AZURE_STORAGE_ACCOUNT_NAME);
  const keySource = env.AZURE_STORAGE_KEY ?? env.AZURE_STORAGE_ACCOUNT_KEY;
  const key = typeof keySource === 'string' ? keySource : '';
  const container = text(env.AZURE_STORAGE_CONTAINER) || 'media';
  if (!connectionString && !account && key === '') return null;
  if (connectionString) return { connectionString, container };
  if (!account || key === '') {
    throw new Error(
      'Azure Storage is only partly configured. Set AZURE_STORAGE_CONNECTION_STRING, or both AZURE_STORAGE_ACCOUNT and AZURE_STORAGE_KEY.',
    );
  }
  return { account, key, container };
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function loadConfig(env = process.env) {
  const dataDir = path.resolve(ROOT, env.DATA_DIR || 'data');
  const isProd = env.NODE_ENV === 'production';
  const azureSql = readAzureSql(env);
  const azureStorage = readAzureStorage(env);
  return {
    port: Number(env.PORT) || 3001,
    isProd,
    cookieSecure: isProd,
    allowDemo: (env.ALLOW_DEMO ?? 'true') === 'true',
    demoEmail: 'demo@memorylane.local',
    demoFriendEmail: 'thuha@memorylane.local',
    sessionDays: Number(env.SESSION_DAYS) || 30,
    // Largest photo and largest video accepted, in megabytes.
    maxUploadMb: Number(env.MAX_UPLOAD_MB) || 15,
    maxVideoMb: Number(env.MAX_VIDEO_MB) || 100,
    // Total space for one account's photos and videos, in megabytes.
    storageMb: Number(env.STORAGE_MB) || 2048,
    // How long an invite link stays valid.
    inviteDays: Number(env.INVITE_DAYS) || 7,
    // Login/register attempts allowed per IP in each 15-minute window.
    authRateLimit: Number(env.AUTH_RATE_LIMIT) || 20,
    // Contact-form submissions allowed per IP in each 15-minute window.
    contactRateLimit: Number(env.CONTACT_RATE_LIMIT) || 8,
    // Render sets RENDER=true. Its edge is Cloudflare, which overwrites CF-Connecting-IP
    // with the visitor address — a client cannot choose that value. Azure App Service has no
    // Cloudflare in front, so that header is ignored there and the visitor is the address
    // App Service appended to X-Forwarded-For.
    cloudflareClientIp: env.RENDER === 'true',
    // "Continue with Google": both values come from an OAuth client in Google Cloud Console
    // (see docs/DEPLOY.md). Without them the Google button is shown but disabled.
    google:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
        : null,
    // The address people type to reach the app, e.g. https://memorylane.example.com — used to build
    // Google's redirect URI. Optional: by default it is taken from the request (fine locally).
    publicUrl: env.PUBLIC_URL ? env.PUBLIC_URL.replace(/\/+$/, '') : null,
    dataDir,
    dbFile: path.join(dataDir, 'memorylane.db'),
    uploadDir: path.join(dataDir, 'uploads'),
    azureSql,
    azureStorage,
    clientDist: path.join(ROOT, 'client', 'dist'),
  };
}
