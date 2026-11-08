import { HttpError } from './errors.js';

/**
 * Fixed-window, in-memory rate limiter keyed by client IP.
 * Good enough for one server process; use Redis or the host's limiter when scaling out.
 */
export function rateLimit({ windowMs, max }) {
  const hits = new Map(); // ip → { count, resetAt }

  function limiter(req, res, next) {
    const now = Date.now();
    let entry = hits.get(req.ip);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(req.ip, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return next(new HttpError(429, 'RATE_LIMITED'));
    }
    next();
  }

  limiter.reset = (req) => hits.delete(req.ip);

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of hits) if (entry.resetAt <= now) hits.delete(ip);
  }, windowMs);
  sweep.unref();

  return limiter;
}
