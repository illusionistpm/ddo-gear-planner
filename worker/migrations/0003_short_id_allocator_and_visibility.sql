-- Shared short-id allocator across `builds` and `shortlinks` (branch audit
-- finding #6): each table minted its own 8-char id independently via
-- withUniqueShortId, so a shortId could theoretically collide across the
-- two tables - the two KV cache namespaces (buildCacheKey/shortLinkCacheKey
-- in routes/builds.ts) only separate the *cache*, not the lookup itself, so
-- a collision would make one of the two rows permanently unreachable
-- (handleGetByShortId checks builds first, silently shadowing a colliding
-- shortlink). This table makes the id space genuinely single: both routes
-- now reserve a row here (via shortId.ts's withUniqueShortId) before
-- inserting into their own table, and this PRIMARY KEY is what actually
-- arbitrates uniqueness - see routes/builds.ts and routes/shortlinks.ts.
CREATE TABLE short_ids (
  short_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL, -- 'build' | 'shortlink'
  created_at TEXT NOT NULL
);

-- Backfill existing rows into the shared space. A failure here (a UNIQUE
-- violation) would mean a real pre-existing cross-table collision - correct
-- to fail loudly rather than silently, and astronomically unlikely at 8
-- alphanumeric characters.
INSERT INTO short_ids (short_id, kind, created_at)
  SELECT short_id, 'build', created_at FROM builds;

INSERT INTO short_ids (short_id, kind, created_at)
  SELECT short_id, 'shortlink', created_at FROM shortlinks;

-- Build visibility. Default 'public' preserves today's behavior exactly -
-- every saved build is currently readable by shortId with no way to opt
-- out, and that stays true for every existing and new row unless changed.
-- handleGetByShortId is updated to actually check this column and 404 on
-- 'private', rather than adding it and leaving it unenforced - an
-- unenforced column would read as a guarantee that isn't one. There's no UI
-- for this in this pass; the point is that turning on private builds later
-- is a UI change against an already-shaped column, not a second migration
-- against a populated table.
ALTER TABLE builds ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public';

-- Attributes future shortlinks to their creator (branch audit finding #10 -
-- shortlinks were auth-gated but never recorded who created them, making
-- every row permanent, ownerless, and untraceable). Nullable: existing rows
-- predate this column and have no way to know who made them.
ALTER TABLE shortlinks ADD COLUMN creator_user_id TEXT REFERENCES users(id);
