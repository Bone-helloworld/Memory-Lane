/**
 * Rewrites the app's SQLite statements into T-SQL for Azure SQL.
 * The model files keep one statement; `prepare` on the SQL Server driver runs this first.
 * SQLite itself never sees the rewritten text.
 * Reserved words used as names (`file`, and any other bare T-SQL keyword used as an identifier)
 * are bracketed at the end, so SQL Server accepts the column SQLite already allowed.
 */
import { quoteReservedIdentifiers } from './reserved.js';

const FILES_JSON =
  `(SELECT f.id AS [id], f.kind AS [kind], f.[file] AS [file], f.poster AS [poster], f.width AS [width], f.height AS [height], f.duration AS [duration] FROM memory_files f WHERE f.memory_id = m.id ORDER BY f.position, f.id FOR JSON PATH) AS files_json`;

const PEOPLE_JSON =
  `(SELECT p.id AS [id], p.name AS [name], p.color AS [color] FROM memory_people mp JOIN people p ON p.id = mp.person_id WHERE mp.memory_id = m.id FOR JSON PATH) AS people_json`;

const LAST_TOUCH =
  `CASE WHEN COALESCE(p.last_contact, N'') >= COALESCE(SUBSTRING(MAX(n.created_at), 1, 10), N'') THEN COALESCE(p.last_contact, N'') ELSE COALESCE(SUBSTRING(MAX(n.created_at), 1, 10), N'') END AS last_touch`;

const LEFTOVERS = [
  [/json_group_array/i, 'json_group_array'],
  [/json_object\s*\(/i, 'json_object'],
  [/json_each/i, 'json_each'],
  [/strftime\s*\(/i, 'strftime'],
  [/INSERT\s+OR\s+IGNORE/i, 'INSERT OR IGNORE'],
  [/COLLATE\s+NOCASE/i, 'COLLATE NOCASE'],
  [/NULLS\s+LAST/i, 'NULLS LAST'],
  [/\brandom\s*\(/i, 'random()'],
  [/\bfold\s*\(/i, 'fold()'],
  [/\bsubstr\s*\(/i, 'substr()'],
  [/\|\|/, '||'],
];

/** SQLite text → T-SQL. Throws if a SQLite-only construct is still there, so a new query cannot fail later on Azure. */
export function translateSql(sql) {
  let text = String(sql);
  text = text.replace(
    /\(SELECT\s+json_group_array\(json_object\('id',\s*f\.id,\s*'kind',\s*f\.kind,\s*'file',\s*f\.file,\s*'poster',\s*f\.poster,\s*'width',\s*f\.width,\s*'height',\s*f\.height,\s*'duration',\s*f\.duration\)\)\s*FROM\s+\(SELECT\s+\*\s+FROM\s+memory_files\s+WHERE\s+memory_id\s*=\s*m\.id\s+ORDER\s+BY\s+position,\s*id\)\s+AS\s+f\)\s+AS\s+files_json/gi,
    FILES_JSON,
  );
  text = text.replace(
    /\(SELECT\s+json_group_array\(json_object\('id',\s*p\.id,\s*'name',\s*p\.name,\s*'color',\s*p\.color\)\)\s*FROM\s+memory_people\s+mp\s+JOIN\s+people\s+p\s+ON\s+p\.id\s*=\s*mp\.person_id\s+WHERE\s+mp\.memory_id\s*=\s*m\.id\)\s+AS\s+people_json/gi,
    PEOPLE_JSON,
  );
  text = text.replace(/fold\(([^()]*)\)/g, (_, inner) => `(${inner}) COLLATE Vietnamese_100_CI_AI`);
  text = text.replace(
    /COLLATE Vietnamese_100_CI_AI LIKE \?/g,
    'COLLATE Vietnamese_100_CI_AI LIKE ? COLLATE Vietnamese_100_CI_AI',
  );
  text = text.replace(/\|\|/g, '+');
  text = text.replace(/\+\s*' '\s*\+/g, "+ N' ' +");
  text = text.replaceAll(
    "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
    "(CONVERT(varchar(23), SYSUTCDATETIME(), 126) + 'Z')",
  );
  text = text.replace(/json_each\s*\(/gi, 'OPENJSON(');
  text = text.replace(
    /SELECT\s+value\s+FROM\s+OPENJSON\s*\(/gi,
    'SELECT CAST(value AS INT) AS value FROM OPENJSON(',
  );
  text = translateInsertOrIgnore(text);
  text = text.replace(/\s+COLLATE\s+NOCASE/gi, '');
  text = text.replace(
    /\b([A-Za-z_][\w.]*)\s+DESC\s+NULLS\s+LAST/gi,
    'CASE WHEN $1 IS NULL THEN 1 ELSE 0 END, $1 DESC',
  );
  text = text.replace(
    /\bp\.last_contact\s+IS\s+NULL\b/gi,
    'CASE WHEN p.last_contact IS NULL THEN 1 ELSE 0 END',
  );
  text = text.replace(
    /ORDER BY NOT EXISTS \((SELECT 1 FROM memory_files f WHERE f\.memory_id = m\.id AND f\.kind = 'image')\)\s*,\s*random\(\)/gi,
    'ORDER BY CASE WHEN EXISTS ($1) THEN 0 ELSE 1 END, NEWID()',
  );
  text = text.replace(/\brandom\s*\(\s*\)/gi, 'NEWID()');
  text = text.replace(
    /MAX\(COALESCE\(p\.last_contact,\s*''\),\s*COALESCE\(substr\(MAX\(n\.created_at\),\s*1,\s*10\),\s*''\)\)\s+AS\s+last_touch/gi,
    LAST_TOUCH,
  );
  text = text.replace(/\bsubstr\s*\(/gi, 'SUBSTRING(');
  if (/AS\s+last_touch/i.test(text)) {
    text = text.replace(/GROUP BY p\.id\b(?!\s*,)/gi, 'GROUP BY p.id, p.name, p.color, p.last_contact');
  }
  text = text.replace(/\sLIMIT\s+(\?|\d+)\s*$/i, ' OFFSET 0 ROWS FETCH NEXT $1 ROWS ONLY');

  const leftover = LEFTOVERS.find(([pattern]) => pattern.test(text));
  if (leftover) {
    throw new Error(`SQL Server translation still contains ${leftover[1]}: ${text.slice(0, 240)}`);
  }
  return quoteReservedIdentifiers(text);
}

/**
 * `INSERT OR IGNORE` has no T-SQL twin. `MERGE ... WHEN NOT MATCHED` inserts the row
 * only when that primary key is new, and reports zero rows when it is already there.
 */
function translateInsertOrIgnore(sql) {
  const values = sql.match(/^\s*INSERT\s+OR\s+IGNORE\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)\s*$/i);
  if (values) {
    const [, table, cols, vals] = values;
    const columns = splitList(cols);
    const expressions = splitList(vals);
    return mergeSql(table, columns, expressions.map((expr, i) => `${expr} AS ${columns[i]}`).join(', '), null);
  }
  const selected = sql.match(/^\s*INSERT\s+OR\s+IGNORE\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*SELECT\s+([\s\S]+?)\s+FROM\s+([\s\S]+)$/i);
  if (selected) {
    const [, table, cols, selectList, fromRest] = selected;
    const columns = splitList(cols);
    const expressions = splitList(selectList);
    const projected = expressions.map((expr, i) => `${expr} AS ${columns[i]}`).join(', ');
    return mergeSql(table, columns, `${projected} FROM ${fromRest.trim()}`, 'from');
  }
  return sql;
}

function mergeSql(table, columns, source, shape) {
  const using = shape === 'from' ? source : source;
  const on = columns.map((column) => `t.${column} = s.${column}`).join(' AND ');
  const insertCols = columns.join(', ');
  const insertVals = columns.map((column) => `s.${column}`).join(', ');
  const body = shape === 'from' ? using : using;
  return (
    `MERGE ${table} AS t USING (SELECT ${body}) AS s ON ${on} ` +
    `WHEN NOT MATCHED THEN INSERT (${insertCols}) VALUES (${insertVals});`
  );
}

function splitList(list) {
  return list.split(',').map((part) => part.trim()).filter(Boolean);
}

const IDENTITY_TABLES = new Set([
  'users',
  'memories',
  'people',
  'person_notes',
  'media',
  'memory_files',
  'invites',
  'comments',
  'artifacts',
  'contact_messages',
]);

/** `OUTPUT INSERTED.id` makes an INSERT return the new identity, which SQLite calls lastInsertRowid. */
export function withIdentity(sql) {
  const match = String(sql).match(/^\s*INSERT\s+INTO\s+([A-Za-z_][\w]*)\s*\(/i);
  if (!match || !IDENTITY_TABLES.has(match[1].toLowerCase())) return sql;
  if (/OUTPUT\s+INSERTED/i.test(sql)) return sql;
  return sql.replace(/^(\s*INSERT\s+INTO\s+[A-Za-z_][\w]*\s*\([^)]*\))/i, '$1 OUTPUT INSERTED.id');
}
