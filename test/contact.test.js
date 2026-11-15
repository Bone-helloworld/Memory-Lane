// Contact form: validation (including the 500-character cap), the 24-hour email and IP cap, honeypot, and the log.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import en from '../client/src/i18n/en.js';
import vi from '../client/src/i18n/vi.js';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { openDb } from '../server/db.js';

async function withApp({ contactRateLimit, captureLog = false, isProd = false } = {}, fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'memorylane-contact-'));
  const env = { DATA_DIR: tmp, NODE_ENV: isProd ? 'production' : 'test' };
  if (contactRateLimit != null) env.CONTACT_RATE_LIMIT = String(contactRateLimit);
  const config = {
    ...loadConfig(env),
    clientDist: path.join(tmp, 'no-client'),
  };
  const db = openDb(config.dbFile);
  const logs = [];
  const original = console.log;
  if (captureLog) console.log = (...args) => logs.push(args.map(String).join(' '));
  const server = createApp({ db, config }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await fn(`http://127.0.0.1:${server.address().port}`, { db, config, logs });
  } finally {
    if (captureLog) console.log = original;
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

async function post(base, json, headers = {}) {
  const res = await fetch(base + '/api/contact', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(json),
  });
  const raw = await res.text();
  return { status: res.status, body: raw ? JSON.parse(raw) : null };
}

const fromIp = (n) => ({ 'x-forwarded-for': `203.0.113.${n}` });

const valid = {
  kind: 'feedback',
  name: 'An Nguyễn',
  email: 'An@Example.com',
  message: 'The album feels like home.',
};

test('a valid note is stored, and the address is lower-cased', async () => {
  await withApp({ captureLog: true }, async (base, { db, logs }) => {
    const res = await post(base, valid);
    assert.equal(res.status, 201);
    assert.deepEqual(res.body, { ok: true });
    const row = db.prepare('SELECT kind, name, email, message FROM contact_messages').get();
    assert.deepEqual({ ...row }, {
      kind: 'feedback',
      name: 'An Nguyễn',
      email: 'an@example.com',
      message: 'The album feels like home.',
    });
    assert.ok(logs.some((line) => line.includes('CONTACT stored') && line.includes(valid.message)));
    assert.equal(logs.some((line) => /smtp|nodemailer/i.test(line)), false);
  });
});

test('missing fields, a bad email, a bad type and an over-long message are rejected', async () => {
  await withApp({}, async (base, { db }) => {
    const empty = await post(base, {});
    assert.equal(empty.status, 400);
    assert.equal(empty.body.error, 'VALIDATION');
    assert.equal(empty.body.fields.kind.code, 'REQUIRED');
    assert.equal(empty.body.fields.name.code, 'REQUIRED');
    assert.equal(empty.body.fields.email.code, 'REQUIRED');
    assert.equal(empty.body.fields.message.code, 'REQUIRED');

    const email = await post(base, { ...valid, email: 'not-an-email' });
    assert.equal(email.status, 400);
    assert.equal(email.body.fields.email.code, 'INVALID_EMAIL');

    const kind = await post(base, { ...valid, kind: 'complaint' });
    assert.equal(kind.status, 400);
    assert.equal(kind.body.fields.kind.code, 'INVALID_CHOICE');

    const long = await post(base, { ...valid, message: 'x'.repeat(501) });
    assert.equal(long.status, 400);
    assert.equal(long.body.fields.message.code, 'TOO_LONG');
    assert.equal(long.body.fields.message.max, 500);

    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM contact_messages').get().n, 0);
  });
});

test('the honeypot answers success and stores nothing', async () => {
  await withApp({}, async (base, { db }) => {
    const res = await post(base, { ...valid, website: 'https://spam.example' });
    assert.equal(res.status, 201);
    assert.deepEqual(res.body, { ok: true });
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM contact_messages').get().n, 0);

    const blank = await post(base, { ...valid, website: '   ' });
    assert.equal(blank.status, 201);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM contact_messages').get().n, 1);
  });
});

test('the daily limit message is the bilingual sentence', () => {
  assert.equal(en.errors.CONTACT_LIMIT, 'You have reached the limit of 2 messages today, please try again tomorrow.');
  assert.equal(vi.errors.CONTACT_LIMIT, 'Bạn đã gửi tối đa 2 góp ý hôm nay, vui lòng thử lại vào ngày mai.');
});

test('the same email can store 2 notes in 24 hours, from any IP, and the third is refused', async () => {
  await withApp({ isProd: true }, async (base, { db }) => {
    assert.equal((await post(base, valid, fromIp(1))).status, 201);
    assert.equal((await post(base, { ...valid, email: 'AN@EXAMPLE.COM' }, fromIp(2))).status, 201);
    const limited = await post(base, { ...valid, email: 'an@example.com' }, fromIp(3));
    assert.equal(limited.status, 429);
    assert.equal(limited.body.error, 'CONTACT_LIMIT');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM contact_messages').get().n, 2);
  });
});

test('the same IP can store 2 notes in 24 hours, for any email, and the third is refused', async () => {
  await withApp({ isProd: true }, async (base, { db }) => {
    assert.equal((await post(base, { ...valid, email: 'a@example.com' }, fromIp(8))).status, 201);
    assert.equal((await post(base, { ...valid, email: 'b@example.com' }, fromIp(8))).status, 201);
    const limited = await post(base, { ...valid, email: 'c@example.com' }, fromIp(8));
    assert.equal(limited.status, 429);
    assert.equal(limited.body.error, 'CONTACT_LIMIT');
    // A different IP is its own bucket.
    assert.equal((await post(base, { ...valid, email: 'c@example.com' }, fromIp(9))).status, 201);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM contact_messages').get().n, 3);
  });
});

test('notes older than 24 hours no longer count, because the cap reads the stored rows', async () => {
  await withApp({ isProd: true }, async (base, { db }) => {
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const insert = db.prepare(
      'INSERT INTO contact_messages (kind, name, email, message, ip, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    );
    insert.run('feedback', 'An', 'old@example.com', 'earlier', '203.0.113.4', old);
    insert.run('feedback', 'An', 'old@example.com', 'earlier still', '203.0.113.4', old);
    const res = await post(base, { ...valid, email: 'old@example.com' }, fromIp(4));
    assert.equal(res.status, 201);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM contact_messages').get().n, 3);
  });
});

test('a message of exactly 500 characters is stored', async () => {
  const message = 'x'.repeat(500);
  await withApp({}, async (base, { db }) => {
    const res = await post(base, { ...valid, message });
    assert.equal(res.status, 201);
    const row = db.prepare('SELECT message FROM contact_messages').get();
    assert.equal(row.message.length, 500);
  });
});
