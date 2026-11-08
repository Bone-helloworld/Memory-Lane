import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { fold } from './lib/text.js';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

/**
 * Opens (or creates) the SQLite database using Node's built-in driver — no native add-on to compile.
 * Pending migrations in server/migrations/*.sql run in order; PRAGMA user_version remembers
 * how many have been applied.
 */
export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
  `);
  // fold('Đà Lạt') = 'da lat' — lets SQL do accent-insensitive Vietnamese search.
  db.function('fold', { deterministic: true }, (value) => fold(value));
  migrate(db);
  return db;
}

function migrate(db) {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  const applied = db.prepare('PRAGMA user_version').get().user_version;
  files.slice(applied).forEach((file, index) => {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    transaction(db, () => {
      db.exec(sql);
      db.exec(`PRAGMA user_version = ${applied + index + 1}`);
    });
  });
}

/** Run fn inside BEGIN/COMMIT; any thrown error rolls everything back. */
export function transaction(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
