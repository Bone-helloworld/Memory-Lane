-- One level of replies. SQL Server rejects ON DELETE CASCADE on a self-reference
-- (and on a second cascade path from memories), so the foreign key is NO ACTION.
-- The app deletes a parent's replies before the parent. Deleting a memory or a user
-- clears parent_id first so the memory cascade is not blocked.
IF COL_LENGTH(N'dbo.comments', N'parent_id') IS NULL
  ALTER TABLE dbo.comments ADD parent_id INT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_comments_parent')
  ALTER TABLE dbo.comments ADD CONSTRAINT FK_comments_parent
    FOREIGN KEY (parent_id) REFERENCES dbo.comments (id) ON DELETE NO ACTION;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_comments_parent' AND object_id = OBJECT_ID(N'dbo.comments'))
  CREATE INDEX IX_comments_parent ON dbo.comments (parent_id);
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

  -- Self-FK is NO ACTION: drop the links before the rows, or the delete is rejected.
  UPDATE dbo.comments SET parent_id = NULL
   WHERE parent_id IN (SELECT id FROM dbo.comments WHERE user_id IN (SELECT id FROM deleted))
      OR memory_id IN (SELECT id FROM dbo.memories WHERE user_id IN (SELECT id FROM deleted));

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
