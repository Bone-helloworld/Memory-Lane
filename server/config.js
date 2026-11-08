import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Load .env if present (built into Node — no dotenv package needed).
try {
  process.loadEnvFile(path.join(ROOT, '.env'));
} catch {
  // .env is optional; defaults below are fine for local development.
}

export function loadConfig(env = process.env) {
  const dataDir = path.resolve(ROOT, env.DATA_DIR || 'data');
  const isProd = env.NODE_ENV === 'production';
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
    clientDist: path.join(ROOT, 'client', 'dist'),
  };
}
