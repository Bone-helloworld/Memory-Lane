import { transaction } from '../db.js';
import { likePattern } from '../lib/text.js';
import { dayOfYearDistance } from '../../shared/dates.js';

// Each memory comes with its photos/videos (in order), the people tagged in it, its owner,
// and how many people it is shared with — all in one query, packed as JSON by SQLite.
const SELECT = `
  SELECT m.*, u.name AS owner_name,
         (SELECT json_group_array(json_object('id', f.id, 'kind', f.kind, 'file', f.file, 'poster', f.poster,
                                              'width', f.width, 'height', f.height, 'duration', f.duration))
            FROM (SELECT * FROM memory_files WHERE memory_id = m.id ORDER BY position, id) AS f) AS files_json,
         (SELECT json_group_array(json_object('id', p.id, 'name', p.name, 'color', p.color))
            FROM memory_people mp JOIN people p ON p.id = mp.person_id
           WHERE mp.memory_id = m.id) AS people_json,
         (SELECT COUNT(*) FROM shares s WHERE s.memory_id = m.id) AS share_count,
         (SELECT COUNT(*) FROM comments c WHERE c.memory_id = m.id) AS comment_count
    FROM memories m JOIN users u ON u.id = m.user_id`;

// Newest first; memories that only have a year sort after dated ones of the same year.
const ORDER = 'ORDER BY m.year DESC, m.month DESC NULLS LAST, m.day DESC NULLS LAST, m.id DESC';

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

const fileUrl = (name) => (name ? `/api/files/${name}` : null);

/** DB row → JSON sent to the browser. Files are only reachable through the protected /api/files route. */
export function toMemory(row, viewerId) {
  const files = JSON.parse(row.files_json || '[]').map((f) => ({
    id: f.id,
    kind: f.kind,
    url: fileUrl(f.file),
    posterUrl: fileUrl(f.poster),
    width: f.width,
    height: f.height,
    duration: f.duration,
  }));
  const isOwner = viewerId === undefined || viewerId === row.user_id;
  return {
    id: row.id,
    title: row.title,
    story: row.story,
    place: row.place,
    year: row.year,
    month: row.month,
    day: row.day,
    scene: row.scene,
    files,
    cover: files[0] ?? null,
    people: JSON.parse(row.people_json || '[]').sort((a, b) => a.name.localeCompare(b.name, 'vi')),
    owner: { id: row.user_id, name: row.owner_name },
    access: isOwner ? 'owner' : 'shared',
    // Only the owner learns how many people can see a memory.
    shareCount: isOwner ? row.share_count : undefined,
    commentCount: row.comment_count,
    sharedAt: row.shared_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function memoriesModel(db) {
  const many = (sql, ...params) => db.prepare(sql).all(...params).map((row) => toMemory(row));

  const owns = (userId, memoryId) =>
    Boolean(db.prepare('SELECT 1 FROM memories WHERE id = ? AND user_id = ?').get(memoryId, userId));

  /** Replace the people tagged in a memory — silently ignoring ids owned by someone else. */
  function setPeople(userId, memoryId, personIds = []) {
    db.prepare('DELETE FROM memory_people WHERE memory_id = ?').run(memoryId);
    if (!personIds.length) return;
    db.prepare(
      `INSERT INTO memory_people (memory_id, person_id)
       SELECT ?, id FROM people WHERE user_id = ? AND id IN (SELECT value FROM json_each(?))`,
    ).run(memoryId, userId, JSON.stringify(personIds));
  }

  /** Every file on disk that belongs to a memory: its photos/videos and the keepsake cards made from it. */
  function fileNamesOf(memoryId) {
    return [
      ...db.prepare('SELECT file AS a, poster AS b FROM memory_files WHERE memory_id = ?').all(memoryId),
      ...db.prepare('SELECT file AS a, preview AS b FROM artifacts WHERE memory_id = ?').all(memoryId),
    ].flatMap((row) => [row.a, row.b].filter(Boolean));
  }

  return {
    owns,

    /**
     * Your own memories. filters.year: { exact: 2019 } | { before: 2009 } · filters.q: accent-insensitive text ·
     * filters.personId: only memories this person appears in · filters.sharedOnly: only ones shared with someone.
     */
    list(userId, { year, q, personId, sharedOnly = false, limit = 1000 } = {}) {
      const where = ['m.user_id = ?'];
      const params = [userId];
      if (year?.exact) {
        where.push('m.year = ?');
        params.push(year.exact);
      } else if (year?.before) {
        where.push('m.year < ?');
        params.push(year.before);
      }
      if (q) {
        where.push(`fold(m.title || ' ' || m.place || ' ' || m.story) LIKE ? ESCAPE '\\'`);
        params.push(likePattern(q));
      }
      if (personId) {
        where.push('EXISTS (SELECT 1 FROM memory_people mp WHERE mp.memory_id = m.id AND mp.person_id = ?)');
        params.push(personId);
      }
      if (sharedOnly) where.push('EXISTS (SELECT 1 FROM shares s WHERE s.memory_id = m.id)');
      return many(`${SELECT} WHERE ${where.join(' AND ')} ${ORDER} LIMIT ?`, ...params, limit);
    },

    /** A memory you own, or one somebody shared with you. Anything else → null (the API answers 404). */
    get(viewerId, id) {
      const row = db
        .prepare(
          `${SELECT} WHERE m.id = ?
             AND (m.user_id = ? OR EXISTS (SELECT 1 FROM shares s WHERE s.memory_id = m.id AND s.user_id = ?))`,
        )
        .get(id, viewerId, viewerId);
      if (!row) return null;
      const memory = toMemory(row, viewerId);
      if (memory.access === 'shared') {
        memory.sharedAt = db.prepare('SELECT created_at FROM shares WHERE memory_id = ? AND user_id = ?').get(id, viewerId)?.created_at;
      }
      return memory;
    },

    /** Memories other people shared with you, most recently shared first. */
    sharedWith(viewerId, { limit = 200 } = {}) {
      return db
        .prepare(
          `SELECT * FROM (${SELECT}) AS x
             JOIN (SELECT memory_id, created_at AS shared_at FROM shares WHERE user_id = ?) AS s ON s.memory_id = x.id
           ORDER BY s.shared_at DESC LIMIT ?`,
        )
        .all(viewerId, limit)
        .map((row) => toMemory(row, viewerId));
    },

    countSharedWith(viewerId) {
      return db.prepare('SELECT COUNT(*) AS n FROM shares WHERE user_id = ?').get(viewerId).n;
    },

    /** When something was last shared with this user (the navigation shows a dot for news). */
    latestSharedAt(viewerId) {
      return db.prepare('SELECT MAX(created_at) AS at FROM shares WHERE user_id = ?').get(viewerId).at ?? null;
    },

    /** How many memories per year — drives the year scrubber. */
    years(userId) {
      return db
        .prepare('SELECT year, COUNT(*) AS count FROM memories WHERE user_id = ? GROUP BY year ORDER BY year DESC')
        .all(userId);
    },

    count(userId) {
      return db.prepare('SELECT COUNT(*) AS n FROM memories WHERE user_id = ?').get(userId).n;
    },

    create(userId, data) {
      return transaction(db, () => {
        const { lastInsertRowid } = db
          .prepare(
            `INSERT INTO memories (user_id, title, story, place, year, month, day, scene)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(userId, data.title, data.story, data.place, data.year, data.month, data.day, data.scene);
        const id = Number(lastInsertRowid);
        setPeople(userId, id, data.peopleIds);
        return id;
      });
    },

    update(userId, id, data) {
      return transaction(db, () => {
        const { changes } = db
          .prepare(
            `UPDATE memories
                SET title = ?, story = ?, place = ?, year = ?, month = ?, day = ?, updated_at = ${NOW}
              WHERE id = ? AND user_id = ?`,
          )
          .run(data.title, data.story, data.place, data.year, data.month, data.day, id, userId);
        if (!Number(changes)) return false;
        setPeople(userId, id, data.peopleIds);
        return true;
      });
    },

    /** Deletes a memory you own (and, by cascade, the cards made from it) → names of its files to remove from disk, or null. */
    remove(userId, id) {
      if (!owns(userId, id)) return null;
      const names = fileNamesOf(id);
      db.prepare('DELETE FROM memories WHERE id = ? AND user_id = ?').run(id, userId);
      return names;
    },

    // ---- photos & videos ----

    fileCount(memoryId) {
      return db.prepare('SELECT COUNT(*) AS n FROM memory_files WHERE memory_id = ?').get(memoryId).n;
    },

    /** Bytes stored by a user (the storage quota): memory photos and videos + photos of artifacts. */
    storageUsed(userId) {
      return db
        .prepare(
          `SELECT (SELECT COALESCE(SUM(size), 0) FROM memory_files WHERE user_id = ?)
                + (SELECT COALESCE(SUM(size), 0) FROM artifacts WHERE user_id = ?) AS n`,
        )
        .get(userId, userId).n;
    },

    addFile(userId, memoryId, file) {
      return transaction(db, () => {
        const { next } = db
          .prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM memory_files WHERE memory_id = ?')
          .get(memoryId);
        const { lastInsertRowid } = db
          .prepare(
            `INSERT INTO memory_files (memory_id, user_id, kind, file, poster, width, height, duration, size, position)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(memoryId, userId, file.kind, file.file, file.poster, file.width, file.height, file.duration, file.size, next);
        db.prepare(`UPDATE memories SET updated_at = ${NOW} WHERE id = ?`).run(memoryId);
        return Number(lastInsertRowid);
      });
    },

    /** Removes one file of a memory you own → [file, poster] names to delete from disk, or null. */
    removeFile(userId, memoryId, fileId) {
      const row = db
        .prepare('SELECT file, poster FROM memory_files WHERE id = ? AND memory_id = ? AND user_id = ?')
        .get(fileId, memoryId, userId);
      if (!row) return null;
      db.prepare('DELETE FROM memory_files WHERE id = ?').run(fileId);
      db.prepare(`UPDATE memories SET updated_at = ${NOW} WHERE id = ?`).run(memoryId);
      return [row.file, row.poster].filter(Boolean);
    },

    /** Sets the order of a memory's files; the first one becomes the cover. */
    reorderFiles(userId, memoryId, fileIds) {
      if (!owns(userId, memoryId)) return false;
      transaction(db, () => {
        const update = db.prepare('UPDATE memory_files SET position = ? WHERE id = ? AND memory_id = ?');
        fileIds.forEach((fileId, index) => update.run(index, fileId, memoryId));
      });
      return true;
    },

    /** May this viewer see this photo/video file (or video poster)? Owner or someone it was shared with. */
    canViewFile(viewerId, name) {
      return Boolean(
        db
          .prepare(
            `SELECT 1 FROM memory_files f JOIN memories m ON m.id = f.memory_id
              WHERE (f.file = ? OR f.poster = ?)
                AND (m.user_id = ? OR EXISTS (SELECT 1 FROM shares s WHERE s.memory_id = m.id AND s.user_id = ?))`,
          )
          .get(name, name, viewerId, viewerId),
      );
    },

    /** Every file name a user owns (account deletion). */
    allFileNames(userId) {
      return db
        .prepare('SELECT file, poster FROM memory_files WHERE user_id = ?')
        .all(userId)
        .flatMap((row) => [row.file, row.poster].filter(Boolean));
    },

    // ---- "Today" ----

    /** Memories from earlier years whose month/day is within `windowDays` of today. */
    onThisDay(userId, today, windowDays = 3) {
      const [year, month, day] = today.split('-').map(Number);
      return many(`${SELECT} WHERE m.user_id = ? AND m.year < ? AND m.day IS NOT NULL`, userId, year)
        .map((memory) => ({ memory, distance: dayOfYearDistance(memory.month, memory.day, month, day) }))
        .filter((entry) => entry.distance <= windowDays)
        .sort((a, b) => a.distance - b.distance || b.memory.year - a.memory.year)
        .map((entry) => entry.memory);
    },

    sameMonth(userId, today, limit) {
      const [year, month] = today.split('-').map(Number);
      return many(`${SELECT} WHERE m.user_id = ? AND m.month = ? AND m.year < ? ${ORDER} LIMIT ?`, userId, month, year, limit);
    },

    random(userId, limit) {
      return many(`${SELECT} WHERE m.user_id = ? ORDER BY random() LIMIT ?`, userId, limit);
    },

    /** One memory to feature — prefers ones with a photo. */
    featured(userId) {
      const row = db
        .prepare(
          `${SELECT} WHERE m.user_id = ?
           ORDER BY NOT EXISTS (SELECT 1 FROM memory_files f WHERE f.memory_id = m.id AND f.kind = 'image'), random()
           LIMIT 1`,
        )
        .get(userId);
      return row ? toMemory(row) : null;
    },
  };
}
