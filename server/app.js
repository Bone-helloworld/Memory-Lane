import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import compression from 'compression';
import express from 'express';
import multer from 'multer';
import { HttpError } from './lib/errors.js';
import { createFileStore } from './lib/files.js';
import { createLive } from './lib/live.js';
import { blockCrossSiteWrites, noStore, securityHeaders } from './lib/security.js';
import { createSessions, requireAuth } from './lib/sessions.js';
import { artifactsModel } from './models/artifacts.js';
import { mediaModel } from './models/media.js';
import { memoriesModel } from './models/memories.js';
import { peopleModel } from './models/people.js';
import { socialModel } from './models/social.js';
import { usersModel } from './models/users.js';
import { artifactRoutes } from './routes/artifacts.js';
import { authRoutes } from './routes/auth.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { fileRoutes } from './routes/files.js';
import { googleRoutes } from './routes/google.js';
import { inviteRoutes } from './routes/invites.js';
import { mediaRoutes } from './routes/media.js';
import { meRoutes } from './routes/me.js';
import { memoryRoutes } from './routes/memories.js';
import { peopleRoutes } from './routes/people.js';
import { searchRoutes } from './routes/search.js';
import { sharingRoutes } from './routes/sharing.js';

/**
 * Builds the Express application. It receives its database and config instead of
 * creating them, so tests can run the real app against a throw-away database.
 */
export function createApp({ db, config }) {
  const app = express();
  const live = createLive();
  const sessions = createSessions(db, config);
  sessions.attachLive(live);

  // Shared dependencies handed to every route module.
  const ctx = {
    config,
    sessions,
    files: createFileStore(config.uploadDir),
    users: usersModel(db),
    memories: memoriesModel(db),
    people: peopleModel(db),
    media: mediaModel(db),
    artifacts: artifactsModel(db),
    social: socialModel(db),
    live,
  };

  app.disable('x-powered-by');
  // Exactly one proxy hop in production — Render's load balancer, which terminates HTTPS.
  // `true` would trust the whole X-Forwarded-For chain. The visitor can prepend addresses,
  // so the login limiter would see a new IP on every attempt and never return 429.
  // The visitor address itself is chosen in lib/rateLimit.js (one hop, or Cloudflare's
  // overwritten CF-Connecting-IP when this process is actually running on Render).
  if (config.isProd) app.set('trust proxy', 1);
  app.set('client ip from cloudflare', Boolean(config.cloudflareClientIp));
  app.use(securityHeaders(config));
  // gzip text responses (JS, CSS, JSON): ~3× less to download. Never the live event stream:
  // compression would hold its small messages back in a buffer.
  app.use(compression({ filter: (req, res) => req.path !== '/api/events' && compression.filter(req, res) }));

  // ---------- JSON API ----------
  const api = express.Router();
  api.use(noStore);
  // "Is the app up, and can it read its database?" — for the hosting platform's health check and for whoever
  // looks after the server (curl …/api/health). Public, and it says nothing else.
  api.get('/health', (req, res) => {
    try {
      db.prepare('SELECT 1').get();
      res.json({ ok: true });
    } catch (err) {
      console.error(`[${new Date().toISOString()}] HEALTH database unavailable: ${err.message}`);
      res.status(503).json({ ok: false });
    }
  });
  api.use(express.json({ limit: '100kb' }));
  api.use(blockCrossSiteWrites);
  api.use(ctx.sessions.loadUser);

  api.use('/auth/google', googleRoutes(ctx)); // "Continue with Google" (full-page redirects, not JSON)
  api.use('/auth', authRoutes(ctx));
  api.use('/me', requireAuth, meRoutes(ctx));
  api.use('/dashboard', requireAuth, dashboardRoutes(ctx));
  api.use('/memories', requireAuth, memoryRoutes(ctx));
  api.use('/files', requireAuth, fileRoutes(ctx));
  api.use('/people', requireAuth, peopleRoutes(ctx));
  api.use('/media', requireAuth, mediaRoutes(ctx));
  api.use('/artifacts', requireAuth, artifactRoutes(ctx));
  api.use('/search', requireAuth, searchRoutes(ctx));
  api.use('/sharing', requireAuth, sharingRoutes(ctx));
  api.use('/invites', inviteRoutes(ctx)); // the preview of an invite is public; the rest needs a login
  // Live updates (Server-Sent Events): new notes and new shares appear without reloading.
  api.get('/events', requireAuth, (req, res) => ctx.live.connect(req, res));
  api.use((req, res) => res.status(404).json({ error: 'NOT_FOUND' }));
  app.use('/api', api);

  // ---------- The built React app (after `npm run build`) ----------
  const indexHtml = path.join(config.clientDist, 'index.html');
  if (fs.existsSync(indexHtml)) {
    // Vite puts a content hash in every asset name, so they can be cached forever.
    app.use('/assets', express.static(path.join(config.clientDist, 'assets'), { immutable: true, maxAge: '1y' }));
    app.use(express.static(config.clientDist, { index: false }));
    // Single-page app: any other GET returns index.html and React Router picks the page.
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      res.sendFile(indexHtml, { headers: { 'Cache-Control': 'no-cache' } });
    });
  }

  // ---------- Errors → JSON with a stable code ----------
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.code, ...(err.fields && { fields: err.fields }) });
    }
    if (err instanceof multer.MulterError) {
      const code = err.code === 'LIMIT_FILE_SIZE' ? 'FILE_TOO_LARGE' : 'UPLOAD_FAILED';
      return res.status(400).json({ error: 'VALIDATION', fields: { file: { code, max: config.maxVideoMb } } });
    }
    const status = err.status ?? err.statusCode;
    if (status >= 400 && status < 500) {
      // e.g. malformed JSON body (400), body too large (413), file missing on disk (404), bad Range (416)
      const code = { 400: 'BAD_REQUEST', 404: 'NOT_FOUND', 413: 'TOO_LARGE', 416: 'BAD_RANGE' }[status] ?? 'BAD_REQUEST';
      return res.status(status).json({ error: code });
    }
    // Unexpected: log it under a short reference that the person sees ("Mã lỗi: 3f9a1c2e") and can quote, so
    // whoever looks after the server finds this exact line. Long tokens in the path (invite links) are masked.
    const ref = randomBytes(4).toString('hex');
    const where = req.originalUrl.split('?')[0].replace(/[\w-]{20,}/g, '…');
    console.error(`[${new Date().toISOString()}] SERVER ${ref} ${req.method} ${where} user=${req.user?.id ?? '-'}`);
    console.error(err);
    res.status(500).json({ error: 'SERVER', ref });
  });

  return app;
}
