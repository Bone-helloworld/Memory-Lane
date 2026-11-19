-- One level of replies under a comment. Replying to a reply is stored on the top-level
-- parent (the API does that); ON DELETE CASCADE removes the replies with the parent.
ALTER TABLE comments ADD COLUMN parent_id INTEGER REFERENCES comments (id) ON DELETE CASCADE;
CREATE INDEX comments_parent ON comments (parent_id);
