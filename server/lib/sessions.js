import { createHash, randomBytes } from 'node:crypto';
import { HttpError } from './errors.js';

const COOKIE = 'ml_session';

// Only a SHA-256 of the token is stored, so a leaked database cannot be used to log in.
const hashToken = (token) => createHash('sha256').update(token).digest('hex');

export function readCookie(req, name) {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index > -1 && part.slice(0, index).trim() === name) {
      try {
        return decodeURIComponent(part.slice(index + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Server-side sessions in SQLite: the browser holds a random token in an httpOnly cookie
 * (JavaScript cannot read it), the database maps its hash to a user and an expiry date.
 * Logging out deletes the row, so the session is revoked immediately — unlike a plain JWT.
 */
export function createSessions(db, config) {
  const maxAgeMs = config.sessionDays * 86_400_000;
  const insert = db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)');
  const remove = db.prepare('DELETE FROM sessions WHERE token_hash = ?');
  // req.user never carries the password hash — only whether the account has a password.
  const lookup = db.prepare(`
    SELECT u.id, u.email, u.name, u.locale, u.created_at, u.password_hash <> '' AS has_password, u.google_email
      FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`);

  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString());

  return {
    start(res, userId) {
      const token = randomBytes(32).toString('base64url');
      insert.run(hashToken(token), userId, new Date(Date.now() + maxAgeMs).toISOString());
      res.cookie(COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.cookieSecure,
        maxAge: maxAgeMs,
        path: '/',
      });
    },

    end(req, res) {
      const token = readCookie(req, COOKIE);
      if (token) remove.run(hashToken(token));
      res.clearCookie(COOKIE, { path: '/', httpOnly: true, sameSite: 'lax', secure: config.cookieSecure });
    },

    /** Log a user out everywhere (used after a password change). */
    revokeAll(userId) {
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    },

    /** Middleware: sets req.user to the logged-in user or null. */
    loadUser(req, res, next) {
      const token = readCookie(req, COOKIE);
      req.user = token ? (lookup.get(hashToken(token), new Date().toISOString()) ?? null) : null;
      next();
    },
  };
}

export function requireAuth(req, res, next) {
  if (!req.user) return next(new HttpError(401, 'UNAUTHORIZED'));
  next();
}
