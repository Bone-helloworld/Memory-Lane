import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations', 'mssql');

export function mssqlMigrationsDir() {
  return MIGRATIONS_DIR;
}

export function mssqlMigrationFiles(dir = MIGRATIONS_DIR) {
  return fs.readdirSync(dir).filter((file) => file.endsWith('.sql')).sort();
}

/** Split a script on a line that is only `GO`. Comments and the trigger body stay intact. */
export function splitBatches(script) {
  return String(script)
    .replace(/^\uFEFF/, '')
    .split(/^\s*GO\s*$/gim)
    .map((batch) => batch.trim())
    .filter((batch) => batch.replace(/--[^\n]*/g, '').trim());
}

/**
 * Creates dbo.schema_migrations if needed and runs each mssql/*.sql file once.
 * `query(sql, params)` returns `{ rows }`. A file that fails is not recorded, so the next boot tries it again.
 */
export async function applyMssqlMigrations(query, dir = MIGRATIONS_DIR) {
  await query(`
    IF OBJECT_ID(N'dbo.schema_migrations', N'U') IS NULL
    CREATE TABLE dbo.schema_migrations (
      version INT NOT NULL CONSTRAINT PK_schema_migrations PRIMARY KEY,
      name NVARCHAR(200) NOT NULL,
      applied_at NVARCHAR(40) NOT NULL
    );
  `);
  const { rows } = await query('SELECT version FROM dbo.schema_migrations');
  const have = new Set(rows.map((row) => Number(row.version)));
  const files = mssqlMigrationFiles(dir);
  for (let index = 0; index < files.length; index += 1) {
    const version = index + 1;
    if (have.has(version)) continue;
    const script = fs.readFileSync(path.join(dir, files[index]), 'utf8');
    for (const batch of splitBatches(script)) await query(batch);
    await query(
      `INSERT INTO dbo.schema_migrations (version, name, applied_at)
       SELECT @p0, @p1, CONVERT(varchar(23), SYSUTCDATETIME(), 126) + 'Z'
       WHERE NOT EXISTS (SELECT 1 FROM dbo.schema_migrations WHERE version = @p0)`,
      [version, files[index]],
    );
  }
  return files.length;
}
