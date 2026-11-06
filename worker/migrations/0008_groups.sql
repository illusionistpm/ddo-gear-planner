-- Group runs: several saved builds, from any number of friends, shopped for
-- as one list (routes/groups.ts). A group holds no ticks of its own: each
-- build's progress stays in build_progress, written only by the build's
-- owner, and the group's live room (group-room.ts) reads it from there.
--
-- short_id comes from the shared allocator (short_ids, kind 'group'), so a
-- group's link can never collide with a build's or a short link's.
-- invite_token is the secret half of the invite link: anyone holding it
-- can watch the list and add their own builds. The host can rotate it.
--
-- picks and route_order are the group's one shared route, set by the host:
-- the same shapes as build_progress.picks and .route_order. Each build's own
-- route plays no part in a group.
--
-- updated_at moves with membership, names, the route and the token - not
-- with ticks, which land in build_progress. A group is idle, and deleted
-- lazily, once neither has moved for a while (see GROUP_IDLE_MS).
CREATE TABLE groups (
  id TEXT PRIMARY KEY,
  short_id TEXT UNIQUE NOT NULL,
  host_user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  invite_token TEXT NOT NULL,
  picks TEXT NOT NULL DEFAULT '{}',
  route_order TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_groups_host ON groups(host_user_id);

-- One row per build in a group. character_name is the short label each of
-- the build's rows carries, unique within its group (case-insensitively, as
-- build names are per owner). The CASCADEs are backstops: deleteBuild and
-- deleteGroup (db.ts) delete these rows themselves, in the same batch.
CREATE TABLE group_builds (
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  build_id TEXT NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  added_by_user_id TEXT NOT NULL REFERENCES users(id),
  character_name TEXT NOT NULL,
  added_at TEXT NOT NULL,
  PRIMARY KEY (group_id, build_id)
);

CREATE UNIQUE INDEX idx_group_builds_name ON group_builds(group_id, character_name COLLATE NOCASE);
CREATE INDEX idx_group_builds_build ON group_builds(build_id);
