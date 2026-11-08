-- Schema v3: "Continue with Google".
-- A Google account is recognised by its "sub" — Google's permanent id for that person — never by
-- its email, which can change. google_email is only shown in Settings ("linked to …@gmail.com").
-- Accounts created with Google have no password: password_hash = '' until the owner sets one.
ALTER TABLE users ADD COLUMN google_sub TEXT;
ALTER TABLE users ADD COLUMN google_email TEXT;
CREATE UNIQUE INDEX users_google_sub ON users (google_sub) WHERE google_sub IS NOT NULL;
