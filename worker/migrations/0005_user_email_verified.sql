-- email_verified records whether the *currently stored* email came from a
-- verified source at the provider, not just whatever the token last
-- claimed. upsertUser/ensureUser (db.ts) use it to decide whether a
-- returning login through a different Auth0 connection (see 0001_init.sql's
-- comment on cross-provider linking being otherwise out of scope) can be
-- recognized as the same person by matching email. Only ever set from the
-- `email_verified` custom claim added by the Auth0 Action (SETUP.md); a row
-- from before this migration defaults to 0 (unverified) until its owner's
-- next login refreshes it.
ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;

-- Enforced only for verified emails: an unverified address is just an
-- unchecked claim passed through from the provider, and two different
-- people could legitimately share one (neither has confirmed it belongs to
-- them), so a plain UNIQUE constraint on the column would be wrong. This
-- partial index is what actually prevents two rows from both being
-- linkable-by-email at once - it closes the race where two logins with
-- different subs and the same brand-new verified email could otherwise both
-- miss the by-email lookup and each insert their own row.
CREATE UNIQUE INDEX idx_users_verified_email ON users(email) WHERE email_verified = 1;
