-- The visitor address, so the daily contact limit can count this IP after a restart.
ALTER TABLE contact_messages ADD COLUMN ip TEXT NOT NULL DEFAULT '';
