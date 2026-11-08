import { Router } from 'express';
import { authorizationUrl, exchangeCode, newAttempt } from '../lib/google.js';
import { rateLimit } from '../lib/rateLimit.js';
import { readCookie } from '../lib/sessions.js';
import { LIMITS, LOCALES } from '../../shared/limits.js';

const COOKIE = 'ml_google';
const COOKIE_PATH = '/api/auth/google';

/** Only a path inside the app, so ?next= can never send someone to another site (open redirect). */
function safeNext(value) {
  const next = String(value ?? '');
  return /^\/(?![/\\])/.test(next) && !next.startsWith('/api/') && next.length <= 200 ? next : null;
}

/**
 * "Continue with Google" — see server/lib/google.js for the flow.
 *   GET /start?mode=login|link&next=/join/…&locale=vi → 303 to Google
 *   GET /callback?code&state                           → 303 back into the app, signed in
 * Problems come back as ?google=CODE on /login (or /settings when linking), never as JSON:
 * these are full-page visits, not fetch() calls.
 *
 * An existing Memory Lane account is never merged with a Google account just because the
 * emails match: someone could have registered your address before you (account pre-hijacking).
 * Instead the owner logs in with their password and links Google from Settings.
 */
export function googleRoutes({ config, sessions, users }) {
  const router = Router();
  // Same budget as password logins (AUTH_RATE_LIMIT); one Google sign-in is two requests: start + callback.
  const limiter = rateLimit({ windowMs: 15 * 60_000, max: config.authRateLimit * 2 });
  const cookieOptions = { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, path: COOKIE_PATH };

  // Must match one of the "Authorized redirect URIs" of the Google Cloud OAuth client exactly.
  const redirectUri = (req) => `${config.publicUrl ?? `${req.protocol}://${req.get('host')}`}${COOKIE_PATH}/callback`;
  // Back into the app with the outcome (?google=CODE). On the login page also keep where the person was going (an invite
  // link…): if Google did not work out, signing in with a password still brings them back there.
  const back = (res, path, code, next = null) =>
    res.redirect(303, `${path}?google=${code}${next ? `&next=${encodeURIComponent(next)}` : ''}`);

  router.get('/start', limiter, (req, res) => {
    const mode = req.query.mode === 'link' ? 'link' : 'login';
    if (!config.google) {
      return mode === 'link' ? back(res, '/settings', 'NOT_CONFIGURED') : back(res, '/login', 'NOT_CONFIGURED', safeNext(req.query.next));
    }
    if (mode === 'link' && !req.user) return back(res, '/login', 'LOGIN_FIRST');

    const attempt = newAttempt();
    const saved = {
      state: attempt.state,
      nonce: attempt.nonce,
      verifier: attempt.verifier,
      mode,
      userId: req.user?.id ?? null,
      next: safeNext(req.query.next),
      locale: LOCALES.includes(req.query.locale) ? req.query.locale : 'vi',
    };
    res.cookie(COOKIE, JSON.stringify(saved), { ...cookieOptions, maxAge: 10 * 60_000 });
    res.redirect(303, authorizationUrl(config.google, { redirectUri: redirectUri(req), ...attempt }));
  });

  router.get('/callback', limiter, async (req, res) => {
    let saved = null;
    try {
      saved = JSON.parse(readCookie(req, COOKIE) ?? 'null');
    } catch {
      // a damaged cookie is the same as no cookie
    }
    res.clearCookie(COOKIE, cookieOptions); // one attempt, one use
    const failPage = saved?.mode === 'link' ? '/settings' : '/login';
    const failNext = saved?.mode === 'link' ? null : (saved?.next ?? null);

    if (!config.google) return back(res, failPage, 'NOT_CONFIGURED', failNext);
    // No attempt started in this browser, or a different one: refuse (forged callback).
    if (!saved || typeof req.query.state !== 'string' || req.query.state !== saved.state) return back(res, failPage, 'FAILED', failNext);
    if (req.query.error) return back(res, failPage, 'CANCELLED', failNext); // "Cancel" on Google's page

    let profile;
    try {
      profile = await exchangeCode(config.google, {
        code: String(req.query.code ?? ''),
        redirectUri: redirectUri(req),
        verifier: saved.verifier,
        nonce: saved.nonce,
      });
    } catch (err) {
      console.warn(`Google sign-in failed: ${err.message}`);
      return back(res, failPage, 'FAILED', failNext);
    }

    const owner = users.byGoogleSub(profile.sub);

    if (saved.mode === 'link') {
      // The person who started linking must still be the one signed in.
      if (!req.user || req.user.id !== saved.userId) return back(res, '/login', 'LOGIN_FIRST');
      if (owner && owner.id !== req.user.id) return back(res, '/settings', 'TAKEN');
      users.linkGoogle(req.user.id, profile);
      return back(res, '/settings', 'LINKED');
    }

    let user = owner;
    if (!user) {
      if (users.byEmail(profile.email)) return back(res, '/login', 'EMAIL_TAKEN', failNext);
      const name = (profile.name || profile.email.split('@')[0]).slice(0, LIMITS.userName);
      user = users.byId(users.create({ email: profile.email, name, passwordHash: '', locale: saved.locale, google: profile }));
    }
    sessions.start(res, user.id);
    res.redirect(303, saved.next ?? '/today');
  });

  return router;
}
