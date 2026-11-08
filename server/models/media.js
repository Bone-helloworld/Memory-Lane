import { likePattern } from '../lib/text.js';

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

export function toMedia(row) {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    story: row.story,
    owner: row.owner,
    era: row.era,
    url: row.url,
    createdAt: row.created_at,
  };
}

export function mediaModel(db) {
  return {
    list(userId, { kind, q, limit = 1000 } = {}) {
      const where = ['user_id = ?'];
      const params = [userId];
      if (kind) {
        where.push('kind = ?');
        params.push(kind);
      }
      if (q) {
        where.push(`fold(title || ' ' || owner || ' ' || era || ' ' || story) LIKE ? ESCAPE '\\'`);
        params.push(likePattern(q));
      }
      return db
        .prepare(`SELECT * FROM media WHERE ${where.join(' AND ')} ORDER BY created_at DESC, id DESC LIMIT ?`)
        .all(...params, limit)
        .map(toMedia);
    },

    get(userId, id) {
      const row = db.prepare('SELECT * FROM media WHERE id = ? AND user_id = ?').get(id, userId);
      return row ? toMedia(row) : null;
    },

    count(userId) {
      return db.prepare('SELECT COUNT(*) AS n FROM media WHERE user_id = ?').get(userId).n;
    },

    create(userId, data) {
      const { lastInsertRowid } = db
        .prepare('INSERT INTO media (user_id, kind, title, story, owner, era, url) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(userId, data.kind, data.title, data.story, data.owner, data.era, data.url);
      return Number(lastInsertRowid);
    },

    update(userId, id, data) {
      const { changes } = db
        .prepare(
          `UPDATE media SET kind = ?, title = ?, story = ?, owner = ?, era = ?, url = ?, updated_at = ${NOW}
            WHERE id = ? AND user_id = ?`,
        )
        .run(data.kind, data.title, data.story, data.owner, data.era, data.url, id, userId);
      return Number(changes) > 0;
    },

    remove(userId, id) {
      const { changes } = db.prepare('DELETE FROM media WHERE id = ? AND user_id = ?').run(id, userId);
      return Number(changes) > 0;
    },
  };
}
