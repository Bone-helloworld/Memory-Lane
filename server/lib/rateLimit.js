import { isIP } from 'node:net';
import { HttpError } from './errors.js';

/**
 * Fixed-window, in-memory rate limiter keyed by client IP.
 * Good enough for one server process; use Redis or the host's limiter when scaling out.
 *
 * The key must be the visitor, not an address the visitor chose. See clientAddress.
 */
export function rateLimit({ windowMs, max }) {
  const hits = new Map(); // ip → { count, resetAt }

  function limiter(req, res, next) {
    const now = Date.now();
    const ip = clientAddress(req);
    let entry = hits.get(ip);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(ip, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return next(new HttpError(429, 'RATE_LIMITED'));
    }
    next();
  }

  limiter.reset = (req) => hits.delete(clientAddress(req));

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of hits) if (entry.resetAt <= now) hits.delete(ip);
  }, windowMs);
  sweep.unref();

  return limiter;
}

/**
 * IP the limiter counts.
 *
 * With no trusted proxy (local dev and tests) the TCP peer is the client. Forwarded
 * headers are ignored, so sending a fresh X-Forwarded-For or CF-Connecting-IP cannot
 * open a new bucket.
 *
 * In production the app trusts exactly one proxy hop (`trust proxy` = 1). Express's
 * req.ip is then the address that hop appended — the rightmost X-Forwarded-For entry —
 * never the leftmost one, which the client can set.
 *
 * Azure App Service is that one hop and does not put Cloudflare in front. The rightmost
 * address is the visitor (sometimes written as IPv4:port; the port is not part of the key).
 * A forged CF-Connecting-IP is ignored, because App Service would forward whatever the
 * client sent.
 *
 * On Render that rightmost address is often a Cloudflare edge machine and changes between
 * attempts, so twenty bad logins never share a bucket. Render's edge overwrites
 * CF-Connecting-IP with the visitor address; we use that only when the process is actually
 * on Render (`RENDER=true`), because any other proxy would forward a value the client invented.
 */
export function clientAddress(req) {
  const peer = oneIp(req.socket?.remoteAddress) || 'unknown';
  const hops = trustedHops(req);
  if (hops < 1) return peer;

  if (req.app?.get('client ip from cloudflare')) {
    const visitor = oneIp(req.headers['cf-connecting-ip']);
    if (visitor) return visitor;
  }
  // req.ip already applies the hop count. A non-IP (a forged token) is not a key:
  // otherwise each attempt could send a new string and never be limited. Fall back
  // to the peer, which groups those attempts together.
  return oneIp(req.ip) || peer;
}

function trustedHops(req) {
  const trust = req.app?.get?.('trust proxy');
  // `true` means "trust every hop", which selects the client-supplied leftmost address.
  return typeof trust === 'number' && trust >= 1 ? trust : 0;
}

/** A single IP, or '' when the value is a list or not an address. */
function oneIp(value) {
  if (Array.isArray(value)) {
    if (value.length !== 1) return '';
    value = value[0];
  }
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes(',')) return '';
  const withoutPort = stripPort(trimmed);
  const stripped = withoutPort.toLowerCase().startsWith('::ffff:') ? withoutPort.slice(7) : withoutPort;
  if (isIP(stripped) === 0) return '';
  return stripped.toLowerCase();
}

/** App Service has been seen to append the source port (`203.0.113.10:54421`). The port is not a different visitor. */
function stripPort(value) {
  const v4 = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(value);
  if (v4) return v4[1];
  const v6 = /^\[([^\]]+)\]:\d+$/.exec(value);
  if (v6) return v6[1];
  return value;
}
