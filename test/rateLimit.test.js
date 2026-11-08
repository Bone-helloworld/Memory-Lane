// The login limiter must trip on the 21st attempt (the default is 20 per 15 minutes)
// and must count the visitor, not an address the visitor put in a header.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { openDb } from '../server/db.js';
import { DEMO_LOGIN_LIMIT } from '../server/routes/auth.js';

async function withApp({ isProd = false, cloudflare = false, allowDemo = true, authRateLimit = 20 } = {}, fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'memorylane-rl-'));
  const config = {
    ...loadConfig({
      DATA_DIR: tmp,
      AUTH_RATE_LIMIT: String(authRateLimit),
      ALLOW_DEMO: allowDemo ? 'true' : 'false',
      RENDER: cloudflare ? 'true' : 'false',
      NODE_ENV: isProd ? 'production' : 'test',
    }),
    clientDist: path.join(tmp, 'no-client'),
  };
  const db = openDb(config.dbFile);
  const server = createApp({ db, config }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

async function post(base, urlPath, { headers = {}, json } = {}) {
  const res = await fetch(base + urlPath, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(json),
  });
  const retryAfter = res.headers.get('retry-after');
  const raw = await res.text();
  return { status: res.status, body: raw ? JSON.parse(raw) : null, retryAfter };
}

const badLogin = (base, headers) =>
  post(base, '/api/auth/login', { headers, json: { email: 'nobody@example.com', password: 'not-a-real-password' } });

// Invalid on purpose: the limiter runs first, and hashing a password 21 times is unnecessary here.
const badRegister = (base, headers) =>
  post(base, '/api/auth/register', { headers, json: { name: '', email: 'nope', password: 'x' } });

function assertLimited(res) {
  assert.equal(res.status, 429);
  assert.equal(res.body?.error, 'RATE_LIMITED');
  const retry = Number(res.retryAfter);
  assert.equal(Number.isInteger(retry), true, `Retry-After should be an integer, got ${res.retryAfter}`);
  assert.ok(retry >= 1 && retry <= 15 * 60, `Retry-After out of range: ${res.retryAfter}`);
}

test('the 21st bad login is rejected with Retry-After', async () => {
  await withApp({ isProd: true, cloudflare: true }, async (base) => {
    for (let attempt = 1; attempt <= 20; attempt += 1) {
      const res = await badLogin(base);
      assert.equal(res.status, 401, `attempt ${attempt} should still be a failed login`);
    }
    assertLimited(await badLogin(base));
  });
});

test('on Render, a forged X-Forwarded-For does not get its own bucket', async () => {
  await withApp({ isProd: true, cloudflare: true }, async (base) => {
    // Cloudflare overwrites CF-Connecting-IP. The leftmost X-Forwarded-For is whatever the client sent.
    for (let attempt = 1; attempt <= 20; attempt += 1) {
      const res = await badRegister(base, {
        'cf-connecting-ip': '203.0.113.10',
        'x-forwarded-for': `198.51.100.${attempt}, 10.0.0.8`,
      });
      assert.equal(res.status, 400, `attempt ${attempt}`);
    }
    assertLimited(
      await badRegister(base, {
        'cf-connecting-ip': '203.0.113.10',
        'x-forwarded-for': '203.0.113.99, 10.9.9.9',
      }),
    );
    // A different visitor is counted separately.
    const other = await badRegister(base, {
      'cf-connecting-ip': '203.0.113.20',
      'x-forwarded-for': '203.0.113.10, 10.0.0.8',
    });
    assert.equal(other.status, 400);
  });
});

test('off Render, clients cannot pick the key with CF-Connecting-IP or the left side of X-Forwarded-For', async () => {
  await withApp({ isProd: true, cloudflare: false }, async (base) => {
    for (let attempt = 1; attempt <= 20; attempt += 1) {
      const res = await badRegister(base, {
        'cf-connecting-ip': `203.0.113.${attempt}`,
        'x-forwarded-for': `${attempt}.2.3.4, 198.51.100.20`,
      });
      assert.equal(res.status, 400, `attempt ${attempt}`);
    }
    assertLimited(
      await badRegister(base, {
        'cf-connecting-ip': '198.51.100.250',
        'x-forwarded-for': '1.1.1.1, 198.51.100.20',
      }),
    );
    // The one trusted hop appended a different client address: its own bucket.
    const other = await badRegister(base, {
      'cf-connecting-ip': '203.0.113.10',
      'x-forwarded-for': '198.51.100.20, 203.0.113.77',
    });
    assert.equal(other.status, 400);
  });
});

test('without a trusted proxy, forwarded headers are ignored', async () => {
  await withApp({ isProd: false, cloudflare: true }, async (base) => {
    for (let attempt = 1; attempt <= 20; attempt += 1) {
      const res = await badRegister(base, {
        'cf-connecting-ip': `203.0.113.${attempt}`,
        'x-forwarded-for': `198.51.100.${attempt}, 203.0.113.10`,
      });
      assert.equal(res.status, 400, `attempt ${attempt}`);
    }
    assertLimited(
      await badRegister(base, {
        'cf-connecting-ip': '203.0.113.200',
        'x-forwarded-for': '198.51.100.200, 203.0.113.10',
      }),
    );
  });
});

test('demo login is rate limited only while the demo is enabled', async () => {
  await withApp({ allowDemo: true }, async (base) => {
    for (let attempt = 1; attempt <= DEMO_LOGIN_LIMIT; attempt += 1) {
      const res = await post(base, '/api/auth/demo', { json: {} });
      assert.equal(res.status, 404, `attempt ${attempt}`);
      assert.equal(res.body.error, 'DEMO_MISSING');
    }
    assertLimited(await post(base, '/api/auth/demo', { json: {} }));
  });

  await withApp({ allowDemo: false }, async (base) => {
    for (let attempt = 1; attempt <= DEMO_LOGIN_LIMIT + 1; attempt += 1) {
      const res = await post(base, '/api/auth/demo', { json: {} });
      assert.equal(res.status, 404, `attempt ${attempt}`);
      assert.equal(res.body.error, 'NOT_FOUND');
    }
  });
});
