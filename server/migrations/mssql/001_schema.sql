-- Memory Lane on Azure SQL. One idempotent script for the schema the SQLite migrations
-- end on (album, files, sharing, Google sign-in, keepsake cards). Safe to run again:
-- existing tables are left in place.
--
-- SQL Server rejects two ON DELETE CASCADE paths between the same tables, which SQLite allows.
-- Cascades follow the memory and the person. Anything that also points at the user is removed
-- by trg_users_delete before the user row itself goes, so deleting an account still deletes
-- every row that belongs to it.
--
-- FILE is a reserved keyword, so the photo/card column is written [file].

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;

IF OBJECT_ID(N'dbo.users', N'U') IS NULL
CREATE TABLE dbo.users (
  id            INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_users PRIMARY KEY,
  email         NVARCHAR(320) COLLATE Latin1_General_CI_AS NOT NULL,
  name          NVARCHAR(200) NOT NULL,
  password_hash NVARCHAR(500) NOT NULL CONSTRAINT DF_users_password DEFAULT N'',
  locale        NVARCHAR(8) NOT NULL CONSTRAINT DF_users_locale DEFAULT N'vi',
  created_at    NVARCHAR(40) NOT NULL CONSTRAINT DF_users_created DEFAULT (CONVERT(varchar(23), SYSUTCDATETIME(), 126) + 'Z'),
  google_sub    NVARCHAR(255) NULL,
  google_email  NVARCHAR(320) NULL,
  CONSTRAINT UQ_users_email UNIQUE (email),
  CONSTRAINT CK_users_locale CHECK (locale IN (N'vi', N'en'))
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_users_google_sub' AND object_id = OBJECT_ID(N'dbo.users'))
CREATE UNIQUE INDEX UX_users_google_sub ON dbo.users (google_sub) WHERE google_sub IS NOT NULL;

IF OBJECT_ID(N'dbo.sessions', N'U') IS NULL
CREATE TABLE dbo.sessions (
  token_hash NVARCHAR(64) NOT NULL CONSTRAINT PK_sessions PRIMARY KEY,
  user_id    INT NOT NULL CONSTRAINT FK_sessions_user REFERENCES dbo.users (id),
  expires_at NVARCHAR(40) NOT NULL,
  created_at NVARCHAR(40) NOT NULL CONSTRAINT DF_sessions_created DEFAULT (CONVERT(varchar(23), SYSUTCDATETIME(), 126) + 'Z')
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_sessions_user' AND object_id = OBJECT_ID(N'dbo.sessions'))
CREATE INDEX IX_sessions_user ON dbo.sessions (user_id);

IF OBJECT_ID(N'dbo.memories', N'U') IS NULL
CREATE TABLE dbo.memories (
  id         INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_memories PRIMARY KEY,
  user_id    INT NOT NULL CONSTRAINT FK_memories_user REFERENCES dbo.users (id),
  title      NVARCHAR(400) NOT NULL,
  story      NVARCHAR(MAX) NOT NULL CONSTRAINT DF_memories_story DEFAULT N'',
  place      NVARCHAR(400) NOT NULL CONSTRAINT DF_memories_place DEFAULT N'',
  year       INT NOT NULL,
  month      INT NULL,
  day        INT NULL,
  scene      INT NOT NULL CONSTRAINT DF_memories_scene DEFAULT 1,
  created_at NVARCHAR(40) NOT NULL CONSTRAINT DF_memories_created DEFAULT (CONVERT(varchar(23), SYSUTCDATETIME(), 126) + 'Z'),
  updated_at NVARCHAR(40) NOT NULL CONSTRAINT DF_memories_updated DEFAULT (CONVERT(varchar(23), SYSUTCDATETIME(), 126) + 'Z'),
  CONSTRAINT CK_memories_month CHECK (month IS NULL OR month BETWEEN 1 AND 12),
  CONSTRAINT CK_memories_day CHECK (day IS NULL OR day BETWEEN 1 AND 31),
  CONSTRAINT CK_memories_scene CHECK (scene BETWEEN 1 AND 5),
  CONSTRAINT CK_memories_date CHECK (day IS NULL OR month IS NOT NULL)
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_memories_user_date' AND object_id = OBJECT_ID(N'dbo.memories'))
CREATE INDEX IX_memories_user_date ON dbo.memories (user_id, year, month, day);

IF OBJECT_ID(N'dbo.people', N'U') IS NULL
CREATE TABLE dbo.people (
  id             INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_people PRIMARY KEY,
  user_id        INT NOT NULL CONSTRAINT FK_people_user REFERENCES dbo.users (id),
  name           NVARCHAR(200) NOT NULL,
  relation       NVARCHAR(200) NOT NULL CONSTRAINT DF_people_relation DEFAULT N'',
  last_contact   NVARCHAR(40) NULL,
  closeness      INT NOT NULL CONSTRAINT DF_people_closeness DEFAULT 3,
  color          NVARCHAR(16) NOT NULL CONSTRAINT DF_people_color DEFAULT N'teal',
  created_at     NVARCHAR(40) NOT NULL CONSTRAINT DF_people_created DEFAULT (CONVERT(varchar(23), SYSUTCDATETIME(), 126) + 'Z'),
  updated_at     NVARCHAR(40) NOT NULL CONSTRAINT DF_people_updated DEFAULT (CONVERT(varchar(23), SYSUTCDATETIME(), 126) + 'Z'),
  linked_user_id INT NULL CONSTRAINT FK_people_linked REFERENCES dbo.users (id) ON DELETE SET NULL,
  CONSTRAINT CK_people_closeness CHECK (closeness BETWEEN 1 AND 5),
  CONSTRAINT CK_people_color CHECK (color IN (N'teal', N'amber', N'rose', N'ink'))
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_people_user' AND object_id = OBJECT_ID(N'dbo.people'))
CREATE INDEX IX_people_user ON dbo.people (user_id, last_contact);

IF OBJECT_ID(N'dbo.person_notes', N'U') IS NULL
CREATE TABLE dbo.person_notes (
  id         INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_person_notes PRIMARY KEY,
  person_id  INT NOT NULL CONSTRAINT FK_person_notes_person REFERENCES dbo.people (id) ON DELETE CASCADE,
  body       NVARCHAR(MAX) NOT NULL,
  created_at NVARCHAR(40) NOT NULL CONSTRAINT DF_person_notes_created DEFAULT (CONVERT(varchar(23), SYSUTCDATETIME(), 126) + 'Z')
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_person_notes_person' AND object_id = OBJECT_ID(N'dbo.person_notes'))
CREATE INDEX IX_person_notes_person ON dbo.person_notes (person_id, created_at);

IF OBJECT_ID(N'dbo.memory_people', N'U') IS NULL
CREATE TABLE dbo.memory_people (
  memory_id INT NOT NULL CONSTRAINT FK_memory_people_memory REFERENCES dbo.memories (id) ON DELETE CASCADE,
  person_id INT NOT NULL CONSTRAINT FK_memory_people_person REFERENCES dbo.people (id) ON DELETE CASCADE,
  CONSTRAINT PK_memory_people PRIMARY KEY (memory_id, person_id)
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_memory_people_person' AND object_id = OBJECT_ID(N'dbo.memory_people'))
CREATE INDEX IX_memory_people_person ON dbo.memory_people (person_id);

IF OBJECT_ID(N'dbo.media', N'U') IS NULL
CREATE TABLE dbo.media (
  id         INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_media PRIMARY KEY,
  user_id    INT NOT NULL CONSTRAINT FK_media_user REFERENCES dbo.users (id),
  kind       NVARCHAR(16) NOT NULL,
  title      NVARCHAR(400) NOT NULL,
  story      NVARCHAR(MAX) NOT NULL CONSTRAINT DF_media_story DEFAULT N'',
  owner      NVARCHAR(200) NOT NULL CONSTRAINT DF_media_owner DEFAULT N'',
  era        NVARCHAR(200) NOT NULL CONSTRAINT DF_media_era DEFAULT N'',
  url        NVARCHAR(1000) NOT NULL CONSTRAINT DF_media_url DEFAULT N'',
  created_at NVARCHAR(40) NOT NULL CONSTRAINT DF_media_created DEFAULT (CONVERT(varchar(23), SYSUTCDATETIME(), 126) + 'Z'),
  updated_at NVARCHAR(40) NOT NULL CONSTRAINT DF_media_updated DEFAULT (CONVERT(varchar(23), SYSUTCDATETIME(), 126) + 'Z'),
  CONSTRAINT CK_media_kind CHECK (kind IN (N'film', N'music'))
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_media_user' AND object_id = OBJECT_ID(N'dbo.media'))
CREATE INDEX IX_media_user ON dbo.media (user_id, kind);

IF OBJECT_ID(N'dbo.memory_files', N'U') IS NULL
CREATE TABLE dbo.memory_files (
  id         INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_memory_files PRIMARY KEY,
  memory_id  INT NOT NULL CONSTRAINT FK_memory_files_memory REFERENCES dbo.memories (id) ON DELETE CASCADE,
  user_id    INT NOT NULL CONSTRAINT FK_memory_files_user REFERENCES dbo.users (id),
  kind       NVARCHAR(16) NOT NULL,
  [file]     NVARCHAR(80) NOT NULL,
  poster     NVARCHAR(80) NULL,
  width      INT NULL,
  height     INT NULL,
  duration   FLOAT NULL,
  size       BIGINT NOT NULL CONSTRAINT DF_memory_files_size DEFAULT 0,
  position   INT NOT NULL CONSTRAINT DF_memory_files_position DEFAULT 0,
  created_at NVARCHAR(40) NOT NULL CONSTRAINT DF_memory_files_created DEFAULT (CONVERT(varchar(23), SYSUTCDATETIME(), 126) + 'Z'),
  CONSTRAINT UQ_memory_files_file UNIQUE ([file]),
  CONSTRAINT UQ_memory_files_poster UNIQUE (poster),
  CONSTRAINT CK_memory_files_kind CHECK (kind IN (N'image', N'video'))
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_memory_files_memory' AND object_id = OBJECT_ID(N'dbo.memory_files'))
CREATE INDEX IX_memory_files_memory ON dbo.memory_files (memory_id, position);

IF OBJECT_ID(N'dbo.connections', N'U') IS NULL
CREATE TABLE dbo.connections (
  user_id    INT NOT NULL CONSTRAINT FK_connections_user REFERENCES dbo.users (id),
  other_id   INT NOT NULL CONSTRAINT FK_connections_other REFERENCES dbo.users (id),
  created_at NVARCHAR(40) NOT NULL CONSTRAINT DF_connections_created DEFAULT (CONVERT(varchar(23), SYSUTCDATETIME(), 126) + 'Z'),
  CONSTRAINT PK_connections PRIMARY KEY (user_id, other_id),
  CONSTRAINT CK_connections_distinct CHECK (user_id <> other_id)
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_connections_other' AND object_id = OBJECT_ID(N'dbo.connections'))
CREATE INDEX IX_connections_other ON dbo.connections (other_id);

IF OBJECT_ID(N'dbo.invites', N'U') IS NULL
CREATE TABLE dbo.invites (
  id          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_invites PRIMARY KEY,
  inviter_id  INT NOT NULL CONSTRAINT FK_invites_inviter REFERENCES dbo.users (id),
  token_hash  NVARCHAR(64) NOT NULL CONSTRAINT UQ_invites_token UNIQUE,
  label       NVARCHAR(200) NOT NULL CONSTRAINT DF_invites_label DEFAULT N'',
  person_id   INT NULL CONSTRAINT FK_invites_person REFERENCES dbo.people (id) ON DELETE SET NULL,
  memory_id   INT NULL CONSTRAINT FK_invites_memory REFERENCES dbo.memories (id) ON DELETE SET NULL,
  expires_at  NVARCHAR(40) NOT NULL,
  accepted_by INT NULL CONSTRAINT FK_invites_accepted REFERENCES dbo.users (id) ON DELETE SET NULL,
  accepted_at NVARCHAR(40) NULL,
  revoked_at  NVARCHAR(40) NULL,
  created_at  NVARCHAR(40) NOT NULL CONSTRAINT DF_invites_created DEFAULT (CONVERT(varchar(23), SYSUTCDATETIME(), 126) + 'Z')
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_invites_inviter' AND object_id = OBJECT_ID(N'dbo.invites'))
CREATE INDEX IX_invites_inviter ON dbo.invites (inviter_id, created_at);

IF OBJECT_ID(N'dbo.shares', N'U') IS NULL
CREATE TABLE dbo.shares (
  memory_id  INT NOT NULL CONSTRAINT FK_shares_memory REFERENCES dbo.memories (id) ON DELETE CASCADE,
  user_id    INT NOT NULL CONSTRAINT FK_shares_user REFERENCES dbo.users (id),
  created_at NVARCHAR(40) NOT NULL CONSTRAINT DF_shares_created DEFAULT (CONVERT(varchar(23), SYSUTCDATETIME(), 126) + 'Z'),
  CONSTRAINT PK_shares PRIMARY KEY (memory_id, user_id)
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_shares_user' AND object_id = OBJECT_ID(N'dbo.shares'))
CREATE INDEX IX_shares_user ON dbo.shares (user_id, created_at);

IF OBJECT_ID(N'dbo.comments', N'U') IS NULL
CREATE TABLE dbo.comments (
  id         INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_comments PRIMARY KEY,
  memory_id  INT NOT NULL CONSTRAINT FK_comments_memory REFERENCES dbo.memories (id) ON DELETE CASCADE,
  user_id    INT NOT NULL CONSTRAINT FK_comments_user REFERENCES dbo.users (id),
  body       NVARCHAR(MAX) NOT NULL,
  created_at NVARCHAR(40) NOT NULL CONSTRAINT DF_comments_created DEFAULT (CONVERT(varchar(23), SYSUTCDATETIME(), 126) + 'Z')
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_comments_memory' AND object_id = OBJECT_ID(N'dbo.comments'))
CREATE INDEX IX_comments_memory ON dbo.comments (memory_id, created_at);

IF OBJECT_ID(N'dbo.artifacts', N'U') IS NULL
CREATE TABLE dbo.artifacts (
  id         INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_artifacts PRIMARY KEY,
  user_id    INT NOT NULL CONSTRAINT FK_artifacts_user REFERENCES dbo.users (id),
  memory_id  INT NOT NULL CONSTRAINT FK_artifacts_memory REFERENCES dbo.memories (id) ON DELETE CASCADE,
  kind       NVARCHAR(16) NOT NULL,
  style      NVARCHAR(16) NOT NULL CONSTRAINT DF_artifacts_style DEFAULT N'paper',
  title      NVARCHAR(400) NOT NULL,
  line       NVARCHAR(400) NOT NULL CONSTRAINT DF_artifacts_line DEFAULT N'',
  message    NVARCHAR(MAX) NOT NULL CONSTRAINT DF_artifacts_message DEFAULT N'',
  recipient  NVARCHAR(400) NOT NULL CONSTRAINT DF_artifacts_recipient DEFAULT N'',
  [file]     NVARCHAR(80) NOT NULL,
  preview    NVARCHAR(80) NULL,
  width      INT NULL,
  height     INT NULL,
  size       BIGINT NOT NULL CONSTRAINT DF_artifacts_size DEFAULT 0,
  created_at NVARCHAR(40) NOT NULL CONSTRAINT DF_artifacts_created DEFAULT (CONVERT(varchar(23), SYSUTCDATETIME(), 126) + 'Z'),
  CONSTRAINT UQ_artifacts_file UNIQUE ([file]),
  CONSTRAINT UQ_artifacts_preview UNIQUE (preview),
  CONSTRAINT CK_artifacts_kind CHECK (kind IN (N'postcard', N'stamp', N'photo')),
  CONSTRAINT CK_artifacts_style CHECK (style IN (N'paper', N'darkroom'))
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_artifacts_user' AND object_id = OBJECT_ID(N'dbo.artifacts'))
CREATE INDEX IX_artifacts_user ON dbo.artifacts (user_id, created_at);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_artifacts_memory' AND object_id = OBJECT_ID(N'dbo.artifacts'))
CREATE INDEX IX_artifacts_memory ON dbo.artifacts (memory_id);

-- Contact form. Not tied to an account, so deleting a user leaves these rows alone.
IF OBJECT_ID(N'dbo.contact_messages', N'U') IS NULL
CREATE TABLE dbo.contact_messages (
  id         INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_contact_messages PRIMARY KEY,
  kind       NVARCHAR(32) NOT NULL,
  name       NVARCHAR(200) NOT NULL,
  email      NVARCHAR(320) NOT NULL,
  message    NVARCHAR(MAX) NOT NULL,
  created_at NVARCHAR(40) NOT NULL CONSTRAINT DF_contact_messages_created DEFAULT (CONVERT(varchar(23), SYSUTCDATETIME(), 126) + 'Z'),
  CONSTRAINT CK_contact_messages_kind CHECK (kind IN (N'feedback', N'suggestion', N'collaboration'))
);
GO

CREATE OR ALTER TRIGGER dbo.trg_users_delete
ON dbo.users
INSTEAD OF DELETE
AS
BEGIN
  SET NOCOUNT ON;
  IF NOT EXISTS (SELECT 1 FROM deleted) RETURN;

  UPDATE dbo.people SET linked_user_id = NULL WHERE linked_user_id IN (SELECT id FROM deleted);
  UPDATE dbo.invites SET accepted_by = NULL WHERE accepted_by IN (SELECT id FROM deleted);

  DELETE FROM dbo.comments WHERE user_id IN (SELECT id FROM deleted);
  DELETE FROM dbo.shares WHERE user_id IN (SELECT id FROM deleted);
  DELETE FROM dbo.connections
   WHERE user_id IN (SELECT id FROM deleted) OR other_id IN (SELECT id FROM deleted);
  DELETE FROM dbo.invites WHERE inviter_id IN (SELECT id FROM deleted);

  DELETE FROM dbo.memories WHERE user_id IN (SELECT id FROM deleted);
  DELETE FROM dbo.people WHERE user_id IN (SELECT id FROM deleted);
  DELETE FROM dbo.media WHERE user_id IN (SELECT id FROM deleted);
  DELETE FROM dbo.sessions WHERE user_id IN (SELECT id FROM deleted);
  DELETE FROM dbo.memory_files WHERE user_id IN (SELECT id FROM deleted);
  DELETE FROM dbo.artifacts WHERE user_id IN (SELECT id FROM deleted);

  DELETE FROM dbo.users WHERE id IN (SELECT id FROM deleted);
END
GO
