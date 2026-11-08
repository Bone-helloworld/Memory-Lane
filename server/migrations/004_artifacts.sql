-- Schema v4: Artifacts ("Kỷ vật") — the objects, letters and old papers that hold memories:
-- grandfather's radio, a letter from 1994, a train ticket kept in a drawer. Each can have one
-- photo of the object, and can be tied to the memories it belongs to.
CREATE TABLE artifacts (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind       TEXT    NOT NULL CHECK (kind IN ('object', 'letter', 'document')),
  title      TEXT    NOT NULL,
  year       INTEGER,                          -- roughly when it is from (optional)
  origin     TEXT    NOT NULL DEFAULT '',      -- whose it was / who wrote it: "của ông nội", "bố gửi mẹ"
  kept_at    TEXT    NOT NULL DEFAULT '',      -- where it is kept now: "tủ kính phòng khách"
  story      TEXT    NOT NULL DEFAULT '',
  photo      TEXT    UNIQUE,                   -- a photo of the object (random file name in uploads/)
  preview    TEXT    UNIQUE,                   -- its 560 px version for the grid
  width      INTEGER,
  height     INTEGER,
  size       INTEGER NOT NULL DEFAULT 0,       -- bytes of photo + preview, for the storage quota
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX artifacts_user ON artifacts (user_id, kind);

-- "Grandfather's radio" belongs to "Tết 1998": one artifact can appear in several memories.
CREATE TABLE memory_artifacts (
  memory_id   INTEGER NOT NULL REFERENCES memories (id) ON DELETE CASCADE,
  artifact_id INTEGER NOT NULL REFERENCES artifacts (id) ON DELETE CASCADE,
  PRIMARY KEY (memory_id, artifact_id)
);
CREATE INDEX memory_artifacts_artifact ON memory_artifacts (artifact_id);
