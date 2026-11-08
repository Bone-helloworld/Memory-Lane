import { createHash, randomBytes } from 'node:crypto';

// "Continue with Google" with the OAuth 2.0 authorization-code flow (OpenID Connect):
//   1. /api/auth/google/start sends the browser to Google with a random state, nonce and PKCE challenge;
//   2. Google sends it back to /api/auth/google/callback with a one-time code;
//   3. the server trades that code for an ID token (server to server, with the client secret)
//      and reads who signed in from it.
// No Google script ever runs on our pages: the browser only visits accounts.google.com.

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

const random = (bytes) => randomBytes(bytes).toString('base64url');

/**
 * The secrets of one sign-in attempt, kept in a short-lived httpOnly cookie:
 *   state    — the callback must bring it back: stops forged callbacks (login CSRF);
 *   nonce    — Google copies it into the ID token: stops a replayed token;
 *   verifier — PKCE: Google only hands out the token to whoever knows it, so a stolen code is useless.
 */
export function newAttempt() {
  const verifier = random(32);
  return {
    state: random(24),
    nonce: random(24),
    verifier,
    challenge: createHash('sha256').update(verifier).digest('base64url'),
  };
}

/** Where to send the browser: Google's account chooser for our app. */
export function authorizationUrl(google, { redirectUri, state, nonce, challenge }) {
  const url = new URL(google.authUrl ?? AUTH_URL);
  url.search = new URLSearchParams({
    client_id: google.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();
  return url.toString();
}

function readIdToken(idToken) {
  const parts = String(idToken ?? '').split('.');
  if (parts.length !== 3) throw new Error('no ID token');
  return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
}

/**
 * Trades the one-time code for Google's ID token and checks it → { sub, email, name }.
 * The token arrives straight from Google's token endpoint over HTTPS, in answer to a request
 * signed with our client secret, so — as OpenID Connect Core §3.1.3.7 allows — its signature is
 * not checked again here. Every claim that matters is.
 */
export async function exchangeCode(google, { code, redirectUri, verifier, nonce }) {
  const response = await fetch(google.tokenUrl ?? TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: google.clientId,
      client_secret: google.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`token endpoint answered ${response.status}`);
  const claims = readIdToken((await response.json()).id_token);

  if (!ISSUERS.has(claims.iss)) throw new Error('wrong issuer');
  if (claims.aud !== google.clientId) throw new Error('token is for another app');
  if (!(Number(claims.exp) * 1000 > Date.now())) throw new Error('token expired');
  if (claims.nonce !== nonce) throw new Error('nonce mismatch');
  if (!claims.sub || !claims.email) throw new Error('no account id or email');
  // An unverified address could belong to someone else.
  if (claims.email_verified !== true && claims.email_verified !== 'true') throw new Error('email not verified');

  return { sub: String(claims.sub), email: String(claims.email).toLowerCase(), name: claims.name ? String(claims.name) : '' };
}
