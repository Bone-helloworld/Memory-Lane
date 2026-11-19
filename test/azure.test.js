// Azure SQL and Blob Storage, exercised without a cloud account:
// the T-SQL translator, a fake driver (transactions, identity, unique errors),
// demo-reset safety on real SQLite, and a fake blob container (upload, delete, Range).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import express from 'express';
import { Readable } from 'node:stream';
import { loadConfig } from '../server/config.js';
import { openDb, transaction } from '../server/db.js';
import { createMssqlDb } from '../server/db/mssql-db.js';
import { splitBatches, mssqlMigrationFiles } from '../server/db/migrate-mssql.js';
import { mssqlConfig, redactSecret } from '../server/db/mssql-config.js';
import { assertDemoEmails, demoEmailWhere, shouldSeedDemo, DEMO_EMAIL_SUFFIX } from '../server/lib/demo.js';
import { createBlobStore, parseRange } from '../server/lib/blob-store.js';
import { assignParameters } from '../server/sql/params.js';
import { connectWithRetry } from '../server/sql/retry.js';
import { translateSql, withIdentity } from '../server/sql/translate.js';

const SQLITE_ISMS = /json_group_array|json_object\s*\(|json_each|strftime\s*\(|INSERT\s+OR\s+IGNORE|COLLATE\s+NOCASE|NULLS\s+LAST|\brandom\s*\(|\bfold\s*\(|\bsubstr\s*\(|\|\|/;

test('every SQLite-only statement in the server translates to T-SQL', () => {
  const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'server');
  const files = walk(root).filter((file) => file.endsWith('.js') && !file.includes(`${path.sep}sql${path.sep}`) && !file.includes(`${path.sep}migrations${path.sep}`));
  let seen = 0;
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    for (const sql of sourceStrings(source)) {
      if (!SQLITE_ISMS.test(sql)) continue;
      if (!/\b(SELECT|INSERT|UPDATE|DELETE|ORDER|strftime|fold|json_)/i.test(sql)) continue;
      seen += 1;
      const translated = translateSql(sql);
      assert.equal(SQLITE_ISMS.test(translated), false, `${path.relative(root, file)}: ${translated.slice(0, 180)}`);
    }
  }
  assert.ok(seen >= 8, `expected the models to contain SQLite-specific SQL, found ${seen}`);
});

test('search, paging, ignore-inserts and identity use SQL Server forms', () => {
  const searched = translateSql("SELECT id FROM memories m WHERE fold(m.title || ' ' || m.place) LIKE ? ESCAPE '\\' ORDER BY m.month DESC NULLS LAST LIMIT ?");
  assert.match(searched, /COLLATE Vietnamese_100_CI_AI LIKE \? COLLATE Vietnamese_100_CI_AI/);
  assert.match(searched, /N' '/);
  assert.match(searched, /CASE WHEN m\.month IS NULL THEN 1 ELSE 0 END, m\.month DESC/);
  assert.match(searched, /OFFSET 0 ROWS FETCH NEXT \? ROWS ONLY/);
  assert.doesNotMatch(searched, /fold\(|\|\||NULLS LAST|LIMIT/);

  const now = translateSql("UPDATE memories SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?");
  assert.match(now, /SYSUTCDATETIME\(\)/);
  assert.match(now, /\+ 'Z'/);

  const ignore = translateSql('INSERT OR IGNORE INTO connections (user_id, other_id) VALUES (?, ?)');
  assert.match(ignore, /^MERGE connections AS t USING \(SELECT \? AS user_id, \? AS other_id\) AS s/);
  assert.match(ignore, /WHEN NOT MATCHED THEN INSERT/);
  assert.equal(withIdentity(ignore), ignore);

  const shares = translateSql(
    `INSERT OR IGNORE INTO shares (memory_id, user_id)
     SELECT ?, c.other_id FROM connections c
      WHERE c.user_id = ? AND c.other_id IN (SELECT value FROM json_each(?))`,
  );
  assert.match(shares, /OPENJSON\(\?\)/);
  assert.match(shares, /CAST\(value AS INT\)/);
  assert.match(shares, /MERGE shares AS t/);

  const contact = withIdentity("INSERT INTO contact_messages (kind, name, email, message, ip) VALUES (?, ?, ?, ?, ?)");
  assert.match(contact, /INSERT INTO contact_messages \(kind, name, email, message, ip\) OUTPUT INSERTED\.id VALUES/);
  const recent = translateSql(
    `SELECT COALESCE(SUM(CASE WHEN lower(email) = ? THEN 1 ELSE 0 END), 0) AS by_email,
            COALESCE(SUM(CASE WHEN ip = ? THEN 1 ELSE 0 END), 0) AS by_ip
       FROM contact_messages WHERE created_at >= ?`,
  );
  assert.match(recent, /lower\(email\)/);
  assert.match(recent, /contact_messages/);

  const inserted = withIdentity('INSERT INTO users (email, name) VALUES (?, ?)');
  assert.match(inserted, /INSERT INTO users \(email, name\) OUTPUT INSERTED\.id VALUES/);
  assert.equal(withIdentity('INSERT INTO connections (user_id, other_id) VALUES (?, ?)'), 'INSERT INTO connections (user_id, other_id) VALUES (?, ?)');
});

test('placeholders outside strings become @p0, @p1', () => {
  assert.equal(assignParameters("SELECT * FROM users WHERE email = ? AND name <> '?'"), "SELECT * FROM users WHERE email = @p0 AND name <> '?'");
  assert.equal(assignParameters('VALUES (?, ?)'), 'VALUES (@p0, @p1)');
});

test('a fake SQL Server driver keeps transactions and returns the new id', () => {
  const calls = [];
  let open = false;
  const db = createMssqlDb({
    query(sql, params) {
      calls.push({ sql, params, open });
      if (/OUTPUT INSERTED\.id/i.test(sql)) return { rows: [{ id: 7 }], rowsAffected: 1 };
      if (/FROM users/i.test(sql)) {
        if (params[0] === 99) return { rows: [], rowsAffected: 0 };
        return { rows: [{ id: 7, email: 'a@b.c', has_password: true }], rowsAffected: 1 };
      }
      return { rows: [], rowsAffected: 2 };
    },
    begin() {
      assert.equal(open, false);
      open = true;
    },
    commit() {
      open = false;
    },
    rollback() {
      open = false;
    },
  });

  const created = transaction(db, () => {
    const id = db.prepare('INSERT INTO users (email, name) VALUES (?, ?)').run('A@B.C', 'An').lastInsertRowid;
    db.prepare('UPDATE users SET name = ? WHERE id = ?').run('An', id);
    return Number(id);
  });
  assert.equal(created, 7);
  assert.equal(open, false);
  assert.equal(calls[0].open, true);
  assert.match(calls[0].sql, /OUTPUT INSERTED\.id/);
  assert.deepEqual(calls[0].params, ['A@B.C', 'An']);
  assert.equal(db.prepare('SELECT * FROM users WHERE id = ?').get(7).email, 'a@b.c');
  assert.equal(db.prepare('SELECT * FROM users WHERE id = ?').get(99), undefined);

  assert.throws(() => transaction(db, () => {
    db.prepare('DELETE FROM users WHERE id = ?').run(1);
    throw new Error('nope');
  }), /nope/);
  assert.equal(open, false);
  assert.equal(calls.at(-1).sql.startsWith('DELETE'), true);
});

test('connection retry waits between attempts and then succeeds', async () => {
  const waits = [];
  let tries = 0;
  const pool = await connectWithRetry(
    async () => {
      tries += 1;
      if (tries < 3) throw Object.assign(new Error('Database is not currently available'), { number: 40613 });
      return { connected: true };
    },
    { delays: [0, 5, 7], sleep: async (ms) => waits.push(ms) },
  );
  assert.deepEqual(pool, { connected: true });
  assert.deepEqual(waits, [5, 7]);
  assert.equal(tries, 3);
});

test('pool config keeps the password out of logs and turns encryption on', () => {
  const config = mssqlConfig({
    server: 'memorylane-sql-29823.database.windows.net',
    database: 'memorylane-db',
    user: 'mladmin',
    password: 's3cret-value',
  });
  assert.equal(config.password, 's3cret-value');
  assert.equal(config.options.encrypt, true);
  assert.equal(config.options.trustServerCertificate, false);
  assert.equal(config.pool.max, 5);
  assert.equal(config.pool.min, 0);
  assert.equal(redactSecret(`Login failed for s3cret-value`, 's3cret-value'), 'Login failed for ***');
  const fromString = mssqlConfig({ connectionString: 'Server=tcp:example;', trustServerCertificate: true });
  assert.equal(fromString.connectionString, 'Server=tcp:example;');
  assert.equal(fromString.options.trustServerCertificate, true);
});

test('Azure settings are optional, and a partial set is refused', () => {
  const local = loadConfig({ DATA_DIR: 'data' });
  assert.equal(local.azureSql, null);
  assert.equal(local.azureStorage, null);
  assert.equal(local.port, 3001);

  const sql = loadConfig({
    AZURE_SQL_SERVER: 'memorylane-sql-29823.database.windows.net',
    AZURE_SQL_DATABASE: 'memorylane-db',
    AZURE_SQL_USER: 'mladmin',
    AZURE_SQL_PASSWORD: 'secret',
  });
  assert.equal(sql.azureSql.database, 'memorylane-db');
  assert.equal(sql.azureSql.password, 'secret');

  const both = loadConfig({
    AZURE_SQL_CONNECTION_STRING: 'Server=tcp:example;',
    AZURE_SQL_SERVER: 'ignored.example',
  });
  assert.equal(both.azureSql.connectionString, 'Server=tcp:example;');
  assert.equal(both.azureSql.server, undefined);

  assert.throws(() => loadConfig({ AZURE_SQL_SERVER: 'only-the-host' }), /partly configured/);
  assert.throws(() => loadConfig({ AZURE_STORAGE_ACCOUNT: 'memorylanest2555' }), /partly configured/);

  const blobs = loadConfig({ AZURE_STORAGE_ACCOUNT: 'memorylanest2555', AZURE_STORAGE_KEY: 'key' });
  assert.equal(blobs.azureStorage.container, 'media');
  assert.equal(blobs.azureStorage.account, 'memorylanest2555');
  const named = loadConfig({
    AZURE_STORAGE_CONNECTION_STRING: 'DefaultEndpointsProtocol=https;AccountName=memorylanest2555;',
    AZURE_STORAGE_CONTAINER: 'media',
  });
  assert.equal(named.azureStorage.connectionString.startsWith('DefaultEndpointsProtocol'), true);
});

test('demo reset deletes only @memorylane.local rows', () => {
  assert.equal(shouldSeedDemo({ allowDemo: true }), true);
  assert.equal(shouldSeedDemo({ allowDemo: false }), false);
  assert.throws(() => assertDemoEmails(['person@gmail.com']), /not a @memorylane\.local/);
  assert.throws(() => assertDemoEmails([]), /no demo accounts/);

  const db = openDb(':memory:');
  try {
    db.prepare('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)').run('real@example.com', 'Real', 'x');
    const demoId = Number(
      db.prepare('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)').run('demo@memorylane.local', 'An', 'x').lastInsertRowid,
    );
    db.prepare('INSERT INTO memories (user_id, title, year) VALUES (?, ?, ?)').run(demoId, 'Đà Lạt', 2019);
    const emails = ['demo@memorylane.local', 'thuha@memorylane.local'];
    assertDemoEmails(emails);
    db.prepare(`DELETE FROM users WHERE ${demoEmailWhere(emails.length)}`).run(...emails, `%${DEMO_EMAIL_SUFFIX}`);
    const left = db.prepare('SELECT email FROM users').all().map((row) => row.email);
    assert.deepEqual(left, ['real@example.com']);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM memories').get().n, 0);
  } finally {
    db.close();
  }
});

test('the Azure SQL script is idempotent and splits the trigger into its own batch', () => {
  const files = mssqlMigrationFiles();
  assert.deepEqual(files, ['001_schema.sql', '002_contact_ip.sql', '003_comment_replies.sql']);
  const script = fs.readFileSync(new URL('../server/migrations/mssql/001_schema.sql', import.meta.url), 'utf8');
  const batches = splitBatches(script);
  assert.equal(batches.length, 2);
  assert.match(batches[0], /IF OBJECT_ID\(N'dbo\.users'/);
  assert.match(batches[0], /ON DELETE CASCADE/);
  assert.match(batches[1], /CREATE OR ALTER TRIGGER dbo\.trg_users_delete/);
  assert.match(script, /INSTEAD OF DELETE/);
  assert.doesNotMatch(script, /PUBLIC|container public/i);

  const replies = fs.readFileSync(new URL('../server/migrations/mssql/003_comment_replies.sql', import.meta.url), 'utf8');
  const replyBatches = splitBatches(replies);
  assert.ok(replyBatches.length >= 2);
  assert.match(replies, /ON DELETE NO ACTION/);
  assert.match(replyBatches.at(-1), /CREATE OR ALTER TRIGGER dbo\.trg_users_delete/);
  assert.match(replies, /SET parent_id = NULL/);
});

test('blob storage uploads, deletes, and serves a Range without making anything public', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memorylane-blob-'));
  const blobs = new Map();
  const container = fakeContainer(blobs);
  const store = createBlobStore(dir, { account: 'memorylanest2555', key: 'key', container: 'media' }, container);
  try {
    const name = await store.saveBuffer(Buffer.from('0123456789abcdef'), 'mp4');
    assert.match(name, /^[a-f0-9]{32}\.mp4$/);
    assert.equal(await store.exists(name), true);
    assert.equal(container.createdAccess, undefined, 'createIfNotExists must not grant public access');

    const app = express();
    app.get('/files/:name', (req, res, next) => {
      store.send(req.params.name, req, res).catch(next);
    });
    app.use((err, req, res, next) => {
      res.status(err.status || 500).end();
    });
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      const part = await fetch(`${base}/files/${name}`, { headers: { range: 'bytes=4-7' } });
      assert.equal(part.status, 206);
      assert.equal(part.headers.get('content-range'), 'bytes 4-7/16');
      assert.equal(part.headers.get('accept-ranges'), 'bytes');
      assert.equal(part.headers.get('content-type'), 'video/mp4');
      assert.equal(part.headers.get('cache-control'), 'private, no-cache');
      assert.equal(await part.text(), '4567');

      const tail = await fetch(`${base}/files/${name}`, { headers: { range: 'bytes=-3' } });
      assert.equal(tail.status, 206);
      assert.equal(await tail.text(), 'def');

      const bad = await fetch(`${base}/files/${name}`, { headers: { range: 'bytes=40-50' } });
      assert.equal(bad.status, 416);

      const missing = await fetch(`${base}/files/${'ab'.repeat(16)}.mp4`);
      assert.equal(missing.status, 404);
    } finally {
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
    }

    await store.remove(name);
    assert.equal(blobs.has(name), false);
    const listed = await store.list();
    assert.deepEqual(listed, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('parseRange accepts a suffix and rejects an empty header as "the whole file"', () => {
  assert.equal(parseRange(undefined, 10), null);
  assert.deepEqual(parseRange('bytes=0-3', 10), { start: 0, end: 3 });
  assert.deepEqual(parseRange('bytes=8-', 10), { start: 8, end: 9 });
  assert.deepEqual(parseRange('bytes=-4', 10), { start: 6, end: 9 });
  assert.equal(parseRange('bytes=10-11', 10).invalid, true);
});

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return [full];
  });
}

function sourceStrings(source) {
  const found = [];
  for (const match of source.matchAll(/`([^`]*)`|"([^"\\]*(?:\\.[^"\\]*)*)"/gs)) found.push(match[1] ?? match[2]);
  return found;
}

function fakeContainer(blobs) {
  return {
    createdAccess: undefined,
    async createIfNotExists(options = {}) {
      this.createdAccess = options.access;
    },
    getBlockBlobClient(name) {
      return {
        async uploadData(buffer) {
          blobs.set(name, Buffer.from(buffer));
        },
        async uploadFile(file) {
          blobs.set(name, fs.readFileSync(file));
        },
        async deleteIfExists() {
          blobs.delete(name);
        },
        async exists() {
          return blobs.has(name);
        },
        async getProperties() {
          const body = blobs.get(name);
          if (!body) {
            const err = new Error('The specified blob does not exist.');
            err.statusCode = 404;
            err.code = 'BlobNotFound';
            throw err;
          }
          return { contentLength: body.length, etag: '"etag"', contentType: 'video/mp4' };
        },
        async download(offset = 0, count) {
          const body = blobs.get(name);
          const end = count == null ? body.length : offset + count;
          return { readableStreamBody: Readable.from(body.subarray(offset, end)) };
        },
      };
    },
    async *listBlobsFlat() {
      for (const [name, body] of blobs) {
        yield { name, properties: { contentLength: body.length, lastModified: new Date() } };
      }
    },
  };
}
