/**
 * Holds the Azure SQL pool on a worker thread so the request thread can keep the
 * synchronous `db.prepare()` calls the rest of the server already uses.
 * The main thread blocks on one call at a time (the same shape as node:sqlite).
 */
import { parentPort } from 'node:worker_threads';
import sql from 'mssql';
import { applyMssqlMigrations, mssqlMigrationsDir } from './migrate-mssql.js';
import { mssqlConfig, redactSecret } from './mssql-config.js';
import { assignParameters } from '../sql/params.js';
import { SQL_CONNECT_DELAYS_MS, connectWithRetry, isTransientSqlError } from '../sql/retry.js';

let pool = null;
let tx = null;
let config = {};

if (parentPort) {
  parentPort.on('message', async (msg) => {
    try {
      const result = await dispatch(msg);
      msg.port.postMessage({ ok: true, result });
    } catch (err) {
      msg.port.postMessage(failure(err));
    } finally {
      Atomics.store(msg.shared, 0, 1);
      Atomics.notify(msg.shared, 0);
    }
  });
}

async function dispatch(msg) {
  if (msg.op === 'init') {
    config = msg.config ?? {};
    pool = await connectWithRetry(() => openPool(), {
      delays: SQL_CONNECT_DELAYS_MS,
      onError: (err, attempt) => {
        console.error(
          `Azure SQL connection attempt ${attempt + 1} failed: ${redactSecret(err.message, config.password)}. Retrying while a paused database resumes.`,
        );
      },
    });
    const applied = await applyMssqlMigrations((text, params) => raw(text, params), mssqlMigrationsDir());
    console.log(`Azure SQL ready (schema version ${applied}).`);
    return { ready: true };
  }
  if (msg.op === 'query') return query(msg.sql, msg.params);
  if (msg.op === 'begin') {
    if (tx) throw new Error('A transaction is already open.');
    tx = new sql.Transaction(pool);
    await tx.begin();
    return null;
  }
  if (msg.op === 'commit') {
    await tx.commit();
    tx = null;
    return null;
  }
  if (msg.op === 'rollback') {
    if (tx) {
      try {
        await tx.rollback();
      } finally {
        tx = null;
      }
    }
    return null;
  }
  if (msg.op === 'close') {
    if (tx) {
      try {
        await tx.rollback();
      } catch {
        // Closing anyway.
      }
      tx = null;
    }
    if (pool) await pool.close();
    pool = null;
    return null;
  }
  throw new Error(`Unknown database operation: ${msg.op}`);
}

async function openPool() {
  const next = new sql.ConnectionPool(mssqlConfig(config));
  await next.connect();
  return next;
}

async function query(text, params) {
  try {
    return await raw(text, params);
  } catch (err) {
    if (tx || !isTransientSqlError(err)) throw err;
    console.error(`Azure SQL connection dropped (${redactSecret(err.message, config.password)}). Reconnecting.`);
    try {
      await pool.close();
    } catch {
      // The pool is already unusable.
    }
    pool = await connectWithRetry(() => openPool(), {
      delays: SQL_CONNECT_DELAYS_MS,
      onError: (error, attempt) => {
        console.error(`Azure SQL reconnect attempt ${attempt + 1} failed: ${redactSecret(error.message, config.password)}`);
      },
    });
    return raw(text, params);
  }
}

async function raw(text, params = []) {
  const request = tx ? new sql.Request(tx) : pool.request();
  bind(request, params);
  const result = await request.query(assignParameters(text));
  return {
    rows: normalizeRows(result.recordset),
    rowsAffected: (result.rowsAffected ?? []).reduce((sum, count) => sum + Number(count), 0),
  };
}

function bind(request, params) {
  params.forEach((value, index) => {
    const name = `p${index}`;
    if (value === null || value === undefined) {
      request.input(name, sql.NVarChar(sql.MAX), null);
      return;
    }
    if (typeof value === 'boolean') {
      request.input(name, sql.Bit, value);
      return;
    }
    if (typeof value === 'bigint') {
      request.input(name, sql.BigInt, value);
      return;
    }
    if (typeof value === 'number') {
      if (Number.isInteger(value) && value <= 2147483647 && value >= -2147483648) request.input(name, sql.Int, value);
      else if (Number.isInteger(value)) request.input(name, sql.BigInt, BigInt(value));
      else request.input(name, sql.Float, value);
      return;
    }
    request.input(name, sql.NVarChar(sql.MAX), String(value));
  });
}

const NUMERIC_SQL_TYPES = new Set(['BigInt', 'Decimal', 'Numeric']);
const INTEGER_STRING = /^-?\d+$/;

function sqlTypeName(type) {
  if (!type) return '';
  if (typeof type.name === 'string' && type.name) return type.name;
  if (typeof type.type?.name === 'string') return type.type.name;
  return '';
}

function isNumericSqlColumn(column) {
  const type = column?.type;
  if (!type) return false;
  if (type === sql.BigInt || type === sql.Decimal || type === sql.Numeric) return true;
  return NUMERIC_SQL_TYPES.has(sqlTypeName(type));
}

/**
 * Tedious returns BIGINT as a string (and a JS bigint when the driver already
 * parsed one). Adding that string to a byte count concatenates, so a quota
 * check reads as full. Convert only BigInt/Decimal/Numeric columns — a digit
 * string in an nvarchar column stays text.
 */
export function coerceDriverValue(value, column) {
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && isNumericSqlColumn(column) && INTEGER_STRING.test(value)) return Number(value);
  return value;
}

export function normalizeRows(rows) {
  if (!rows) return [];
  const columns = rows.columns ?? {};
  return rows.map((row) => {
    const out = {};
    for (const [key, value] of Object.entries(row)) {
      out[key] = coerceDriverValue(value, columns[key]);
    }
    return out;
  });
}

function failure(err) {
  const number = err.number ?? err.originalError?.number;
  return {
    ok: false,
    message: redactSecret(err.message, config.password),
    number,
    code: err.code,
    errcode: number === 2627 || number === 2601 ? 2067 : undefined,
  };
}
