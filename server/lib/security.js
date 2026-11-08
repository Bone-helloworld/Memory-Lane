import { HttpError } from './errors.js';

// Content Security Policy: the page may only load code, styles, fonts and images from
// this server. Fonts are self-hosted, so no third party (not even Google) sees a visit.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data: blob:",
  // blob: lets the upload form preview a chosen video and grab its poster frame locally.
  "media-src 'self' blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export function securityHeaders(config) {
  return (req, res, next) => {
    res.set({
      'Content-Security-Policy': CSP,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      // Links to YouTube etc. never reveal which page of your album you came from.
      'Referrer-Policy': 'same-origin',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
    });
    if (config.isProd) res.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    next();
  };
}

/** Private JSON must never be stored by the browser's disk cache or any proxy in between. */
export function noStore(req, res, next) {
  res.set('Cache-Control', 'no-store');
  next();
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF protection using Fetch Metadata: browsers label every request with
 * Sec-Fetch-Site. A state-changing request that comes from another website is refused.
 * (Tools like curl/Postman send no such header and are allowed.)
 * Together with SameSite=Lax cookies this blocks cross-site form posts.
 */
export function blockCrossSiteWrites(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  const site = req.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return next(new HttpError(403, 'CROSS_SITE'));
  next();
}
