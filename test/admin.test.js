// Looking after the server (PLAN.md, Phần C): the health check, the error reference people can quote, and
// `npm run admin` — against the real app and a throw-away data folder.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { openDb } from '../server/db.js';

// A real 1×1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);
const PASSWORD = 'correct horse battery';
const ADMIN = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'server', 'admin.js');

let tmp;
let config;
let db;
let server;
let base;

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'memorylane-admin-'));
  config = { ...loadConfig({ DATA_DIR: tmp, AUTH_RATE_LIMIT: '1000' }), clientDist: path.join(tmp, 'no-client-build') };
  db = openDb(config.dbFile);
  server = createApp({ db, config }).listen(0);
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server?.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** A browser with its own cookie jar. */
function agent(url = () => base) {
  let cookie = '';
  async function call(method, route, { json, form } = {}) {
    const init = { method, headers: {} };
    if (cookie) init.headers.cookie = cookie;
    if (json !== undefined) {
      init.headers['content-type'] = 'application/json';
      init.body = JSON.stringify(json);
    }
    if (form) init.body = form;
    const res = await fetch(url() + route, init);
    for (const line of res.headers.getSetCookie()) {
      const pair = line.split(';')[0];
      if (pair.startsWith('ml_session=')) cookie = pair.length > 'ml_session='.length ? pair : '';
    }
    return { status: res.status, body: res.status === 204 ? null : await res.json() };
  }
  return { get: (route) => call('GET', route), post: (route, options) => call('POST', route, options) };
}

async function signUp(email, name = 'Ngọc') {
  const a = agent();
  const res = await a.post('/api/auth/register', { json: { name, email, password: PASSWORD, locale: 'vi' } });
  assert.equal(res.status, 201);
  return a;
}

async function memoryWithPhoto(a, fields = {}) {
  const created = await a.post('/api/memories', { json: { title: 'Kỷ niệm', year: 2019, ...fields } });
  assert.equal(created.status, 201);
  const form = new FormData();
  form.set('file', new Blob([PNG], { type: 'image/png' }), 'photo.png');
  const uploaded = await a.post(`/api/memories/${created.body.memory.id}/files`, { form });
  assert.equal(uploaded.status, 201);
  return uploaded.body.memory;
}

const stored = (url) => path.join(config.uploadDir, url.split('/').pop());

/** `npm run admin -- …args --json` on the test data folder. */
function admin(...args) {
  const result = spawnSync(process.execPath, [ADMIN, ...args, '--json'], { encoding: 'utf8', env: { ...process.env, DATA_DIR: tmp } });
  let data = null;
  try {
    data = JSON.parse(result.stdout);
  } catch {
    // not JSON: an error message on stderr
  }
  return { status: result.status, data, stdout: result.stdout, stderr: result.stderr };
}

describe('looking after the server', () => {
  test('/api/health answers without a login, says 503 when the database is gone; a crash gives a reference to quote', async (t) => {
    // Its own app and database, so breaking the database does not disturb the other tests.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memorylane-health-'));
    const own = { ...loadConfig({ DATA_DIR: dir }), clientDist: path.join(dir, 'none') };
    const ownDb = openDb(own.dbFile);
    const app = createApp({ db: ownDb, config: own }).listen(0);
    await once(app, 'listening');
    const url = `http://127.0.0.1:${app.address().port}`;
    try {
      const healthy = await fetch(`${url}/api/health`);
      assert.equal(healthy.status, 200);
      assert.deepEqual(await healthy.json(), { ok: true });

      const browser = agent(() => url);
      assert.equal((await browser.post('/api/auth/register', { json: { name: 'A', email: 'a@example.com', password: PASSWORD } })).status, 201);
      const logged = t.mock.method(console, 'error', () => {});
      ownDb.close(); // the disk failed, the file was deleted…

      const down = await fetch(`${url}/api/health`);
      assert.equal(down.status, 503);
      assert.deepEqual(await down.json(), { ok: false });

      const crash = await browser.get('/api/memories');
      assert.equal(crash.status, 500);
      assert.equal(crash.body.error, 'SERVER');
      assert.match(crash.body.ref, /^[0-9a-f]{8}$/, 'a short reference the person can quote');
      const token = 'k'.repeat(43);
      const masked = await fetch(`${url}/api/invites/preview/${token}`);
      assert.equal(masked.status, 500);

      const lines = logged.mock.calls.map((call) => String(call.arguments[0])).join('\n');
      assert.match(lines, new RegExp(`SERVER ${crash.body.ref} GET /api/memories user=-`), 'the log line carries the same reference');
      assert.match(lines, /GET \/api\/invites\/preview\/… /, 'long tokens in the address are masked');
      assert.ok(!lines.includes(token), 'an invite token never reaches the log');
    } finally {
      app.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('npm run admin (server/admin.js)', () => {
  test('stats, users, user and memory show what support needs — never what people wrote', async () => {
    const a = await signUp('ngoc@example.com');
    const memory = await memoryWithPhoto(a, { title: 'Bí mật của Ngọc', story: 'Chuyện không ai được đọc' });

    const stats = admin('stats');
    assert.equal(stats.status, 0, stats.stderr);
    assert.ok(stats.data.users.total >= 1 && stats.data.memories >= 1 && stats.data.files.images >= 1);
    assert.equal(stats.data.database.version, stats.data.database.expected);

    const list = admin('users', 'ngoc');
    assert.deepEqual(
      list.data.map((u) => [u.email, u.memories, u.activeSessions, u.hasPassword]),
      [['ngoc@example.com', 1, 1, true]],
    );

    const one = admin('user', 'NGOC@example.com'); // emails are found whatever their case
    assert.equal(one.status, 0, one.stderr);
    assert.equal(one.data.memories, 1);
    assert.equal(one.data.files.images, 1);
    assert.equal(one.data.sessions.active, 1);
    assert.ok(one.data.storage.used >= PNG.length);
    assert.ok(!('password_hash' in one.data) && !one.stdout.includes('scrypt$'), 'never the password hash');

    const detail = admin('memory', String(memory.id));
    assert.equal(detail.data.owner.email, 'ngoc@example.com');
    assert.equal(detail.data.files[0].onDisk, true);
    assert.deepEqual(detail.data.sharedWith, []);

    const printed = [stats, list, one, detail].map((r) => r.stdout).join('');
    const human = spawnSync(process.execPath, [ADMIN, 'memory', String(memory.id)], { encoding: 'utf8', env: { ...process.env, DATA_DIR: tmp } });
    for (const text of [printed, human.stdout]) {
      assert.ok(!text.includes('Bí mật') && !text.includes('không ai được đọc'), 'titles and stories stay private');
    }

    // Pointed at the wrong folder, it stops — and does not create an empty database there.
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'memorylane-empty-'));
    const wrong = spawnSync(process.execPath, [ADMIN, 'stats'], { encoding: 'utf8', env: { ...process.env, DATA_DIR: empty } });
    assert.equal(wrong.status, 1);
    assert.match(wrong.stderr, /Không tìm thấy cơ sở dữ liệu/);
    assert.deepEqual(fs.readdirSync(empty), []);
    fs.rmSync(empty, { recursive: true, force: true });
  });

  test('sessions --revoke and reset-password log the person out everywhere; the temporary password works', async () => {
    const phone = await signUp('minh@example.com', 'Minh');
    const laptop = agent();
    assert.equal((await laptop.post('/api/auth/login', { json: { email: 'minh@example.com', password: PASSWORD } })).status, 200);

    assert.equal(admin('sessions', 'minh@example.com').data.sessions.length, 2);
    assert.equal(admin('sessions', 'minh@example.com', '--revoke').data.revoked, 2);
    assert.equal((await phone.get('/api/auth/session')).body.user, null);
    assert.equal((await laptop.get('/api/auth/session')).body.user, null);

    const again = agent();
    assert.equal((await again.post('/api/auth/login', { json: { email: 'minh@example.com', password: PASSWORD } })).status, 200);
    const reset = admin('reset-password', 'minh@example.com');
    assert.equal(reset.status, 0, reset.stderr);
    assert.match(reset.data.temporaryPassword, /^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    assert.equal(reset.data.sessionsRevoked, 1);
    assert.equal((await again.get('/api/auth/session')).body.user, null, 'logged out everywhere');

    const old = await agent().post('/api/auth/login', { json: { email: 'minh@example.com', password: PASSWORD } });
    assert.equal(old.status, 401);
    const fresh = await agent().post('/api/auth/login', { json: { email: 'minh@example.com', password: reset.data.temporaryPassword } });
    assert.equal(fresh.status, 200);

    assert.equal(admin('user', 'nobody@example.com').status, 1);
  });

  test('check-files finds orphans, missing files and leftovers; --fix deletes only what nobody uses', async () => {
    const a = await signUp('lan@example.com', 'Lan');
    const memory = await memoryWithPhoto(a);
    const kept = stored(memory.files[0].url);
    const second = (await memoryWithPhoto(a)).files[0];
    fs.rmSync(stored(second.url)); // a file the database still needs, lost from the disk

    const hourAgo = new Date(Date.now() - 3_600_000);
    const orphan = `${'a'.repeat(32)}.jpg`;
    fs.writeFileSync(path.join(config.uploadDir, orphan), PNG);
    fs.utimesSync(path.join(config.uploadDir, orphan), hourAgo, hourAgo);
    const young = `${'b'.repeat(32)}.jpg`; // maybe an upload being saved right now
    fs.writeFileSync(path.join(config.uploadDir, young), PNG);
    const leftover = path.join(config.uploadDir, 'tmp', 'interrupted-upload');
    fs.writeFileSync(leftover, PNG);
    fs.utimesSync(leftover, new Date(Date.now() - 7_200_000), new Date(Date.now() - 7_200_000));

    const check = admin('check-files');
    assert.deepEqual(check.data.orphans.map((o) => o.name).sort(), [orphan, young]);
    assert.deepEqual(
      check.data.missing.map((m) => [m.name, m.email]),
      [[second.url.split('/').pop(), 'lan@example.com']],
    );
    assert.deepEqual(check.data.staleTmp.map((f) => f.name), ['interrupted-upload']);
    assert.ok(fs.existsSync(path.join(config.uploadDir, orphan)), 'without --fix nothing is deleted');

    const fixed = admin('check-files', '--fix');
    assert.deepEqual(fixed.data.removed.map((f) => f.name).sort(), [orphan, 'interrupted-upload'].sort());
    assert.ok(!fs.existsSync(path.join(config.uploadDir, orphan)));
    assert.ok(!fs.existsSync(leftover));
    assert.ok(fs.existsSync(path.join(config.uploadDir, young)), 'a young orphan is left alone');
    assert.ok(fs.existsSync(kept), 'files in use are never touched');
    assert.equal(admin('check-files').data.missing.length, 1, 'a lost file needs a backup, not --fix');
    fs.rmSync(path.join(config.uploadDir, young));
  });

  test('backup: a database snapshot and the uploads folder, which open on their own', async () => {
    const a = await signUp('hoa@example.com', 'Hoa');
    const photo = (await memoryWithPhoto(a)).files[0];
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'memorylane-backup-'));
    try {
      const result = admin('backup', dest);
      assert.equal(result.status, 0, result.stderr);
      assert.ok(result.data.path.startsWith(dest));

      const copy = new DatabaseSync(path.join(result.data.path, 'memorylane.db'), { readOnly: true });
      const users = (database) => database.prepare('SELECT COUNT(*) AS n FROM users').get().n;
      assert.equal(users(copy), users(db));
      assert.equal(copy.prepare('SELECT COUNT(*) AS n FROM users WHERE email = ?').get('hoa@example.com').n, 1);
      copy.close();

      const name = photo.url.split('/').pop();
      assert.ok(fs.existsSync(path.join(result.data.path, 'uploads', name)));
      assert.ok(!fs.existsSync(path.join(result.data.path, 'uploads', 'tmp')), 'unfinished uploads are not backed up');
      assert.match(fs.readFileSync(path.join(result.data.path, 'README.txt'), 'utf8'), /Khôi phục/);
    } finally {
      fs.rmSync(dest, { recursive: true, force: true });
    }
  });
});
