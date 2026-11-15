// Contact form: validation, per-IP rate limit, honeypot, and the SMTP mailer (mocked).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { openDb } from '../server/db.js';
import { createMailer } from '../server/lib/mail.js';

async function withApp({ contactRateLimit = 8, mailer, captureLog = false } = {}, fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'memorylane-contact-'));
  const config = {
    ...loadConfig({
      DATA_DIR: tmp,
      CONTACT_RATE_LIMIT: String(contactRateLimit),
      NODE_ENV: 'test',
    }),
    clientDist: path.join(tmp, 'no-client'),
  };
  const db = openDb(config.dbFile);
  const logs = [];
  const original = console.log;
  if (captureLog) console.log = (...args) => logs.push(args.map(String).join(' '));
  const server = createApp({ db, config, mailer }).listen(0, '127.0.0.1');
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

async function post(base, json) {
  const res = await fetch(base + '/api/contact', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(json),
  });
  const retryAfter = res.headers.get('retry-after');
  const raw = await res.text();
  return { status: res.status, body: raw ? JSON.parse(raw) : null, retryAfter };
}

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
    assert.ok(logs.some((line) => line.includes('SMTP not configured') && line.includes(valid.message)));
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

    const long = await post(base, { ...valid, message: 'x'.repeat(4001) });
    assert.equal(long.status, 400);
    assert.equal(long.body.fields.message.code, 'TOO_LONG');
    assert.equal(long.body.fields.message.max, 4000);

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

test('the fourth submission from one IP is rate limited', async () => {
  await withApp({ contactRateLimit: 3 }, async (base, { db }) => {
    for (let n = 1; n <= 3; n += 1) {
      const res = await post(base, { ...valid, kind: n === 2 ? 'suggestion' : 'collaboration' });
      assert.equal(res.status, 201, `attempt ${n}`);
    }
    const limited = await post(base, valid);
    assert.equal(limited.status, 429);
    assert.equal(limited.body.error, 'RATE_LIMITED');
    const retry = Number(limited.retryAfter);
    assert.equal(Number.isInteger(retry), true);
    assert.ok(retry >= 1 && retry <= 15 * 60);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM contact_messages').get().n, 3);
  });
});

test('when SMTP is configured the mailer is called with Reply-To set to the sender', async () => {
  const sent = [];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'memorylane-contact-mail-'));
  const config = {
    ...loadConfig({ DATA_DIR: tmp, NODE_ENV: 'test', FEEDBACK_TO: 'bonenguyen.19@gmail.com' }),
    clientDist: path.join(tmp, 'no-client'),
    smtp: { host: 'smtp.gmail.com', port: 587, user: 'lane@gmail.com', pass: 'app-password' },
  };
  const mailer = createMailer(config, { sendMail: async (message) => sent.push(message) });
  const db = openDb(config.dbFile);
  const server = createApp({ db, config, mailer }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const res = await post(base, { ...valid, kind: 'collaboration', message: 'Let us build this together.' });
    assert.equal(res.status, 201);
    assert.equal(sent.length, 1);
    const message = sent[0];
    assert.equal(message.to, 'bonenguyen.19@gmail.com');
    assert.equal(message.replyTo, 'an@example.com');
    assert.equal(message.from, 'lane@gmail.com');
    assert.equal(message.subject, 'Memory Lane contact: collaboration — An Nguyễn');
    assert.match(message.text, /Let us build this together\./);
    assert.match(message.text, /Type: collaboration/);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM contact_messages').get().n, 1);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('a mailer that throws still stores the note and answers success', async () => {
  const mailer = {
    send: async () => {
      throw new Error('smtp down');
    },
  };
  await withApp({ mailer }, async (base, { db }) => {
    const res = await post(base, valid);
    assert.equal(res.status, 201);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM contact_messages').get().n, 1);
  });
});

test('createMailer does nothing until SMTP_HOST is set', () => {
  const config = loadConfig({ DATA_DIR: os.tmpdir() });
  assert.equal(createMailer(config), null);
});
