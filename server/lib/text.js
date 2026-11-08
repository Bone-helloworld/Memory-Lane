// "Fold" text for Vietnamese-friendly search: lower-case and strip every diacritic,
// so typing "da lat" finds "Đà Lạt" and "tet o que" finds "Tết ở quê".
export function fold(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // combining accents (à, ạ, ế …)
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

/** Turn a user query into a safe LIKE pattern (used with ESCAPE '\'). */
export function likePattern(query) {
  return `%${fold(query).trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
