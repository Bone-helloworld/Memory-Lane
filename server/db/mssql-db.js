import { translateSql, withIdentity } from '../sql/translate.js';

/**
 * The same prepare/get/all/run/transaction surface as node:sqlite, backed by a synchronous
 * `driver`. Production passes a worker bridge. Tests pass a fake that records the SQL.
 */
export function createMssqlDb(driver) {
  function query(sql, params, mode) {
    const translated = translateSql(sql);
    const text = mode === 'run' ? withIdentity(translated) : translated;
    const result = driver.query(
      text,
      params.map((value) => (value === undefined ? null : value)),
    );
    if (mode === 'run') {
      return {
        changes: Number(result.rowsAffected ?? 0),
        lastInsertRowid: insertedId(result.rows?.[0]),
      };
    }
    return result.rows ?? [];
  }

  const db = {
    dialect: 'mssql',
    prepare(sql) {
      return {
        get: (...params) => query(sql, params, 'get')[0],
        all: (...params) => query(sql, params, 'all'),
        run: (...params) => query(sql, params, 'run'),
      };
    },
    exec(sql) {
      const text = String(sql).trim();
      if (/^BEGIN\b/i.test(text)) return driver.begin();
      if (/^COMMIT\b/i.test(text)) return driver.commit();
      if (/^ROLLBACK\b/i.test(text)) return driver.rollback();
      driver.query(translateSql(text), []);
    },
    transaction(fn) {
      driver.begin();
      try {
        const result = fn();
        driver.commit();
        return result;
      } catch (err) {
        try {
          driver.rollback();
        } catch {
          // The statement error is the one to surface. A failed rollback is logged by the driver.
        }
        throw err;
      }
    },
    close() {},
  };
  return db;
}

function insertedId(row) {
  if (!row) return 0;
  const key = Object.keys(row).find((name) => name.toLowerCase() === 'id');
  const value = key ? row[key] : 0;
  return value == null ? 0 : Number(value);
}
