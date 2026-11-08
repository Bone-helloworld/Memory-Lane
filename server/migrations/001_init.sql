-- Memory Lane schema v1. Every row belongs to exactly one user (user_id),
-- and every query filters by it: one person's album is never visible to another.
-- Timestamps are ISO-8601 UTC strings; calendar dates are 'YYYY-MM-DD'.

CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT    NOT NULL,
  password_hash TEXT    NOT NULL,
  locale        TEXT    NOT NULL DEFAULT 'vi' CHECK (locale IN ('vi', 'en')),
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE sessions (
  token_hash TEXT    PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX sessions_user ON sessions (user_id);

-- A memory = one moment: a photo (optional), a story, a place and a date.
-- Old photos often have only a year, so month and day are optional.
CREATE TABLE memories (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title      TEXT    NOT NULL,
  story      TEXT    NOT NULL DEFAULT '',
  place      TEXT    NOT NULL DEFAULT '',
  year       INTEGER NOT NULL,
  month      INTEGER CHECK (month BETWEEN 1 AND 12),
  day        INTEGER CHECK (day BETWEEN 1 AND 31),
  photo      TEXT,                                                -- file name in DATA_DIR/uploads
  scene      INTEGER NOT NULL DEFAULT 1 CHECK (scene BETWEEN 1 AND 5), -- gradient shown when there is no photo
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (day IS NULL OR month IS NOT NULL)
);
CREATE INDEX memories_user_date ON memories (user_id, year, month, day);

-- People you want to keep in mind, followed on purpose instead of through a feed.
CREATE TABLE people (
  id           INTEGER PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name         TEXT    NOT NULL,
  relation     TEXT    NOT NULL DEFAULT '',                       -- "bạn cấp 2", "former colleague"
  last_contact TEXT,                                              -- 'YYYY-MM-DD'
  closeness    INTEGER NOT NULL DEFAULT 3 CHECK (closeness BETWEEN 1 AND 5),
  color        TEXT    NOT NULL DEFAULT 'teal' CHECK (color IN ('teal', 'amber', 'rose', 'ink')),
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX people_user ON people (user_id, last_contact);

CREATE TABLE person_notes (
  id         INTEGER PRIMARY KEY,
  person_id  INTEGER NOT NULL REFERENCES people (id) ON DELETE CASCADE,
  body       TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX person_notes_person ON person_notes (person_id, created_at);

-- Many-to-many: who appears in which memory.
CREATE TABLE memory_people (
  memory_id INTEGER NOT NULL REFERENCES memories (id) ON DELETE CASCADE,
  person_id INTEGER NOT NULL REFERENCES people (id) ON DELETE CASCADE,
  PRIMARY KEY (memory_id, person_id)
);
CREATE INDEX memory_people_person ON memory_people (person_id);

-- Films and songs the family loved.
CREATE TABLE media (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind       TEXT    NOT NULL CHECK (kind IN ('film', 'music')),
  title      TEXT    NOT NULL,
  story      TEXT    NOT NULL DEFAULT '',
  owner      TEXT    NOT NULL DEFAULT '',                         -- whose favourite: "Mẹ", "Dad"
  era        TEXT    NOT NULL DEFAULT '',                         -- "early 2000s", "trước 1975"
  url        TEXT    NOT NULL DEFAULT '',
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX media_user ON media (user_id, kind);
