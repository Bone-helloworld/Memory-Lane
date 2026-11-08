// "Continue with Google", end to end — against a fake Google. The real app talks to a tiny local
// server that plays Google's token endpoint (and checks PKCE and the client secret like Google
// does), so the whole flow is tested without a Google account or the Internet.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { openDb } from '../server/db.js';
import { isGoogleClientId, setEnvValue } from '../server/lib/envfile.js';

const CLIENT_ID = 'test-client.apps.googleusercontent.com';
const CLIENT_SECRET = 'test-secret';

let tmp;
let app;
let base;
let google;
let googleBase;
let lastTokenRequest = null;
const issued = new Map(); // one-time code → what "Google" knows about that sign-in
let codeCount = 0;

const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const idToken = (claims) => `${part({ alg: 'RS256' })}.${part(claims)}.signature`;

before(async () => {
  google = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const form = new URLSearchParams(body);
    lastTokenRequest = Object.fromEntries(form);
    const pending = issued.get(form.get('code'));
    issued.delete(form.get('code')); // codes work once
    const challenge = createHash('sha256').update(form.get('code_verifier') ?? '').digest('base64url');
    if (req.url !== '/token' || !pending || challenge !== pending.challenge || form.get('client_secret') !== CLIENT_SECRET) {
      res.writeHead(400, { 'content-type': 'application/json' }).end('{"error":"invalid_grant"}');
      return;
    }
    const claims = {
      iss: 'https://accounts.google.com',
      aud: CLIENT_ID,
      exp: Math.floor(Date.now() / 1000) + 600,
      nonce: pending.nonce,
      email_verified: true,
      ...pending.person,
    };
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ id_token: idToken(claims) }));
  }).listen(0);
  await once(google, 'listening');
  googleBase = `http://127.0.0.1:${google.address().port}`;

  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'memorylane-google-'));
  const config = {
    ...loadConfig({ DATA_DIR: tmp, AUTH_RATE_LIMIT: '1000' }),
    clientDist: path.join(tmp, 'no-client-build'),
    google: { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, authUrl: `${googleBase}/auth`, tokenUrl: `${googleBase}/token` },
  };
  app = createApp({ db: openDb(config.dbFile), config }).listen(0);
  await once(app, 'listening');
  base = `http://127.0.0.1:${app.address().port}`;
});

after(() => {
  app?.close();
  google?.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** A browser: follows nothing by itself (we look at each redirect) and keeps every cookie. */
function browser() {
  const jar = new Map();
  async function call(method, url, json) {
    const headers = {};
    if (jar.size) headers.cookie = [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
    if (json !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(base + url, { method, headers, redirect: 'manual', body: json === undefined ? undefined : JSON.stringify(json) });
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attributes] = line.split(';');
      const index = pair.indexOf('=');
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1);
      const expired = !value || attributes.some((a) => /^\s*expires=Thu, 01 Jan 1970/i.test(a) || /^\s*max-age=0/i.test(a));
      if (expired) jar.delete(name);
      else jar.set(name, value);
    }
    const type = res.headers.get('content-type') ?? '';
    return { status: res.status, location: res.headers.get('location'), body: type.includes('json') ? await res.json() : null };
  }
  return {
    get: (url) => call('GET', url),
    post: (url, json) => call('POST', url, json),
    del: (url, json) => call('DELETE', url, json),
    jar,
  };
}

/**
 * The whole dance: start → (the person picks an account at "Google") → callback.
 * `person` is what Google says about them; `claims` can override the token to test refusals.
 */
async function signInWithGoogle(b, person, { query = {} } = {}) {
  const start = await b.get(`/api/auth/google/start?${new URLSearchParams(query)}`);
  assert.equal(start.status, 303);
  const url = new URL(start.location);
  assert.equal(`${url.origin}${url.pathname}`, `${googleBase}/auth`);
  const code = `code-${++codeCount}`;
  issued.set(code, { challenge: url.searchParams.get('code_challenge'), nonce: url.searchParams.get('nonce'), person });
  const callback = await b.get(`/api/auth/google/callback?code=${code}&state=${url.searchParams.get('state')}`);
  return { url, callback };
}

describe('continue with Google', () => {
  test('a new person signs up with Google and lands where they were going', async () => {
    const b = browser();
    const { url, callback } = await signInWithGoogle(b, { sub: 'g-mai', email: 'Mai@Gmail.com', name: 'Mai Anh' }, {
      query: { next: '/join/abc123', locale: 'en' },
    });

    // What we asked Google for: the code flow, our id, PKCE S256, and only who you are.
    assert.equal(url.searchParams.get('client_id'), CLIENT_ID);
    assert.equal(url.searchParams.get('response_type'), 'code');
    assert.equal(url.searchParams.get('scope'), 'openid email profile');
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(url.searchParams.get('redirect_uri'), `${base}/api/auth/google/callback`);
    // The token request: the same redirect URI, our secret, the PKCE verifier.
    assert.equal(lastTokenRequest.redirect_uri, `${base}/api/auth/google/callback`);
    assert.equal(lastTokenRequest.grant_type, 'authorization_code');

    assert.equal(callback.status, 303);
    assert.equal(callback.location, '/join/abc123');
    assert.ok(b.jar.has('ml_session'), 'signed in');
    assert.ok(!b.jar.has('ml_google'), 'the attempt cookie is used up');

    const { user, google } = (await b.get('/api/auth/session')).body;
    assert.equal(google, true);
    assert.equal(user.email, 'mai@gmail.com');
    assert.equal(user.name, 'Mai Anh');
    assert.equal(user.locale, 'en');
    assert.equal(user.hasPassword, false);
    assert.deepEqual(user.google, { email: 'mai@gmail.com' });
  });

  test('the next sign-in finds the same account by its Google id, even if the email changed', async () => {
    const first = browser();
    await signInWithGoogle(first, { sub: 'g-khoa', email: 'khoa@gmail.com', name: 'Khoa' });
    const id = (await first.get('/api/auth/session')).body.user.id;

    const later = browser();
    const { callback } = await signInWithGoogle(later, { sub: 'g-khoa', email: 'khoa.nguyen@gmail.com', name: 'Khoa' });
    assert.equal(callback.location, '/today');
    assert.equal((await later.get('/api/auth/session')).body.user.id, id);
  });

  test('forged, replayed, cancelled or untrustworthy callbacks are refused', async () => {
    const b = browser();
    // No attempt was started in this browser.
    assert.equal((await b.get('/api/auth/google/callback?code=x&state=y')).location, '/login?google=FAILED');

    // Started, but the state does not match.
    const start = new URL((await b.get('/api/auth/google/start')).location);
    issued.set('code-forged', { challenge: start.searchParams.get('code_challenge'), nonce: start.searchParams.get('nonce'), person: { sub: 'x', email: 'x@gmail.com' } });
    assert.equal((await b.get('/api/auth/google/callback?code=code-forged&state=wrong')).location, '/login?google=FAILED');
    // The attempt cookie is gone after one callback, so the right state no longer works either.
    assert.equal((await b.get(`/api/auth/google/callback?code=code-forged&state=${start.searchParams.get('state')}`)).location, '/login?google=FAILED');

    // "Cancel" on Google's page.
    const cancel = new URL((await b.get('/api/auth/google/start')).location);
    assert.equal((await b.get(`/api/auth/google/callback?error=access_denied&state=${cancel.searchParams.get('state')}`)).location, '/login?google=CANCELLED');

    // Tokens that must not be trusted: unverified email, another app's token, expired, replayed nonce.
    for (const person of [
      { sub: 'u1', email: 'u1@gmail.com', email_verified: false },
      { sub: 'u2', email: 'u2@gmail.com', aud: 'someone-else' },
      { sub: 'u3', email: 'u3@gmail.com', exp: Math.floor(Date.now() / 1000) - 60 },
      { sub: 'u4', email: 'u4@gmail.com', nonce: 'replayed' },
      { sub: 'u5', email: 'u5@gmail.com', iss: 'https://evil.example' },
    ]) {
      const { callback } = await signInWithGoogle(browser(), person);
      assert.equal(callback.location, '/login?google=FAILED', JSON.stringify(person));
    }
    assert.ok(!b.jar.has('ml_session'));
  });

  test('from an invite link: sign up with Google, come back to the invite, accept it, open the shared memory', async () => {
    // An (an email account) invites someone to one memory.
    const an = browser();
    assert.equal((await an.post('/api/auth/register', { name: 'An', email: 'an.invites@example.com', password: 'correct horse battery', locale: 'vi' })).status, 201);
    const memory = (await an.post('/api/memories', { title: 'Biển Vũng Tàu', year: 2019 })).body.memory;
    const { token } = (await an.post('/api/invites', { memoryId: memory.id })).body;

    // Someone new opens the link, signed out: they see who invites them, and pick "Continue with Google" there.
    const guest = browser();
    assert.equal((await guest.get(`/api/invites/preview/${token}`)).body.invite.inviter.name, 'An');
    const { callback } = await signInWithGoogle(guest, { sub: 'g-binh', email: 'binh@gmail.com', name: 'Bình' }, {
      query: { next: `/join/${token}` },
    });
    assert.equal(callback.location, `/join/${token}`, 'back on the invite, with a brand-new account');
    assert.equal((await guest.get('/api/auth/session')).body.user.name, 'Bình');

    // One click on "Accept": connected to An, and the memory is shared with them.
    const accepted = await guest.post(`/api/invites/accept/${token}`);
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.memoryId, memory.id);
    const opened = await guest.get(`/api/memories/${memory.id}`);
    assert.equal(opened.status, 200);
    assert.equal(opened.body.memory.title, 'Biển Vũng Tàu');
    assert.equal(opened.body.memory.access, 'shared');
    assert.ok((await an.get('/api/sharing')).body.circle.some((person) => person.name === 'Bình'), 'An sees them in the circle');
    assert.equal((await browser().post(`/api/invites/accept/${token}`)).status, 401, 'accepting needs an account');
  });

  test('when Google does not work out, the login page still knows the way back to the invite', async () => {
    const next = '/join/an-invite-token-1234567890abcdef';
    const back = (code) => `/login?google=${code}&next=${encodeURIComponent(next)}`;

    const cancelled = browser();
    const attempt = new URL((await cancelled.get(`/api/auth/google/start?next=${encodeURIComponent(next)}`)).location);
    const cancel = await cancelled.get(`/api/auth/google/callback?error=access_denied&state=${attempt.searchParams.get('state')}`);
    assert.equal(cancel.location, back('CANCELLED'));

    // The address already belongs to a password account: log in with the password there — and land on the invite.
    await browser().post('/api/auth/register', { name: 'Hoa', email: 'hoa.invites@gmail.com', password: 'correct horse battery', locale: 'vi' });
    const { callback } = await signInWithGoogle(browser(), { sub: 'g-hoa', email: 'hoa.invites@gmail.com' }, { query: { next } });
    assert.equal(callback.location, back('EMAIL_TAKEN'));
  });

  test('?next= can only lead inside the app', async () => {
    for (const next of ['https://evil.example/', '//evil.example', '/\\evil.example', '/api/me/export']) {
      const { callback } = await signInWithGoogle(browser(), { sub: `n-${next}`, email: `n${codeCount}@gmail.com` }, { query: { next } });
      assert.equal(callback.location, '/today', next);
    }
  });

  test('an existing account is never merged by email — its owner links Google from Settings', async () => {
    // Someone registered this address with a password (maybe the owner, maybe not).
    const owner = browser();
    await owner.post('/api/auth/register', { name: 'Lan', email: 'lan@gmail.com', password: 'correct horse battery', locale: 'vi' });
    const { callback } = await signInWithGoogle(browser(), { sub: 'g-lan', email: 'lan@gmail.com', name: 'Lan' });
    assert.equal(callback.location, '/login?google=EMAIL_TAKEN');

    // Linking needs the account to be signed in…
    assert.equal((await browser().get('/api/auth/google/start?mode=link')).location, '/login?google=LOGIN_FIRST');
    // …then it works, and from now on Google opens this account.
    const linked = await signInWithGoogle(owner, { sub: 'g-lan', email: 'lan@gmail.com', name: 'Lan' }, { query: { mode: 'link' } });
    assert.equal(linked.callback.location, '/settings?google=LINKED');
    assert.deepEqual((await owner.get('/api/auth/session')).body.user.google, { email: 'lan@gmail.com' });
    const viaGoogle = browser();
    await signInWithGoogle(viaGoogle, { sub: 'g-lan', email: 'lan@gmail.com' });
    assert.equal((await viaGoogle.get('/api/auth/session')).body.user.email, 'lan@gmail.com');

    // A Google account already linked to someone else cannot be linked a second time.
    const other = browser();
    await other.post('/api/auth/register', { name: 'Other', email: 'other@example.com', password: 'correct horse battery', locale: 'vi' });
    const taken = await signInWithGoogle(other, { sub: 'g-lan', email: 'lan@gmail.com' }, { query: { mode: 'link' } });
    assert.equal(taken.callback.location, '/settings?google=TAKEN');
  });

  test('a Google-only account: no password login, a first password without the old one, unlink only with a password', async () => {
    const b = browser();
    await signInWithGoogle(b, { sub: 'g-tuan', email: 'tuan@gmail.com', name: 'Tuấn' });

    // There is no password to guess — and the answer is the same as for a wrong one.
    const login = await browser().post('/api/auth/login', { email: 'tuan@gmail.com', password: '' });
    assert.equal(login.status, 401);
    assert.equal(login.body.error, 'INVALID_CREDENTIALS');

    assert.equal((await b.del('/api/me/google')).body.error, 'NEEDS_PASSWORD', 'unlinking would lock the account');
    assert.equal((await b.post('/api/me/password', { newPassword: 'a brand new passphrase' })).status, 204);
    assert.equal((await browser().post('/api/auth/login', { email: 'tuan@gmail.com', password: 'a brand new passphrase' })).status, 200);

    // Now the current password is required to change it again.
    const again = await b.post('/api/me/password', { newPassword: 'another passphrase' });
    assert.equal(again.body.fields.currentPassword.code, 'WRONG_PASSWORD');

    const unlinked = await b.del('/api/me/google');
    assert.equal(unlinked.status, 200);
    assert.equal(unlinked.body.user.google, null);
    assert.equal(unlinked.body.user.hasPassword, true);
  });

  test('without GOOGLE_CLIENT_ID the button is off and /start says so', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memorylane-nogoogle-'));
    const config = { ...loadConfig({ DATA_DIR: dir }), clientDist: path.join(dir, 'none') };
    const plain = createApp({ db: openDb(config.dbFile), config }).listen(0);
    await once(plain, 'listening');
    try {
      const url = `http://127.0.0.1:${plain.address().port}`;
      assert.equal((await (await fetch(`${url}/api/auth/session`)).json()).google, false);
      const start = await fetch(`${url}/api/auth/google/start`, { redirect: 'manual' });
      assert.equal(start.headers.get('location'), '/login?google=NOT_CONFIGURED');
    } finally {
      plain.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

test('npm run dev: Vite keeps the address of the page, so Google is asked to come back to localhost:5173', async () => {
  // With Vite's short form ('/api': 'http://localhost:3001') the Host header becomes localhost:3001, and the redirect_uri
  // no longer matches the one registered in Google Cloud for development (redirect_uri_mismatch).
  const { default: viteConfig } = await import('../vite.config.js');
  assert.equal(viteConfig.server.proxy['/api'].changeOrigin, false);
  // …and never quietly another port: a second `npm run dev` on 5174 cannot sign in with Google.
  assert.equal(viteConfig.server.port, 5173);
  assert.equal(viteConfig.server.strictPort, true);
});

describe('npm run setup:google (writes your OAuth client into .env)', () => {
  const script = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'server', 'setup-google.js');
  const run = (envFile, answers) =>
    spawnSync(process.execPath, [script], { input: answers, encoding: 'utf8', env: { ...process.env, ENV_FILE: envFile } });

  test('setEnvValue fills the commented example, replaces an old value, or appends — nothing else changes', () => {
    const example = 'PORT=3001\n# GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com\n# GOOGLE_CLIENT_SECRET=\n';
    const filled = setEnvValue(setEnvValue(example, 'GOOGLE_CLIENT_ID', CLIENT_ID), 'GOOGLE_CLIENT_SECRET', 'GOCSPX-$1&x');
    assert.equal(filled, `PORT=3001\nGOOGLE_CLIENT_ID=${CLIENT_ID}\nGOOGLE_CLIENT_SECRET=GOCSPX-$1&x\n`);
    assert.equal(setEnvValue(filled, 'GOOGLE_CLIENT_SECRET', 'new').split('\n')[2], 'GOOGLE_CLIENT_SECRET=new');
    assert.equal(setEnvValue('PORT=3001', 'GOOGLE_CLIENT_ID', 'a'), 'PORT=3001\nGOOGLE_CLIENT_ID=a\n');
    assert.equal(isGoogleClientId(CLIENT_ID), true);
    assert.equal(isGoogleClientId('GOCSPX-oops'), false);
  });

  test('asks for both values and writes them; a wrong Client ID writes nothing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memorylane-setup-'));
    const envFile = path.join(dir, '.env');
    try {
      fs.writeFileSync(envFile, 'PORT=4000\nGOOGLE_CLIENT_ID=old.apps.googleusercontent.com\n');
      const wrong = run(envFile, 'not-a-client-id\nGOCSPX-secret-value\n');
      assert.equal(wrong.status, 1);
      assert.match(wrong.stderr, /apps\.googleusercontent\.com/);
      assert.equal(fs.readFileSync(envFile, 'utf8'), 'PORT=4000\nGOOGLE_CLIENT_ID=old.apps.googleusercontent.com\n');

      const ok = run(envFile, `${CLIENT_ID}\nGOCSPX-secret-value\n`);
      assert.equal(ok.status, 0, ok.stderr);
      assert.match(ok.stdout, /localhost:5173\/api\/auth\/google\/callback/);
      assert.equal(fs.readFileSync(envFile, 'utf8'), `PORT=4000\nGOOGLE_CLIENT_ID=${CLIENT_ID}\nGOOGLE_CLIENT_SECRET=GOCSPX-secret-value\n`);
      assert.equal(fs.statSync(envFile).mode & 0o777, 0o600);
      // …and the server reads them: the Google button switches on.
      const config = loadConfig(Object.fromEntries(fs.readFileSync(envFile, 'utf8').trim().split('\n').map((line) => line.split('='))));
      assert.deepEqual(config.google, { clientId: CLIENT_ID, clientSecret: 'GOCSPX-secret-value' });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
