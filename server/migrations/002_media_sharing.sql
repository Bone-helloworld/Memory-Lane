-- Schema v2: several photos and videos per memory, a circle of people on the platform
-- ("connections") built through invite links, memories shared with that circle, and
-- comments ("lời nhắn") on shared memories.

-- Photos and videos of a memory. position 0 is the cover.
CREATE TABLE memory_files (
  id         INTEGER PRIMARY KEY,
  memory_id  INTEGER NOT NULL REFERENCES memories (id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind       TEXT    NOT NULL CHECK (kind IN ('image', 'video')),
  file       TEXT    NOT NULL UNIQUE,         -- random file name in DATA_DIR/uploads
  poster     TEXT    UNIQUE,                  -- videos: a still frame shown before playing
  width      INTEGER,
  height     INTEGER,
  duration   REAL,                            -- videos: length in seconds
  size       INTEGER NOT NULL DEFAULT 0,      -- bytes
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX memory_files_memory ON memory_files (memory_id, position);

-- The single photo of v1 becomes the first file of its memory.
INSERT INTO memory_files (memory_id, user_id, kind, file, position)
SELECT id, user_id, 'image', photo, 0 FROM memories WHERE photo IS NOT NULL;
ALTER TABLE memories DROP COLUMN photo;

-- Two people who accepted an invite from one another. Stored in both directions.
CREATE TABLE connections (
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  other_id   INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, other_id),
  CHECK (user_id <> other_id)
);
CREATE INDEX connections_other ON connections (other_id);

-- Invite links. Only the SHA-256 of the token is stored; the link itself is shown once.
CREATE TABLE invites (
  id          INTEGER PRIMARY KEY,
  inviter_id  INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash  TEXT    NOT NULL UNIQUE,
  label       TEXT    NOT NULL DEFAULT '',                          -- a note for the inviter: "for Thu Hà"
  person_id   INTEGER REFERENCES people (id) ON DELETE SET NULL,     -- sent to someone in "Old friends"
  memory_id   INTEGER REFERENCES memories (id) ON DELETE SET NULL,   -- share this memory once accepted
  expires_at  TEXT    NOT NULL,
  accepted_by INTEGER REFERENCES users (id) ON DELETE SET NULL,
  accepted_at TEXT,
  revoked_at  TEXT,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX invites_inviter ON invites (inviter_id, created_at);

-- "Thu Hà can see memory 13." Only ever between connected people.
CREATE TABLE shares (
  memory_id  INTEGER NOT NULL REFERENCES memories (id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (memory_id, user_id)
);
CREATE INDEX shares_user ON shares (user_id, created_at);

-- Messages left under a memory by its owner or the people it is shared with.
CREATE TABLE comments (
  id         INTEGER PRIMARY KEY,
  memory_id  INTEGER NOT NULL REFERENCES memories (id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  body       TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX comments_memory ON comments (memory_id, created_at);

-- An entry in "Old friends" can point to that person's account once they join.
ALTER TABLE people ADD COLUMN linked_user_id INTEGER REFERENCES users (id) ON DELETE SET NULL;
