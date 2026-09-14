-- auth0_sub is provider-agnostic (Auth0 prefixes it per social connection,
-- e.g. "google-oauth2|...", "discord|..."), so every provider flows through
-- the same column/table with no schema change if more are added later.
-- Cross-provider account linking is explicitly out of scope (see the plan):
-- the same person signing in via a different provider gets a second row.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  auth0_sub TEXT UNIQUE NOT NULL,
  email TEXT,
  display_name TEXT,
  created_at TEXT NOT NULL,
  last_login_at TEXT NOT NULL
);

-- blob stores the exact opaque codec-encoded string (the same value that
-- would otherwise sit in a `?b=` query param). The Worker never parses it,
-- so a payload schema change (e.g. a future CompactPayloadV2) never
-- requires a backend deploy - see build-url-codec.service.ts.
CREATE TABLE builds (
  id TEXT PRIMARY KEY,
  short_id TEXT UNIQUE NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  blob TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_builds_owner_user_id ON builds(owner_user_id);
