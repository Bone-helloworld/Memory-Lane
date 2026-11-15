/**
 * T-SQL reserved keywords (SQL Server / Azure SQL).
 * https://learn.microsoft.com/en-us/sql/t-sql/language-elements/reserved-keywords-transact-sql
 * A bare one of these used as a column, table, or alias is a syntax error (`Incorrect syntax near the keyword …`).
 * SQLite accepts them unquoted, so the app's statements stay as they are and only the mssql path brackets them.
 */

const TSQL_RESERVED_WORDS = [
  'ADD', 'ALL', 'ALTER', 'AND', 'ANY', 'AS', 'ASC', 'AUTHORIZATION', 'BACKUP', 'BEGIN',
  'BETWEEN', 'BREAK', 'BROWSE', 'BULK', 'BY', 'CASCADE', 'CASE', 'CHECK', 'CHECKPOINT', 'CLOSE',
  'CLUSTERED', 'COALESCE', 'COLLATE', 'COLUMN', 'COMMIT', 'COMPUTE', 'CONSTRAINT', 'CONTAINS', 'CONTAINSTABLE', 'CONTINUE',
  'CONVERT', 'CREATE', 'CROSS', 'CURRENT', 'CURRENT_DATE', 'CURRENT_TIME', 'CURRENT_TIMESTAMP', 'CURRENT_USER', 'CURSOR', 'DATABASE',
  'DBCC', 'DEALLOCATE', 'DECLARE', 'DEFAULT', 'DELETE', 'DENY', 'DESC', 'DISK', 'DISTINCT', 'DISTRIBUTED',
  'DOUBLE', 'DROP', 'DUMP', 'ELSE', 'END', 'ERRLVL', 'ESCAPE', 'EXCEPT', 'EXEC', 'EXECUTE',
  'EXISTS', 'EXIT', 'EXTERNAL', 'FETCH', 'FILE', 'FILLFACTOR', 'FOR', 'FOREIGN', 'FREETEXT', 'FREETEXTTABLE',
  'FROM', 'FULL', 'FUNCTION', 'GOTO', 'GRANT', 'GROUP', 'HAVING', 'HOLDLOCK', 'IDENTITY', 'IDENTITY_INSERT',
  'IDENTITYCOL', 'IF', 'IN', 'INDEX', 'INNER', 'INSERT', 'INTERSECT', 'INTO', 'IS', 'JOIN',
  'KEY', 'KILL', 'LEFT', 'LIKE', 'LINENO', 'LOAD', 'MERGE', 'NATIONAL', 'NOCHECK', 'NONCLUSTERED',
  'NOT', 'NULL', 'NULLIF', 'OF', 'OFF', 'OFFSETS', 'ON', 'OPEN', 'OPENDATASOURCE', 'OPENQUERY',
  'OPENROWSET', 'OPENXML', 'OPTION', 'OR', 'ORDER', 'OUTER', 'OVER', 'PERCENT', 'PIVOT', 'PLAN',
  'PRECISION', 'PRIMARY', 'PRINT', 'PROC', 'PROCEDURE', 'PUBLIC', 'RAISERROR', 'READ', 'READTEXT', 'RECONFIGURE',
  'REFERENCES', 'REPLICATION', 'RESTORE', 'RESTRICT', 'RETURN', 'REVERT', 'REVOKE', 'RIGHT', 'ROLLBACK', 'ROWCOUNT',
  'ROWGUIDCOL', 'RULE', 'SAVE', 'SCHEMA', 'SECURITYAUDIT', 'SELECT', 'SEMANTICKEYPHRASETABLE', 'SEMANTICSIMILARITYDETAILSTABLE', 'SEMANTICSIMILARITYTABLE', 'SESSION_USER',
  'SET', 'SETUSER', 'SHUTDOWN', 'SOME', 'STATISTICS', 'SYSTEM_USER', 'TABLE', 'TABLESAMPLE', 'TEXTSIZE', 'THEN',
  'TO', 'TOP', 'TRAN', 'TRANSACTION', 'TRIGGER', 'TRUNCATE', 'TRY_CONVERT', 'TSEQUAL', 'UNION', 'UNIQUE',
  'UNPIVOT', 'UPDATE', 'UPDATETEXT', 'USE', 'USER', 'VALUES', 'VARYING', 'VIEW', 'WAITFOR', 'WHEN',
  'WHERE', 'WHILE', 'WITH', 'WRITETEXT',
];

export const TSQL_RESERVED = new Set(TSQL_RESERVED_WORDS);

/** Words that can legally sit where a name might, and must stay keywords. */
const CLAUSE_OR_EXPR = new Set([
  'SELECT', 'CASE', 'NOT', 'NULL', 'EXISTS', 'ALL', 'DISTINCT', 'TOP',
  'CONVERT', 'COALESCE', 'NULLIF',
  'CURRENT_USER', 'CURRENT_TIMESTAMP', 'CURRENT_DATE', 'CURRENT_TIME',
  'SESSION_USER', 'SYSTEM_USER',
  // MERGE … THEN INSERT / UPDATE / DELETE
  'INSERT', 'UPDATE', 'DELETE',
  // CREATE TABLE (…, CONSTRAINT …) and CREATE OR ALTER
  'CONSTRAINT', 'PRIMARY', 'FOREIGN', 'UNIQUE', 'ALTER',
]);

/** The next word is a name: FROM t, SELECT col, BY col, SET col, WHERE col, AND col, … */
const NAME_INTRODUCER = new Set([
  'FROM', 'JOIN', 'INTO', 'UPDATE', 'TABLE', 'VIEW', 'TRIGGER',
  'PROCEDURE', 'PROC', 'FUNCTION', 'INDEX',
  'BY', 'SELECT', 'DISTINCT',
  'WHERE', 'AND', 'OR', 'HAVING',
  'WHEN', 'THEN', 'ELSE',
  'SET',
]);

/** `AS BEGIN` is a trigger body, not an alias. `AS SELECT` would be a view. */
const NOT_AN_ALIAS = new Set([
  'BEGIN', 'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'WITH', 'MERGE', 'SET',
  'DECLARE', 'IF', 'RETURN', 'CREATE', 'ALTER', 'DROP', 'EXEC', 'EXECUTE',
  'NATIONAL', 'DOUBLE', 'PRECISION', 'VARYING',
]);

/** Reserved words that follow SET as options (`SET NOCOUNT ON`), not column names. */
const SET_OPTIONS = new Set([
  'NOCOUNT', 'QUOTED_IDENTIFIER', 'ANSI_NULLS', 'ANSI_PADDING', 'ANSI_WARNINGS',
  'ANSI_DEFAULTS', 'ANSI_NULL_DFLT_ON', 'ANSI_NULL_DFLT_OFF', 'ARITHABORT',
  'ARITHIGNORE', 'CONCAT_NULL_YIELDS_NULL', 'NUMERIC_ROUNDABORT', 'XACT_ABORT',
  'IMPLICIT_TRANSACTIONS', 'CURSOR_CLOSE_ON_COMMIT', 'IDENTITY_INSERT', 'ROWCOUNT',
  'STATISTICS', 'TRANSACTION', 'TEXTSIZE', 'OFFSETS', 'DATEFIRST', 'DATEFORMAT',
  'LANGUAGE', 'DEADLOCK_PRIORITY', 'LOCK_TIMEOUT', 'FORCEPLAN',
]);

const DATA_TYPES = new Set([
  'BIGINT', 'INT', 'INTEGER', 'SMALLINT', 'TINYINT', 'BIT',
  'DECIMAL', 'NUMERIC', 'FLOAT', 'REAL', 'MONEY', 'SMALLMONEY',
  'NVARCHAR', 'VARCHAR', 'NCHAR', 'CHAR', 'NTEXT', 'TEXT',
  'VARBINARY', 'BINARY', 'IMAGE', 'DATE', 'DATETIME', 'DATETIME2',
  'SMALLDATETIME', 'TIME', 'DATETIMEOFFSET', 'UNIQUEIDENTIFIER',
  'XML', 'SQL_VARIANT', 'ROWVERSION',
]);

const COMPARATORS = new Set(['=', '<', '>', '<=', '>=', '<>', '!=']);

/**
 * Reserved words that are written as names (column, table, alias), not as grammar.
 * Strings, comments, and `[already]` delimited identifiers are skipped.
 * → `['file', …]` in source order.
 */
export function bareReservedIdentifiers(sql) {
  const tokens = tokenize(sql);
  const found = [];
  for (let i = 0; i < tokens.length; i += 1) {
    if (usedAsIdentifier(tokens, i)) found.push(tokens[i].text);
  }
  return found;
}

/** Bracket each bare reserved identifier: `file` → `[file]`. Keywords stay bare. Idempotent. */
export function quoteReservedIdentifiers(sql) {
  const tokens = tokenize(sql);
  let out = '';
  let cursor = 0;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    out += sql.slice(cursor, token.start);
    if (usedAsIdentifier(tokens, i)) out += `[${token.text}]`;
    else out += sql.slice(token.start, token.end);
    cursor = token.end;
  }
  out += sql.slice(cursor);
  return out;
}

function usedAsIdentifier(tokens, index) {
  const token = tokens[index];
  if (token.type !== 'word') return false;
  const upper = token.text.toUpperCase();
  if (!TSQL_RESERVED.has(upper)) return false;

  const prevIndex = neighborIndex(tokens, index, -1);
  const nextIndex = neighborIndex(tokens, index, 1);
  const prev = prevIndex >= 0 ? tokens[prevIndex] : null;
  const next = nextIndex >= 0 ? tokens[nextIndex] : null;
  const prevU = prev?.type === 'word' ? prev.text.toUpperCase() : null;
  const nextU = next?.type === 'word' ? next.text.toUpperCase() : null;
  const prevRaw = prev?.type === 'punct' ? prev.text : null;
  const nextRaw = next?.type === 'punct' ? next.text : null;

  // CONVERT(, COALESCE(, CHECK (, UNIQUE (, IN (, PRIMARY KEY (, VALUES (, IDENTITY(, EXISTS (, LEFT(
  if (nextRaw === '(') return false;

  // schema.table, alias.column, or a reserved name used as a qualifier
  if (prevRaw === '.' || nextRaw === '.') return true;

  // AS file — an alias. AS BEGIN is the trigger body.
  if (prevU === 'AS') return !NOT_AN_ALIAS.has(upper);

  if (prevU === 'SET' && SET_OPTIONS.has(upper)) return false;

  // Column definition: file NVARCHAR(80), or ALTER TABLE … ADD file INT
  if (nextU && DATA_TYPES.has(nextU)) {
    const afterComma = prevRaw === ',' || prevRaw === '(';
    const afterAdd = prevU === 'ADD';
    if (afterComma || afterAdd) return true;
  }

  // file = ?, = file, file < 1. `= NULL` is the keyword, not a column.
  if ((nextRaw && COMPARATORS.has(nextRaw)) || (prevRaw && COMPARATORS.has(prevRaw))) {
    return upper !== 'NULL' && upper !== 'NOT';
  }
  if (nextU === 'LIKE' || nextU === 'IN' || nextU === 'IS' || nextU === 'BETWEEN') {
    return upper !== 'NOT' && upper !== 'AND' && upper !== 'OR';
  }

  // (file, poster) or SELECT a, file — but not (SELECT …), COUNT(DISTINCT …), , CASE
  if (prevRaw === ',' || prevRaw === '(') return !CLAUSE_OR_EXPR.has(upper);

  // SELECT file, FROM file, WHERE file, SET file, ORDER BY file, AND file.
  // A reserved word that is itself a name (`SELECT function FROM t`) must not
  // introduce the following keyword the way `CREATE FUNCTION name` does.
  if (prevU && NAME_INTRODUCER.has(prevU) && !usedAsIdentifier(tokens, prevIndex)) {
    return !CLAUSE_OR_EXPR.has(upper);
  }

  return false;
}

function neighborIndex(tokens, index, dir) {
  let i = index + dir;
  while (i >= 0 && i < tokens.length && tokens[i].type === 'comment') i += dir;
  return i >= 0 && i < tokens.length ? i : -1;
}

function tokenize(sql) {
  const tokens = [];
  const text = String(sql);
  const n = text.length;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  while (i < n) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === '-' && text[i + 1] === '-') {
      const start = i;
      i += 2;
      while (i < n && text[i] !== '\n') i += 1;
      tokens.push({ type: 'comment', start, end: i, text: text.slice(start, i) });
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      const start = i;
      i += 2;
      while (i < n && !(text[i] === '*' && text[i + 1] === '/')) i += 1;
      i = Math.min(n, i + 2);
      tokens.push({ type: 'comment', start, end: i, text: text.slice(start, i) });
      continue;
    }
    if (ch === '[') {
      const start = i;
      i += 1;
      while (i < n) {
        if (text[i] === ']' && text[i + 1] === ']') {
          i += 2;
          continue;
        }
        if (text[i] === ']') {
          i += 1;
          break;
        }
        i += 1;
      }
      tokens.push({ type: 'bracket', start, end: i, text: text.slice(start, i) });
      continue;
    }
    if (ch === "'" || ((ch === 'N' || ch === 'n') && text[i + 1] === "'")) {
      const start = i;
      if (ch === 'N' || ch === 'n') i += 1;
      i += 1;
      while (i < n) {
        if (text[i] === "'" && text[i + 1] === "'") {
          i += 2;
          continue;
        }
        if (text[i] === "'") {
          i += 1;
          break;
        }
        i += 1;
      }
      tokens.push({ type: 'string', start, end: i, text: text.slice(start, i) });
      continue;
    }
    if (ch === '"') {
      const start = i;
      i += 1;
      while (i < n) {
        if (text[i] === '"' && text[i + 1] === '"') {
          i += 2;
          continue;
        }
        if (text[i] === '"') {
          i += 1;
          break;
        }
        i += 1;
      }
      tokens.push({ type: 'quoted', start, end: i, text: text.slice(start, i) });
      continue;
    }
    if (ch === '@') {
      const start = i;
      i += 1;
      if (text[i] === '@') i += 1;
      while (i < n && /[\w$#]/.test(text[i])) i += 1;
      tokens.push({ type: 'variable', start, end: i, text: text.slice(start, i) });
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(text[i + 1] || ''))) {
      const start = i;
      i += 1;
      while (i < n && /[0-9.]/.test(text[i])) i += 1;
      tokens.push({ type: 'number', start, end: i, text: text.slice(start, i) });
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      const start = i;
      i += 1;
      while (i < n && /\w/.test(text[i])) i += 1;
      tokens.push({ type: 'word', start, end: i, text: text.slice(start, i) });
      continue;
    }
    const two = text.slice(i, i + 2);
    if (two === '<>' || two === '<=' || two === '>=' || two === '!=' || two === '||') {
      tokens.push({ type: 'punct', start: i, end: i + 2, text: two });
      i += 2;
      continue;
    }
    tokens.push({ type: 'punct', start: i, end: i + 1, text: ch });
    i += 1;
  }
  return tokens;
}
