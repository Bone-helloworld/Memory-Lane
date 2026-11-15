/**
 * Messages from the public contact form. Kept apart from albums: a visitor
 * does not need an account, and deleting an account must not touch these rows.
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
