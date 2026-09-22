-- Google OAuth2 SSO replaces password login entirely (see
-- DESIGN_SYSTEM.md 5b). email/display_name move to AES-256-GCM
-- encrypted columns; email_lookup_hash is a deterministic HMAC blind
-- index since AES-GCM's random IV breaks equality lookups on the
-- encrypted column directly. password_hash stays but goes unused -
-- a dead column is lower risk than a destructive DROP COLUMN here.
ALTER TABLE user_account ADD COLUMN email_encrypted TEXT;
ALTER TABLE user_account ADD COLUMN email_lookup_hash TEXT;
ALTER TABLE user_account ADD COLUMN display_name_encrypted TEXT;
ALTER TABLE user_account ADD COLUMN google_sub TEXT;
CREATE UNIQUE INDEX idx_user_account_email_lookup_hash ON user_account (email_lookup_hash);
CREATE UNIQUE INDEX idx_user_account_google_sub ON user_account (google_sub);
