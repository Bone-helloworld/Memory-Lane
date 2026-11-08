-- Schema v5: an artifact ("kỷ vật") is now a keepsake card — a postcard, a stamp or a photo card —
-- made from one of your own memories in the card studio and saved to the Artifacts tab.
-- The hand-entered artifacts of v4 (objects, letters, old papers with their own photos) are retired:
-- the album keeps only what was made from its memories.
DROP TABLE memory_artifacts;
DROP TABLE artifacts;

CREATE TABLE artifacts (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- The memory it was made from. Deleting the memory deletes its cards too (they show its photos).
  memory_id  INTEGER NOT NULL REFERENCES memories (id) ON DELETE CASCADE,
  kind       TEXT    NOT NULL CHECK (kind IN ('postcard', 'stamp', 'photo')),
  style      TEXT    NOT NULL DEFAULT 'paper' CHECK (style IN ('paper', 'darkroom')),
  title      TEXT    NOT NULL,                 -- the big line on the card
  line       TEXT    NOT NULL DEFAULT '',      -- place · date
  message    TEXT    NOT NULL DEFAULT '',      -- a postcard's message
  recipient  TEXT    NOT NULL DEFAULT '',      -- "To: …" on a postcard
  file       TEXT    NOT NULL UNIQUE,          -- the card image (random file name in uploads/)
  preview    TEXT    UNIQUE,                   -- a small version for the catalogue
  width      INTEGER,
  height     INTEGER,
  size       INTEGER NOT NULL DEFAULT 0,       -- bytes of image + preview, for the storage quota
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX artifacts_user ON artifacts (user_id, created_at);
CREATE INDEX artifacts_memory ON artifacts (memory_id);
