import { likePattern } from '../lib/text.js';
import { fullYearsBetween } from '../../shared/dates.js';

// linked_name: the person's own account, once they accepted your invite (see models/social.js).
const SELECT = `
  SELECT p.*, lu.name AS linked_name,
         (SELECT COUNT(*) FROM person_notes n WHERE n.person_id = p.id) AS note_count,
         (SELECT MAX(n.created_at) FROM person_notes n WHERE n.person_id = p.id) AS last_note_at,
         (SELECT COUNT(*) FROM memory_people mp WHERE mp.person_id = p.id) AS memory_count
    FROM people p LEFT JOIN users lu ON lu.id = p.linked_user_id`;

// Longest time without contact first; people with no recorded contact go last.
const ORDER = 'ORDER BY p.last_contact IS NULL, p.last_contact ASC, p.name COLLATE NOCASE';

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

export function toPerson(row) {
  return {
    id: row.id,
    name: row.name,
    relation: row.relation,
    lastContact: row.last_contact,
    closeness: row.closeness,
    color: row.color,
    noteCount: row.note_count,
    lastNoteAt: row.last_note_at,
    memoryCount: row.memory_count,
    linked: row.linked_user_id ? { id: row.linked_user_id, name: row.linked_name } : null,
    createdAt: row.created_at,
  };
}

const toNote = (row) => ({ id: row.id, body: row.body, createdAt: row.created_at });

export function peopleModel(db) {
  const owns = (userId, id) => Boolean(db.prepare('SELECT 1 FROM people WHERE id = ? AND user_id = ?').get(id, userId));

  return {
    /** q matches name, relation and the text of their notes — without accents. */
    list(userId, { q, limit = 1000 } = {}) {
      if (!q) return db.prepare(`${SELECT} WHERE p.user_id = ? ${ORDER} LIMIT ?`).all(userId, limit).map(toPerson);
      const pattern = likePattern(q);
      return db
        .prepare(
          `${SELECT}
            WHERE p.user_id = ?
              AND (fold(p.name || ' ' || p.relation) LIKE ? ESCAPE '\\'
                   OR EXISTS (SELECT 1 FROM person_notes n WHERE n.person_id = p.id AND fold(n.body) LIKE ? ESCAPE '\\'))
            ${ORDER} LIMIT ?`,
        )
        .all(userId, pattern, pattern, limit)
        .map(toPerson);
    },

    get(userId, id) {
      const row = db.prepare(`${SELECT} WHERE p.id = ? AND p.user_id = ?`).get(id, userId);
      return row ? toPerson(row) : null;
    },

    count(userId) {
      return db.prepare('SELECT COUNT(*) AS n FROM people WHERE user_id = ?').get(userId).n;
    },

    create(userId, data) {
      const { lastInsertRowid } = db
        .prepare('INSERT INTO people (user_id, name, relation, last_contact, closeness, color) VALUES (?, ?, ?, ?, ?, ?)')
        .run(userId, data.name, data.relation, data.lastContact, data.closeness, data.color);
      return Number(lastInsertRowid);
    },

    update(userId, id, data) {
      const { changes } = db
        .prepare(
          `UPDATE people SET name = ?, relation = ?, last_contact = ?, closeness = ?, color = ?, updated_at = ${NOW}
            WHERE id = ? AND user_id = ?`,
        )
        .run(data.name, data.relation, data.lastContact, data.closeness, data.color, id, userId);
      return Number(changes) > 0;
    },

    remove(userId, id) {
      const { changes } = db.prepare('DELETE FROM people WHERE id = ? AND user_id = ?').run(id, userId);
      return Number(changes) > 0;
    },

    setLastContact(userId, id, date) {
      const { changes } = db
        .prepare(`UPDATE people SET last_contact = ?, updated_at = ${NOW} WHERE id = ? AND user_id = ?`)
        .run(date, id, userId);
      return Number(changes) > 0;
    },

    notes(personId) {
      return db
        .prepare('SELECT * FROM person_notes WHERE person_id = ? ORDER BY created_at DESC, id DESC')
        .all(personId)
        .map(toNote);
    },

    addNote(userId, personId, body) {
      if (!owns(userId, personId)) return null;
      const { lastInsertRowid } = db
        .prepare('INSERT INTO person_notes (person_id, body) VALUES (?, ?)')
        .run(personId, body);
      return toNote(db.prepare('SELECT * FROM person_notes WHERE id = ?').get(Number(lastInsertRowid)));
    },

    removeNote(userId, personId, noteId) {
      if (!owns(userId, personId)) return false;
      const { changes } = db.prepare('DELETE FROM person_notes WHERE id = ? AND person_id = ?').run(noteId, personId);
      return Number(changes) > 0;
    },

    /**
     * The sidebar nudge: the person you have neither contacted nor written about for the longest
     * time (at least a year). "Last touch" = the later of last contact and the newest note.
     */
    suggestion(userId, today) {
      const rows = db
        .prepare(
          `SELECT p.id, p.name, p.color,
                  MAX(COALESCE(p.last_contact, ''), COALESCE(substr(MAX(n.created_at), 1, 10), '')) AS last_touch
             FROM people p LEFT JOIN person_notes n ON n.person_id = p.id
            WHERE p.user_id = ?
            GROUP BY p.id`,
        )
        .all(userId)
        .filter((row) => row.last_touch)
        .map((row) => ({ person: { id: row.id, name: row.name, color: row.color }, lastTouch: row.last_touch }))
        .map((entry) => ({ ...entry, years: fullYearsBetween(entry.lastTouch, today) }))
        .filter((entry) => entry.years >= 1)
        .sort((a, b) => a.lastTouch.localeCompare(b.lastTouch));
      return rows[0] ?? null;
    },
  };
}
