/**
 * Public shape of a user — never includes the password hash. Works with a full users row
 * and with the slimmer row of a session (which has has_password instead of the hash).
 */
export function toUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    locale: row.locale,
    createdAt: row.created_at,
    // Accounts created with Google have no password until the owner sets one in Settings.
    hasPassword: 'has_password' in row ? Boolean(row.has_password) : Boolean(row.password_hash),
    google: row.google_email ? { email: row.google_email } : null,
  };
}

export function usersModel(db) {
  return {
    byEmail: (email) => db.prepare('SELECT * FROM users WHERE email = ?').get(email),
    byId: (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id),
    byGoogleSub: (sub) => db.prepare('SELECT * FROM users WHERE google_sub = ?').get(sub),

    /** passwordHash '' = no password (an account created with Google). google: { sub, email } */
    create({ email, name, passwordHash, locale, google = null }) {
      const { lastInsertRowid } = db
        .prepare('INSERT INTO users (email, name, password_hash, locale, google_sub, google_email) VALUES (?, ?, ?, ?, ?, ?)')
        .run(email, name, passwordHash, locale, google?.sub ?? null, google?.email ?? null);
      return Number(lastInsertRowid);
    },

    linkGoogle(id, { sub, email }) {
      db.prepare('UPDATE users SET google_sub = ?, google_email = ? WHERE id = ?').run(sub, email, id);
    },

    unlinkGoogle(id) {
      db.prepare('UPDATE users SET google_sub = NULL, google_email = NULL WHERE id = ?').run(id);
    },

    update(id, { name, locale }) {
      db.prepare('UPDATE users SET name = ?, locale = ? WHERE id = ?').run(name, locale, id);
    },

    setPassword(id, passwordHash) {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, id);
    },

    /** ON DELETE CASCADE removes the user's sessions, memories, people, notes and media too. */
    remove(id) {
      db.prepare('DELETE FROM users WHERE id = ?').run(id);
    },
  };
}
