import { Router } from 'express';
import { HttpError } from '../lib/errors.js';
import { DUMMY_HASH, hashPassword, verifyPassword } from '../lib/password.js';
import { rateLimit } from '../lib/rateLimit.js';
import { validator } from '../lib/validate.js';
import { toUser } from '../models/users.js';
import { LIMITS, LOCALES } from '../../shared/limits.js';

const SQLITE_CONSTRAINT_UNIQUE = 2067;

// Demo login is public and creates a real session. 60 tries per 15 minutes per IP is
// enough for a class on one network to click "try the demo", not enough for a script
// to mint sessions as fast as it can connect. Only applied when the demo is enabled.
export const DEMO_LOGIN_LIMIT = 60;

export function authRoutes({ config, sessions, users, live }) {
  const router = Router();
  const limiter = rateLimit({ windowMs: 15 * 60_000, max: config.authRateLimit });
  const demoLimiter = config.allowDemo ? rateLimit({ windowMs: 15 * 60_000, max: DEMO_LOGIN_LIMIT }) : null;

  // Always 200 so the landing page can ask "who am I?" without a console error.
  // limits: upload sizes the client checks before sending (the server checks again).
  router.get('/session', (req, res) => {
    res.json({
      user: toUser(req.user),
      demo: config.allowDemo,
      google: Boolean(config.google), // is "Continue with Google" set up on this server?
      limits: { maxImageMb: config.maxUploadMb, maxVideoMb: config.maxVideoMb },
    });
  });

  router.post('/register', limiter, async (req, res) => {
    const v = validator(req.body);
    const name = v.text('name', { required: true, max: LIMITS.userName });
    const email = v.email('email');
    const password = v.password('password');
    const locale = v.oneOf('locale', LOCALES, 'vi');
    v.check();

    // Hash before answering, including when the email is already registered, so a fast
    // "no" and a slow "welcome" cannot be told apart by timing. The error code does not
    // say the address is registered either. Probing many addresses is capped by `limiter`.
    const passwordHash = await hashPassword(password);
    if (users.byEmail(email)) throw new HttpError(400, 'VALIDATION', { email: { code: 'EMAIL_UNAVAILABLE' } });

    let id;
    try {
      id = users.create({ email, name, passwordHash, locale });
    } catch (err) {
      // Two sign-ups with the same email at the same moment: the UNIQUE index catches the loser.
      if (err.errcode === SQLITE_CONSTRAINT_UNIQUE) throw new HttpError(400, 'VALIDATION', { email: { code: 'EMAIL_UNAVAILABLE' } });
      throw err;
    }
    sessions.start(res, id);
    res.status(201).json({ user: toUser(users.byId(id)) });
  });

  router.post('/login', limiter, async (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    const user = email ? users.byEmail(email) : undefined;
    // Same amount of work whether or not the email exists (no account enumeration by timing).
    // An account created with Google has no password ('') and cannot log in with one.
    const valid = await verifyPassword(password, user?.password_hash || DUMMY_HASH);
    if (!user || !user.password_hash || !valid) throw new HttpError(401, 'INVALID_CREDENTIALS');
    sessions.start(res, user.id);
    res.json({ user: toUser(user) });
  });

  router.post('/logout', (req, res) => {
    // This session's event streams stop here. sessions.end deletes the row and closes them too.
    const sessionId = req.sessionId;
    sessions.end(req, res);
    live.closeSession(sessionId);
    res.status(204).end();
  });

  // One-click demo login (seeded by `npm run seed`). Disable with ALLOW_DEMO=false.
  // { as: 'friend' } signs in as the second demo account, to see sharing from the other side.
  router.post('/demo', ...(config.allowDemo ? [demoLimiter] : []), (req, res) => {
    if (!config.allowDemo) throw new HttpError(404, 'NOT_FOUND');
    const user = users.byEmail(req.body?.as === 'friend' ? config.demoFriendEmail : config.demoEmail);
    if (!user) throw new HttpError(404, 'DEMO_MISSING');
    sessions.start(res, user.id);
    res.json({ user: toUser(user) });
  });

  return router;
}
