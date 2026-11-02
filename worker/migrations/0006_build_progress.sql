-- Shopping-list progress for a saved build: one row per build, written only
-- by its owner. Deliberately not part of `builds`: ticking things off must
-- never change a build's blob, bump its updated_at (My Builds' sort order),
-- or invalidate its KV cache entry.
--
-- entries and picks are private - the owner's tick overrides and the quests
-- they picked to get things from. needed and route are what a friend's link
-- may see: the still-needed keys, and for each still-needed thing the
-- quests the owner's list sends them to. The client works out both; the
-- Worker stores them as given (routes/progress.ts). All four are JSON text.
--
-- write_day/writes_today count the row's writes on one UTC day, for the
-- per-user daily cap (summed over owner_user_id). owner_user_id copies
-- builds.owner_user_id so that sum needs no join; builds never change owner.
--
-- ON DELETE CASCADE is a backstop: deleteBuild (db.ts) deletes the progress
-- row itself in the same batch, so build deletion doesn't depend on D1
-- keeping foreign keys switched on.
CREATE TABLE build_progress (
  build_id TEXT PRIMARY KEY REFERENCES builds(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  entries TEXT NOT NULL DEFAULT '{}',
  picks TEXT NOT NULL DEFAULT '{}',
  needed TEXT NOT NULL DEFAULT '[]',
  route TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL,
  write_day TEXT NOT NULL,
  writes_today INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_build_progress_owner_day ON build_progress(owner_user_id, write_day);
