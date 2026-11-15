/** Replace `?` placeholders with `@p0`, `@p1`, … outside of string literals. */
export function assignParameters(sql) {
  let index = 0;
  let out = '';
  let inString = false;
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    if (inString) {
      out += ch;
      if (ch === "'" && sql[i + 1] === "'") {
        out += sql[i + 1];
        i += 1;
        continue;
      }
      if (ch === "'") inString = false;
      continue;
    }
    if (ch === "'") {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === '?') {
      out += `@p${index}`;
      index += 1;
      continue;
    }
    out += ch;
  }
  return out;
}
