import { createHash, randomBytes } from 'node:crypto';
import { transaction } from '../db.js';

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
const hashToken = (token) => createHash('sha256').update(token).digest('hex');

/**
 * Everything that involves two accounts: the circle of connected people, the invite links
 * that create those connections, memories shared inside the circle, and comments.
 */
export function socialModel(db) {
  const connected = (a, b) =>
    Boolean(db.prepare('SELECT 1 FROM connections WHERE user_id = ? AND other_id = ?').get(a, b));

  function connect(a, b) {
    const insert = db.prepare('INSERT OR IGNORE INTO connections (user_id, other_id) VALUES (?, ?)');
    insert.run(a, b);
    insert.run(b, a);
  }

  function inviteStatus(row) {
    if (row.revoked_at) return 'revoked';
    if (row.accepted_at) return 'accepted';
    if (row.expires_at <= new Date().toISOString()) return 'expired';
    return 'pending';
  }

  const INVITES = `
    SELECT i.*, p.name AS person_name, m.title AS memory_title, u.name AS accepted_name
      FROM invites i
      LEFT JOIN people p ON p.id = i.person_id
      LEFT JOIN memories m ON m.id = i.memory_id
      LEFT JOIN users u ON u.id = i.accepted_by`;

  const toInvite = (row) => ({
    id: row.id,
    label: row.label,
    status: inviteStatus(row),
    person: row.person_id ? { id: row.person_id, name: row.person_name } : null,
    memory: row.memory_id ? { id: row.memory_id, title: row.memory_title } : null,
    acceptedBy: row.accepted_by ? { id: row.accepted_by, name: row.accepted_name } : null,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
  });

  const isOwner = (userId, memoryId) =>
    Boolean(db.prepare('SELECT 1 FROM memories WHERE id = ? AND user_id = ?').get(memoryId, userId));

  const canView = (userId, memoryId) =>
    Boolean(
      db
        .prepare(
          `SELECT 1 FROM memories m WHERE m.id = ?
             AND (m.user_id = ? OR EXISTS (SELECT 1 FROM shares s WHERE s.memory_id = m.id AND s.user_id = ?))`,
        )
        .get(memoryId, userId, userId),
    );

  return {
    connected,
    isOwner,
    canView,

    // ---- connections ----

    connections(userId) {
      return db
        .prepare(
          `SELECT u.id, u.name, c.created_at AS since,
                  (SELECT COUNT(*) FROM shares s JOIN memories m ON m.id = s.memory_id
                    WHERE m.user_id = ? AND s.user_id = u.id) AS shared_by_me,
                  (SELECT COUNT(*) FROM shares s JOIN memories m ON m.id = s.memory_id
                    WHERE m.user_id = u.id AND s.user_id = ?) AS shared_with_me
             FROM connections c JOIN users u ON u.id = c.other_id
            WHERE c.user_id = ?
            ORDER BY u.name COLLATE NOCASE`,
        )
        .all(userId, userId, userId)
        .map((row) => ({
          id: row.id,
          name: row.name,
          since: row.since,
          sharedByMe: row.shared_by_me,
          sharedWithMe: row.shared_with_me,
        }));
    },

    /** Ends a connection in both directions and withdraws every share between the two people. */
    disconnect(userId, otherId) {
      return transaction(db, () => {
        const { changes } = db
          .prepare('DELETE FROM connections WHERE (user_id = ? AND other_id = ?) OR (user_id = ? AND other_id = ?)')
          .run(userId, otherId, otherId, userId);
        if (!Number(changes)) return false;
        const withdraw = db.prepare(
          'DELETE FROM shares WHERE user_id = ? AND memory_id IN (SELECT id FROM memories WHERE user_id = ?)',
        );
        withdraw.run(otherId, userId);
        withdraw.run(userId, otherId);
        db.prepare('UPDATE people SET linked_user_id = NULL WHERE user_id = ? AND linked_user_id = ?').run(userId, otherId);
        db.prepare('UPDATE people SET linked_user_id = NULL WHERE user_id = ? AND linked_user_id = ?').run(otherId, userId);
        return true;
      });
    },

    // ---- invite links ----

    /** Creates an invite → { id, token }. The raw token is returned once and never stored. */
    createInvite(inviterId, { label = '', personId = null, memoryId = null, days = 7 }) {
      const token = randomBytes(24).toString('base64url');
      const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
      const safePerson = personId
        ? db.prepare('SELECT id FROM people WHERE id = ? AND user_id = ?').get(personId, inviterId)?.id ?? null
        : null;
      const safeMemory = memoryId && isOwner(inviterId, memoryId) ? memoryId : null;
      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO invites (inviter_id, token_hash, label, person_id, memory_id, expires_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(inviterId, hashToken(token), label, safePerson, safeMemory, expiresAt);
      return { id: Number(lastInsertRowid), token, expiresAt };
    },

    /** Your invite links, newest first. The token itself is not stored, so it is never listed. */
    invites(inviterId) {
      return db.prepare(`${INVITES} WHERE i.inviter_id = ? ORDER BY i.created_at DESC, i.id DESC`).all(inviterId).map(toInvite);
    },

    invite(inviterId, id) {
      const row = db.prepare(`${INVITES} WHERE i.inviter_id = ? AND i.id = ?`).get(inviterId, id);
      return row ? toInvite(row) : null;
    },

    invitesCreatedSince(inviterId, since) {
      return db
        .prepare('SELECT COUNT(*) AS n FROM invites WHERE inviter_id = ? AND created_at >= ?')
        .get(inviterId, since.toISOString()).n;
    },

    revokeInvite(inviterId, id) {
      const { changes } = db
        .prepare(`UPDATE invites SET revoked_at = ${NOW} WHERE id = ? AND inviter_id = ? AND revoked_at IS NULL AND accepted_at IS NULL`)
        .run(id, inviterId);
      return Number(changes) > 0;
    },

    /**
     * Attaches one of your memories to one of your invites. The memory form creates the link
     * before the memory exists, so this runs when the memory is saved. If the invite was already
     * accepted in the meantime, the two of you are connected: the memory is shared right away.
     */
    attachMemory(inviterId, inviteId, memoryId) {
      if (!isOwner(inviterId, memoryId)) return false;
      const row = db.prepare('SELECT accepted_by, revoked_at FROM invites WHERE id = ? AND inviter_id = ?').get(inviteId, inviterId);
      if (!row || row.revoked_at) return false;
      transaction(db, () => {
        db.prepare('UPDATE invites SET memory_id = ? WHERE id = ?').run(memoryId, inviteId);
        if (row.accepted_by && connected(inviterId, row.accepted_by)) {
          db.prepare('INSERT OR IGNORE INTO shares (memory_id, user_id) VALUES (?, ?)').run(memoryId, row.accepted_by);
        }
      });
      return true;
    },

    /** What the invite page may show before accepting. Only usable (pending) invites are found. */
    findInvite(token) {
      if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
      const row = db
        .prepare(
          `SELECT i.*, u.name AS inviter_name, m.title AS memory_title
             FROM invites i JOIN users u ON u.id = i.inviter_id
             LEFT JOIN memories m ON m.id = i.memory_id
            WHERE i.token_hash = ?`,
        )
        .get(hashToken(token));
      if (!row || inviteStatus(row) !== 'pending') return null;
      return row;
    },

    /**
     * Accepting an invite: the two people become connected, the memory attached to the
     * invite (if any) is shared, and the inviter's "Old friends" entry is linked to the new account.
     * → { inviter, memoryId } · { error: 'INVITE_INVALID' | 'INVITE_OWN' }
     */
    acceptInvite(token, userId) {
      const row = this.findInvite(token);
      if (!row) return { error: 'INVITE_INVALID' };
      if (row.inviter_id === userId) return { error: 'INVITE_OWN' };
      return transaction(db, () => {
        connect(row.inviter_id, userId);
        if (row.memory_id && isOwner(row.inviter_id, row.memory_id)) {
          db.prepare('INSERT OR IGNORE INTO shares (memory_id, user_id) VALUES (?, ?)').run(row.memory_id, userId);
        }
        if (row.person_id) {
          db.prepare('UPDATE people SET linked_user_id = ? WHERE id = ? AND user_id = ?').run(userId, row.person_id, row.inviter_id);
        }
        db.prepare(`UPDATE invites SET accepted_by = ?, accepted_at = ${NOW} WHERE id = ?`).run(userId, row.id);
        return { inviter: { id: row.inviter_id, name: row.inviter_name }, memoryId: row.memory_id ?? null };
      });
    },

    // ---- shares ----

    /** Who can see a memory you own. */
    recipients(ownerId, memoryId) {
      if (!isOwner(ownerId, memoryId)) return null;
      return db
        .prepare(
          `SELECT u.id, u.name, s.created_at AS shared_at FROM shares s JOIN users u ON u.id = s.user_id
            WHERE s.memory_id = ? ORDER BY u.name COLLATE NOCASE`,
        )
        .all(memoryId)
        .map((row) => ({ id: row.id, name: row.name, sharedAt: row.shared_at }));
    },

    /** Replaces who can see a memory. Only people in your circle are kept; anyone else is ignored. */
    setRecipients(ownerId, memoryId, userIds) {
      if (!isOwner(ownerId, memoryId)) return null;
      transaction(db, () => {
        const wanted = JSON.stringify(userIds);
        db.prepare(
          `DELETE FROM shares WHERE memory_id = ? AND user_id NOT IN (SELECT value FROM json_each(?))`,
        ).run(memoryId, wanted);
        db.prepare(
          `INSERT OR IGNORE INTO shares (memory_id, user_id)
           SELECT ?, c.other_id FROM connections c
            WHERE c.user_id = ? AND c.other_id IN (SELECT value FROM json_each(?))`,
        ).run(memoryId, ownerId, wanted);
      });
      return this.recipients(ownerId, memoryId);
    },

    /** Everyone who can see a memory: its owner and the people it is shared with (for live updates). */
    audience(memoryId) {
      return db
        .prepare('SELECT user_id FROM memories WHERE id = ? UNION SELECT user_id FROM shares WHERE memory_id = ?')
        .all(memoryId, memoryId)
        .map((row) => row.user_id);
    },

    // ---- comments ----

    comments(memoryId) {
      return db
        .prepare(
          `SELECT c.id, c.body, c.created_at, c.user_id, u.name FROM comments c JOIN users u ON u.id = c.user_id
            WHERE c.memory_id = ? ORDER BY c.created_at, c.id`,
        )
        .all(memoryId)
        .map((row) => ({ id: row.id, body: row.body, createdAt: row.created_at, author: { id: row.user_id, name: row.name } }));
    },

    addComment(memoryId, userId, body) {
      const { lastInsertRowid } = db
        .prepare('INSERT INTO comments (memory_id, user_id, body) VALUES (?, ?, ?)')
        .run(memoryId, userId, body);
      return this.comments(memoryId).find((comment) => comment.id === Number(lastInsertRowid));
    },

    /** Comments you wrote under other people's memories (for the data export). */
    commentsBy(userId) {
      return db
        .prepare(
          `SELECT c.id, c.memory_id, c.body, c.created_at FROM comments c JOIN memories m ON m.id = c.memory_id
            WHERE c.user_id = ? AND m.user_id <> ? ORDER BY c.created_at`,
        )
        .all(userId, userId)
        .map((row) => ({ id: row.id, memoryId: row.memory_id, body: row.body, createdAt: row.created_at }));
    },

    /** The author, or the owner of the memory, may delete a comment. */
    removeComment(memoryId, commentId, userId) {
      const { changes } = db
        .prepare(
          `DELETE FROM comments WHERE id = ? AND memory_id = ?
             AND (user_id = ? OR EXISTS (SELECT 1 FROM memories m WHERE m.id = ? AND m.user_id = ?))`,
        )
        .run(commentId, memoryId, userId, memoryId, userId);
      return Number(changes) > 0;
    },
  };
}
