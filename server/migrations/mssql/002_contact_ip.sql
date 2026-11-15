-- The visitor address, so the daily contact limit can count this IP after a restart.
-- Idempotent: a database created before this file has no ip column yet.
IF COL_LENGTH(N'dbo.contact_messages', N'ip') IS NULL
ALTER TABLE dbo.contact_messages ADD ip NVARCHAR(64) NOT NULL CONSTRAINT DF_contact_messages_ip DEFAULT (N'');
