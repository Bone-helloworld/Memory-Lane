/**
 * Messages from the public contact form. Kept apart from albums: a visitor
 * does not need an account, and deleting an account must not touch these rows.
 *
 * The INSERT is plain SQL. SQLite runs it as written. Azure SQL's driver adds
 * OUTPUT INSERTED.id (see server/sql/translate.js) so lastInsertRowid still works.
 */
export function contactModel(db) {
  const insert = db.prepare(
    'INSERT INTO contact_messages (kind, name, email, message, ip) VALUES (?, ?, ?, ?, ?)',
  );
  // lower() and CASE exist in both SQLite and T-SQL, so this is not rewritten.
  const recent = db.prepare(
    `SELECT COALESCE(SUM(CASE WHEN lower(email) = ? THEN 1 ELSE 0 END), 0) AS by_email,
            COALESCE(SUM(CASE WHEN ip = ? THEN 1 ELSE 0 END), 0) AS by_ip
       FROM contact_messages
      WHERE created_at >= ?`,
  );

  return {
    /** Notes since `since` (ISO-8601) for this email and this IP, counted separately. */
    recentCounts(email, ip, since) {
      const row = recent.get(email, ip, since) ?? {};
      return { byEmail: Number(row.by_email ?? 0), byIp: Number(row.by_ip ?? 0) };
    },

    create({ kind, name, email, message, ip }) {
      const info = insert.run(kind, name, email, message, ip || '');
      return Number(info.lastInsertRowid);
    },
  };
}
