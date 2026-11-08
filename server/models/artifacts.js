import { likePattern } from '../lib/text.js';

const fileUrl = (name) => (name ? `/api/files/${name}` : null);

// Each card comes with the memory it was made from (one query).
const SELECT = `
  SELECT a.*, m.title AS memory_title, m.year AS memory_year, m.month AS memory_month, m.day AS memory_day
    FROM artifacts a JOIN memories m ON m.id = a.memory_id`;

/** DB row → JSON for the browser. The images are only reachable through the protected /api/files route. */
export function toArtifact(row) {
  return {
    id: row.id,
    kind: row.kind,
    style: row.style,
    title: row.title,
    line: row.line,
    message: row.message,
    recipient: row.recipient,
    imageUrl: fileUrl(row.file),
    previewUrl: fileUrl(row.preview ?? row.file),
    width: row.width,
    height: row.height,
    memory: { id: row.memory_id, title: row.memory_title, year: row.memory_year, month: row.memory_month, day: row.memory_day },
    createdAt: row.created_at,
  };
}

/**
 * Artifacts ("Kỷ vật"): the keepsake cards — postcards, stamps, photo cards — made from your own
 * memories and kept. Private to their owner: never shared, their images served only to the owner.
 */
export function artifactsModel(db) {
  return {
    /** Oldest first (the order they were kept) — the page numbers them "No. 001, 002…". */
    list(userId, { kind, q, limit = 1000 } = {}) {
      const where = ['a.user_id = ?'];
      const params = [userId];
      if (kind) {
        where.push('a.kind = ?');
        params.push(kind);
      }
      if (q) {
        where.push(`fold(a.title || ' ' || a.line || ' ' || a.message || ' ' || a.recipient || ' ' || m.title) LIKE ? ESCAPE '\\'`);
        params.push(likePattern(q));
      }
      return db
        .prepare(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY a.created_at, a.id LIMIT ?`)
        .all(...params, limit)
        .map(toArtifact);
    },

    get(userId, id) {
      const row = db.prepare(`${SELECT} WHERE a.id = ? AND a.user_id = ?`).get(id, userId);
      return row ? toArtifact(row) : null;
    },

    count: (userId) => db.prepare('SELECT COUNT(*) AS n FROM artifacts WHERE user_id = ?').get(userId).n,

    /** The cards made from one of your memories (shown on the memory page, to its owner only). */
    forMemory(userId, memoryId) {
      return db
        .prepare(`${SELECT} WHERE a.memory_id = ? AND a.user_id = ? ORDER BY a.created_at, a.id`)
        .all(memoryId, userId)
        .map((row) => {
          const { id, kind, title, previewUrl } = toArtifact(row);
          return { id, kind, title, previewUrl };
        });
    },

    create(userId, { memoryId, kind, style, title, line, message, recipient, file, preview, width, height, size }) {
      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO artifacts (user_id, memory_id, kind, style, title, line, message, recipient, file, preview, width, height, size)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(userId, memoryId, kind, style, title, line, message, recipient, file, preview, width ?? null, height ?? null, size);
      return Number(lastInsertRowid);
    },

    /** → the file names to delete from disk, or null if it is not yours. */
    remove(userId, id) {
      const row = db.prepare('SELECT file, preview FROM artifacts WHERE id = ? AND user_id = ?').get(id, userId);
      if (!row) return null;
      db.prepare('DELETE FROM artifacts WHERE id = ?').run(id);
      return [row.file, row.preview].filter(Boolean);
    },

    /** May this viewer see this file? Only the owner of the card. */
    canViewFile(viewerId, name) {
      return Boolean(db.prepare('SELECT 1 FROM artifacts WHERE user_id = ? AND (file = ? OR preview = ?)').get(viewerId, name, name));
    },

    /** Every file name a user owns here (account deletion). */
    allFileNames(userId) {
      return db
        .prepare('SELECT file, preview FROM artifacts WHERE user_id = ?')
        .all(userId)
        .flatMap((row) => [row.file, row.preview].filter(Boolean));
    },
  };
}
