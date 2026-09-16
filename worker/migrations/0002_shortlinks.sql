-- Anonymous, immutable share snapshots - deliberately separate from
-- `builds` (see the plan): saving a build never touches this table, and
-- rows here are never updated once created. `blob` stores the JSON envelope
-- {"name": ..., "blob": ...} (see routes/shortlinks.ts) rather than just the
-- opaque gear blob, so a single UNIQUE constraint captures "same gear AND
-- same name" for dedup without a NULL-vs-'' sentinel on a separate column.
CREATE TABLE shortlinks (
  short_id TEXT PRIMARY KEY,
  blob TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL
);
