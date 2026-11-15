// T-SQL reserved words used as column names must be delimited on Azure SQL.
// SQLite accepts `file` bare; SQL Server rejects it with "Incorrect syntax near the keyword 'file'".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { mssqlMigrationFiles, mssqlMigrationsDir } from '../server/db/migrate-mssql.js';
import { translateSql, withIdentity } from '../server/sql/translate.js';
import { bareReservedIdentifiers, quoteReservedIdentifiers } from '../server/sql/reserved.js';

const SERVER = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'server');

test('bare reserved names are bracketed and real keywords are left alone', () => {
  const listed = 'SELECT id, kind, file, poster FROM memory_files WHERE file = ? ORDER BY position';
  assert.deepEqual(bareReservedIdentifiers(listed), ['file', 'file']);
  assert.equal(
    translateSql(listed),
    'SELECT id, kind, [file], poster FROM memory_files WHERE [file] = ? ORDER BY position',
  );

  assert.equal(translateSql('SELECT f.file, a.file FROM memory_files f'), 'SELECT f.[file], a.[file] FROM memory_files f');
  assert.equal(
    translateSql('SELECT 1 FROM artifacts WHERE user_id = ? AND (file = ? OR preview = ?)'),
    'SELECT 1 FROM artifacts WHERE user_id = ? AND ([file] = ? OR preview = ?)',
  );
  assert.equal(
    translateSql("SELECT file FROM t WHERE label = 'file' OR note = N'file'"),
    "SELECT [file] FROM t WHERE label = 'file' OR note = N'file'",
  );
  assert.equal(
    quoteReservedIdentifiers('-- the file column\nSELECT 1 FROM t /* file */'),
    '-- the file column\nSELECT 1 FROM t /* file */',
  );
  assert.equal(quoteReservedIdentifiers('SELECT [file] FROM t'), 'SELECT [file] FROM t');

  const inserted = withIdentity(translateSql(
    'INSERT INTO memory_files (memory_id, user_id, kind, file, poster) VALUES (?, ?, ?, ?, ?)',
  ));
  assert.match(inserted, /kind, \[file\], poster\) OUTPUT INSERTED\.id VALUES/);
  assert.deepEqual(bareReservedIdentifiers(inserted), []);

  const merged = translateSql('INSERT OR IGNORE INTO memory_files (memory_id, file) VALUES (?, ?)');
  assert.match(merged, /AS \[file\]/);
  assert.match(merged, /t\.\[file\] = s\.\[file\]/);
  assert.match(merged, /INSERT \(memory_id, \[file\]\)/);
  assert.doesNotMatch(merged, /\[INSERT\]|\[MERGE\]|\[WHEN\]|\[NOT\]/);
  assert.deepEqual(bareReservedIdentifiers(merged), []);

  for (const word of ['user', 'key', 'order', 'open', 'public', 'file', 'plan', 'rule', 'function', 'percent']) {
    const sql = `SELECT ${word}, t.${word} FROM t WHERE ${word} = ? ORDER BY ${word}`;
    const quoted = translateSql(sql);
    assert.equal(quoted, `SELECT [${word}], t.[${word}] FROM t WHERE [${word}] = ? ORDER BY [${word}]`);
    assert.deepEqual(bareReservedIdentifiers(quoted), []);
  }

  const keywords = `
    CREATE TABLE dbo.example (
      id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_example PRIMARY KEY,
      email NVARCHAR(320) NOT NULL,
      CONSTRAINT UQ_example UNIQUE (email)
    );
    CREATE OR ALTER TRIGGER dbo.trg ON dbo.users INSTEAD OF DELETE AS BEGIN
      SET NOCOUNT ON;
      IF NOT EXISTS (SELECT 1 FROM deleted) RETURN;
      UPDATE dbo.people SET linked_user_id = NULL WHERE linked_user_id IN (SELECT id FROM deleted);
    END
    SELECT DISTINCT u.id, COUNT(DISTINCT u.id) AS n
      FROM users u
      LEFT JOIN memories m ON m.user_id = u.id
     WHERE u.id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sessions s WHERE s.user_id = u.id)
     GROUP BY u.id
     ORDER BY CASE WHEN u.id IS NULL THEN 1 ELSE 0 END, u.id DESC
    OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY;
    SELECT TOP 10 PERCENT id FROM users FOR JSON PATH;
    MERGE t AS t USING (SELECT ? AS id) AS s ON t.id = s.id
      WHEN NOT MATCHED THEN INSERT (id) VALUES (s.id);
    SELECT CAST(value AS INT) AS value FROM OPENJSON(?);
    SELECT COALESCE(SUM(size), 0) FROM memory_files;
  `;
  assert.equal(quoteReservedIdentifiers(keywords), keywords);
  assert.deepEqual(bareReservedIdentifiers(keywords), []);
});

test('mssql migrations and runtime queries do not use bare T-SQL reserved words as identifiers', () => {
  const failures = [];
  const dir = mssqlMigrationsDir();
  for (const name of mssqlMigrationFiles()) {
    const sql = fs.readFileSync(path.join(dir, name), 'utf8');
    const hits = bareReservedIdentifiers(sql);
    if (hits.length) failures.push(`${name}: ${hits.join(', ')}`);
    if (name === '001_schema.sql') {
      assert.match(sql, /\[file\]\s+NVARCHAR\(80\)/);
      assert.match(sql, /UNIQUE \(\[file\]\)/);
    }
  }

  let scanned = 0;
  for (const file of walk(SERVER)) {
    if (!file.endsWith('.js') || file.endsWith(`${path.sep}reserved.js`)) continue;
    const rel = path.relative(SERVER, file);
    for (const raw of sourceStrings(fs.readFileSync(file, 'utf8'))) {
      const sqlText = stripInterpolations(raw);
      if (!isMssqlQuery(sqlText) && !isMssqlQuery(raw)) continue;
      scanned += 1;
      let executed;
      try {
        executed = withIdentity(translateSql(sqlText));
      } catch (err) {
        failures.push(`${rel}: ${err.message.split('\n')[0]}`);
        continue;
      }
      const hits = bareReservedIdentifiers(executed);
      if (hits.length) {
        failures.push(`${rel}: ${hits.join(', ')} in ${executed.replace(/\s+/g, ' ').slice(0, 180)}`);
      }
    }
  }

  assert.ok(scanned >= 40, `expected the server to contain mssql queries, scanned ${scanned}`);
  assert.deepEqual(failures, []);
});

/** A statement or clause that can reach SQL Server (migrations are scanned separately). */
function isMssqlQuery(text) {
  const trimmed = text.trim();
  if (trimmed.length < 8) return false;
  if (/^ORDER\s+BY\b/i.test(trimmed)) return true;
  return /\b(SELECT|INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER)\b/i.test(trimmed)
    && /\b(FROM|INTO|SET|VALUES|WHERE|JOIN|TABLE|OPENJSON)\b/i.test(trimmed);
}

/** `${expr}` is JavaScript inside a template, not the SQL text prepare() receives. */
function stripInterpolations(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] === '$' && text[i + 1] === '{') {
      i += 2;
      let depth = 1;
      while (i < text.length && depth > 0) {
        if (text[i] === '{') depth += 1;
        else if (text[i] === '}') depth -= 1;
        if (depth > 0) i += 1;
      }
      if (text[i] === '}') i += 1;
      out += 'expr';
      continue;
    }
    out += text[i];
    i += 1;
  }
  return out;
}

function sourceStrings(source) {
  const found = [];
  const n = source.length;
  let i = 0;
  while (i < n) {
    const ch = source[i];
    if (ch === '/' && source[i + 1] === '/') {
      i += 2;
      while (i < n && source[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && source[i + 1] === '*') {
      i += 2;
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) i += 1;
      i = Math.min(n, i + 2);
      continue;
    }
    if (ch === '`' || ch === "'" || ch === '"') {
      const quote = ch;
      i += 1;
      let body = '';
      while (i < n) {
        if (source[i] === '\\') {
          body += source[i] + (source[i + 1] ?? '');
          i += 2;
          continue;
        }
        if (source[i] === quote) {
          i += 1;
          break;
        }
        body += source[i];
        i += 1;
      }
      found.push(body);
      continue;
    }
    i += 1;
  }
  return found;
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return [full];
  });
}
