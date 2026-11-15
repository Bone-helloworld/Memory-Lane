/**
 * Messages from the public contact form. Kept apart from albums: a visitor
 * does not need an account, and deleting an account must not touch these rows.
 *
 * The INSERT is plain SQL. SQLite runs it as written. Azure SQL's driver adds
 * OUTPUT INSERTED.id (see server/sql/translate.js) so lastInsertRowid still works.
 */
export function contactModel(db) {
  const insert = db.prepare(
    'INSERT INTO contact_messages (kind, name, email, message) VALUES (?, ?, ?, ?)',
  );

  return {
    create({ kind, name, email, message }) {
      const info = insert.run(kind, name, email, message);
      return Number(info.lastInsertRowid);
    },
  };
}
