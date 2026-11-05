export interface UserRow {
  id: string;
  auth0_sub: string;
  email: string | null;
  email_verified: number;
  display_name: string | null;
  created_at: string;
  last_login_at: string;
}

export type BuildVisibility = 'public' | 'private';

export interface BuildRow {
  id: string;
  short_id: string;
  owner_user_id: string;
  name: string;
  blob: string;
  visibility: BuildVisibility;
  created_at: string;
  updated_at: string;
}

// Same shape as BuildRow minus `blob` - listBuildsByOwner's callers (the
// My Builds list, the duplicate-name checks on save/rename, ownership
// confirmation) only ever read id/shortId/name/timestamps, never the gear
// blob itself. At the 100-build cap, selecting the full blob for every row
// just to discard it was up to ~400KB of dead weight per listMine() call.
export type BuildSummaryRow = Omit<BuildRow, 'blob'>;

export type ShortIdKind = 'build' | 'shortlink' | 'group';

// A saved build's shopping-list progress - see migrations/0006. The four
// JSON columns are stored as text and parsed by routes/progress.ts.
export interface BuildProgressRow {
  build_id: string;
  owner_user_id: string;
  entries: string;
  picks: string;
  needed: string | null;
  route: string | null;
  route_order: string | null;
  updated_at: string;
  write_day: string;
  writes_today: number;
}

export async function getUserByAuth0Sub(db: D1Database, auth0Sub: string): Promise<UserRow | null> {
  return await db.prepare('SELECT * FROM users WHERE auth0_sub = ?').bind(auth0Sub).first<UserRow>();
}

// Read-only - by sub alone; routes go through resolveUserId (below), which
// also covers a sub moved away by cross-provider linking. upsertUser (below) does a write on every call (an UPDATE
// even when nothing changed), which made every GET/PUT/DELETE pay for a
// last_login_at bump that has nothing to do with logging in - see
// resolveOwnerUserId in routes/ownership.ts. Returns null rather than creating
// a row for an unrecognized sub - a route reaching here for a sub with no
// row yet has nothing to look up anyway (no user row means no builds could
// exist for it either), and creating one on the fly with fewer defaults
// than upsertUser/ensureUser's own inserts would be the wrong way to paper
// over that. See ensureUser below for the one place that DOES want
// insert-if-missing.
export async function getUserIdByAuth0Sub(db: D1Database, auth0Sub: string): Promise<string | null> {
  const row = await db.prepare('SELECT id FROM users WHERE auth0_sub = ?').bind(auth0Sub).first<{ id: string }>();
  return row?.id ?? null;
}

// Only matches a row whose *stored* email was itself set from a verified
// claim (see the email_verified column's comment in
// migrations/0005_user_email_verified.sql) - an unverified email is not a
// safe basis for handing a new sub access to an existing account's builds.
export async function getUserByVerifiedEmail(db: D1Database, email: string): Promise<UserRow | null> {
  return await db.prepare('SELECT * FROM users WHERE email = ? AND email_verified = 1').bind(email).first<UserRow>();
}

/**
 * The read-only id lookup for every authenticated route except
 * handleGetMe and create: by sub, then by verified email.
 *
 * The email fallback exists because linking (upsertUser/ensureUser) moves
 * auth0_sub onto the existing row. A second device still holding a token
 * from the provider the person signed in with before carries a sub that no
 * longer matches, and by sub alone it would see no builds and get 403s on
 * its own until a reload relinked it - flipping the other device the same
 * way. Matching on the verified email extends exactly the trust linking
 * already does, without the write: only upsertUser/ensureUser relink.
 */
export async function resolveUserId(
  db: D1Database,
  params: { auth0Sub: string; email: string | null; emailVerified: boolean }
): Promise<string | null> {
  const bySub = await getUserIdByAuth0Sub(db, params.auth0Sub);
  if (bySub || !params.email || !params.emailVerified) {
    return bySub;
  }
  return (await getUserByVerifiedEmail(db, params.email))?.id ?? null;
}

/**
 * Finds the user by auth0_sub, updating last_login_at (and refreshing
 * email/display_name in case they changed at the provider) if found, or
 * creates a new row. This is where "basic user tracking" lands - see the
 * plan's Phase 4 note that created_at/last_login_at alone satisfy that at
 * this scale. Reserved for handleGetMe, the one call site that actually
 * means "a login just happened" - see getUserIdByAuth0Sub above for the
 * read-only id lookup every other route should use instead.
 */
export async function upsertUser(
  db: D1Database,
  params: { auth0Sub: string; email: string | null; emailVerified: boolean; displayName: string | null }
): Promise<UserRow> {
  const now = new Date().toISOString();
  const existing = await getUserByAuth0Sub(db, params.auth0Sub);
  const emailVerified = params.email && params.emailVerified ? 1 : 0;

  if (existing) {
    await db.prepare('UPDATE users SET last_login_at = ?, email = ?, email_verified = ?, display_name = ? WHERE id = ?')
      .bind(now, params.email, emailVerified, params.displayName, existing.id)
      .run();
    return { ...existing, last_login_at: now, email: params.email, email_verified: emailVerified, display_name: params.displayName };
  }

  // A verified email lets us recognize the same person returning through a
  // different Auth0 connection (e.g. signed up with Google, comes back via
  // Discord using the same address) as the account they already have,
  // instead of silently starting a second, empty one - see
  // migrations/0005_user_email_verified.sql. Adopting the new sub onto the
  // existing row (rather than the other way around) is what makes this
  // self-correcting: whichever provider they log in with most recently is
  // the one recognized directly next time, and either one still resolves
  // back to this row via the email match if it doesn't match by sub.
  const linkTarget = emailVerified ? await getUserByVerifiedEmail(db, params.email as string) : null;
  if (linkTarget) {
    await db.prepare('UPDATE users SET auth0_sub = ?, last_login_at = ?, email = ?, email_verified = ?, display_name = ? WHERE id = ?')
      .bind(params.auth0Sub, now, params.email, emailVerified, params.displayName, linkTarget.id)
      .run();
    return { ...linkTarget, auth0_sub: params.auth0Sub, last_login_at: now, email: params.email, email_verified: emailVerified, display_name: params.displayName };
  }

  const row: UserRow = {
    id: crypto.randomUUID(),
    auth0_sub: params.auth0Sub,
    email: params.email,
    email_verified: emailVerified,
    display_name: params.displayName,
    created_at: now,
    last_login_at: now
  };
  await db.prepare(
    'INSERT INTO users (id, auth0_sub, email, email_verified, display_name, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(row.id, row.auth0_sub, row.email, row.email_verified, row.display_name, row.created_at, row.last_login_at).run();
  return row;
}

/**
 * Insert-if-missing, with no write at all (not even to last_login_at) when
 * the row already exists - unlike upsertUser, this never means "a login
 * just happened," so it shouldn't touch that field. Reserved for
 * handleCreateBuild: the real client always calls GET /api/users/me on
 * login before anything else (see auth.service.ts, which is what actually
 * creates the row in the common case), but this API is callable directly,
 * so create is the one build-mutating route that still has to tolerate a
 * genuinely first-ever call. Returns just the id, since that's all any
 * caller has needed so far.
 */
export async function ensureUser(
  db: D1Database,
  params: { auth0Sub: string; email: string | null; emailVerified: boolean; displayName: string | null }
): Promise<string> {
  const existingId = await getUserIdByAuth0Sub(db, params.auth0Sub);
  if (existingId) {
    return existingId;
  }

  // See upsertUser's comment on why only a verified email links accounts.
  // Repointing auth0_sub here is the one write this function makes for an
  // already-known person - the "no write when already known" guarantee
  // above is about not churning last_login_at on every request, not about
  // never recognizing a returning user logging in through a second linked
  // provider for the first time.
  const emailVerified = params.email && params.emailVerified ? 1 : 0;
  if (emailVerified) {
    const linkTarget = await getUserByVerifiedEmail(db, params.email as string);
    if (linkTarget) {
      await db.prepare('UPDATE users SET auth0_sub = ? WHERE id = ?').bind(params.auth0Sub, linkTarget.id).run();
      return linkTarget.id;
    }
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await db.prepare(
    'INSERT INTO users (id, auth0_sub, email, email_verified, display_name, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, params.auth0Sub, params.email, emailVerified, params.displayName, now, now).run();
  return id;
}

// Which table a shortId belongs to, from the shared allocator (see
// migrations/0003) - handleGetByShortId uses this to go straight to the
// right table in one lookup, instead of trying builds first and falling
// back to shortlinks (which is also what let the two silently shadow each
// other before the allocator existed).
export async function getShortIdKind(db: D1Database, shortId: string): Promise<ShortIdKind | null> {
  const row = await db.prepare('SELECT kind FROM short_ids WHERE short_id = ?').bind(shortId).first<{ kind: ShortIdKind }>();
  return row?.kind ?? null;
}

/**
 * Reserves `row.short_id` in the shared allocator and inserts the build row
 * in one atomic batch - either both succeed or neither does. This is what
 * actually makes the allocator meaningful: a plain insert with no
 * corresponding short_ids row would let a build and a shortlink collide on
 * the exact case this table exists to prevent. A UNIQUE violation on either
 * statement (short_ids.short_id, or builds.short_id as a redundant second
 * guard) rejects the whole batch - see shortId.ts's withUniqueShortId for
 * the retry-with-a-fresh-id loop this is called from.
 *
 * The insert also re-checks the owner's build count live, in the same
 * atomic statement (`WHERE (SELECT COUNT...) < limit.max`), rather than
 * trusting a count checked in an earlier, separate query -
 * handleCreateBuild's own pre-check is exactly that earlier, separate
 * query, and exists purely so the common (non-racy) over-limit case never
 * reaches this far; it is NOT what actually enforces the cap, since two
 * near-simultaneous creates could otherwise both pass it before either
 * finishes inserting. Returns whether the build was actually inserted -
 * false means this live check blocked it. On a block, the short_ids
 * reservation is still consumed (the two statements aren't independently
 * conditional on each other) - an orphaned allocator row, acceptable and
 * rare (only at the exact moment two creates from the same account race
 * right at the limit), versus the alternative of a genuinely unbounded
 * overshoot.
 */
export async function reserveAndInsertBuildIfUnderLimit(
  db: D1Database,
  row: BuildRow,
  limit: { ownerUserId: string; max: number }
): Promise<boolean> {
  const result = await db.batch<unknown>([
    db.prepare('INSERT INTO short_ids (short_id, kind, created_at) VALUES (?, ?, ?)')
      .bind(row.short_id, 'build', row.created_at),
    db.prepare(
      `INSERT INTO builds (id, short_id, owner_user_id, name, blob, visibility, created_at, updated_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?
       WHERE (SELECT COUNT(*) FROM builds WHERE owner_user_id = ?) < ?`
    ).bind(row.id, row.short_id, row.owner_user_id, row.name, row.blob, row.visibility, row.created_at, row.updated_at, limit.ownerUserId, limit.max)
  ]);
  return (result[1]?.meta.changes ?? 0) > 0;
}

export async function getBuildByShortId(db: D1Database, shortId: string): Promise<BuildRow | null> {
  return await db.prepare('SELECT * FROM builds WHERE short_id = ?').bind(shortId).first<BuildRow>();
}

export async function getBuildById(db: D1Database, id: string): Promise<BuildRow | null> {
  return await db.prepare('SELECT * FROM builds WHERE id = ?').bind(id).first<BuildRow>();
}

export async function listBuildSummariesByOwner(db: D1Database, ownerUserId: string): Promise<BuildSummaryRow[]> {
  const result = await db.prepare(
    'SELECT id, short_id, owner_user_id, name, visibility, created_at, updated_at FROM builds WHERE owner_user_id = ? ORDER BY updated_at DESC'
  )
    .bind(ownerUserId)
    .all<BuildSummaryRow>();
  return result.results ?? [];
}

// A dedicated COUNT query rather than listBuildSummariesByOwner(...).length -
// avoids pulling every row back at all just to check a limit (see
// handleCreateBuild's MAX_BUILDS_PER_USER check, and handleGetMe's
// buildCount).
export async function countBuildsByOwner(db: D1Database, ownerUserId: string): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) as count FROM builds WHERE owner_user_id = ?')
    .bind(ownerUserId)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

/** Renames a build and/or replaces its blob, as a statement to run in a batch with others. */
export function updateBuildStatement(
  db: D1Database, id: string, fields: { name?: string; blob?: string }, updatedAt: string
): D1PreparedStatement {
  const sets: string[] = [];
  const values: unknown[] = [];

  if (fields.name !== undefined) {
    sets.push('name = ?');
    values.push(fields.name);
  }
  if (fields.blob !== undefined) {
    sets.push('blob = ?');
    values.push(fields.blob);
  }
  sets.push('updated_at = ?');
  values.push(updatedAt);
  values.push(id);

  return db.prepare(`UPDATE builds SET ${sets.join(', ')} WHERE id = ?`).bind(...values);
}

// Everything a friend's live list needs (see live.ts): the build itself and
// the public columns of its progress. Selects only those, so the private
// ones (ticks, picks) can't leak through a careless mapping. Null when
// there's no public build by that shortId (a private build, a short link,
// or nothing at all); null progress columns when the build exists but its
// owner has never synced a list.
export interface LiveBuildRow {
  name: string;
  blob: string;
  build_updated_at: string;
  needed: string | null;
  route: string | null;
  route_order: string | null;
  updated_at: string | null;
}

export async function getLiveBuildByShortId(db: D1Database, shortId: string): Promise<LiveBuildRow | null> {
  return await db.prepare(
    `SELECT b.name, b.blob, b.updated_at AS build_updated_at, p.needed, p.route, p.route_order, p.updated_at FROM builds b
     LEFT JOIN build_progress p ON p.build_id = b.id
     WHERE b.short_id = ? AND b.visibility = 'public'`
  ).bind(shortId).first();
}

export async function getBuildProgress(db: D1Database, buildId: string): Promise<BuildProgressRow | null> {
  return await db.prepare('SELECT * FROM build_progress WHERE build_id = ?').bind(buildId).first<BuildProgressRow>();
}

// Summed over all of an owner's builds - the daily write cap is per user.
export async function countProgressWritesOnDay(db: D1Database, ownerUserId: string, day: string): Promise<number> {
  const row = await db.prepare(
    'SELECT COALESCE(SUM(writes_today), 0) as count FROM build_progress WHERE owner_user_id = ? AND write_day = ?'
  ).bind(ownerUserId, day).first<{ count: number }>();
  return row?.count ?? 0;
}

/**
 * Inserts or replaces a build's progress, counting the write against
 * `row.write_day`, but only if the stored row is still the one the caller
 * read (`baseUpdatedAt`) and was last written no later than `notAfter`.
 *
 * That one condition is both the write throttle and the lock: routes/
 * progress.ts merges a patch into the row it read, so a write that raced
 * another one would otherwise drop that one's changes. Here it simply
 * changes nothing. Returns whether the row was written.
 */
export async function upsertBuildProgressIfUnchanged(
  db: D1Database,
  row: Omit<BuildProgressRow, 'writes_today'>,
  condition: { baseUpdatedAt: string | null; notAfter: string }
): Promise<boolean> {
  const result = await upsertBuildProgressStatement(db, row, condition).run();
  return (result.meta.changes ?? 0) > 0;
}

/** upsertBuildProgressIfUnchanged as a statement, to run in a batch; it wrote the row if it changed one. */
export function upsertBuildProgressStatement(
  db: D1Database,
  row: Omit<BuildProgressRow, 'writes_today'>,
  condition: { baseUpdatedAt: string | null; notAfter: string }
): D1PreparedStatement {
  return db.prepare(
    `INSERT INTO build_progress (build_id, owner_user_id, entries, picks, needed, route, route_order, updated_at, write_day, writes_today)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
     ON CONFLICT(build_id) DO UPDATE SET
       entries = excluded.entries,
       picks = excluded.picks,
       needed = excluded.needed,
       route = excluded.route,
       route_order = excluded.route_order,
       updated_at = excluded.updated_at,
       writes_today = CASE WHEN build_progress.write_day = excluded.write_day THEN build_progress.writes_today + 1 ELSE 1 END,
       write_day = excluded.write_day
     WHERE build_progress.updated_at = ? AND build_progress.updated_at <= ?`
  ).bind(
    row.build_id, row.owner_user_id, row.entries, row.picks, row.needed, row.route, row.route_order, row.updated_at, row.write_day,
    condition.baseUpdatedAt, condition.notAfter
  );
}

// Progress and group places first, in one batch: both reference builds,
// and their ON DELETE CASCADEs are only backstops (see migrations/0006 and
// 0008).
export async function deleteBuild(db: D1Database, id: string): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM build_progress WHERE build_id = ?').bind(id),
    db.prepare('DELETE FROM group_builds WHERE build_id = ?').bind(id),
    db.prepare('DELETE FROM builds WHERE id = ?').bind(id)
  ]);
}

// blob here is the JSON envelope {"name": ..., "blob": ...} (see
// routes/shortlinks.ts), not the raw gear blob - the single UNIQUE
// constraint on this column is what makes "same gear AND same name" dedupe
// to one row. creator_user_id is nullable: shortlinks predating this column
// (and, in principle, any future anonymous-creation path) have no known
// creator - see migrations/0003.
export interface ShortLinkRow {
  short_id: string;
  blob: string;
  creator_user_id: string | null;
  created_at: string;
}

/** Same atomicity rationale as reserveAndInsertBuild - see its comment. */
export async function reserveAndInsertShortLink(db: D1Database, row: ShortLinkRow): Promise<void> {
  await db.batch([
    db.prepare('INSERT INTO short_ids (short_id, kind, created_at) VALUES (?, ?, ?)')
      .bind(row.short_id, 'shortlink', row.created_at),
    db.prepare('INSERT INTO shortlinks (short_id, blob, creator_user_id, created_at) VALUES (?, ?, ?, ?)')
      .bind(row.short_id, row.blob, row.creator_user_id, row.created_at)
  ]);
}

export async function getShortLinkByStoredBlob(db: D1Database, stored: string): Promise<ShortLinkRow | null> {
  return await db.prepare('SELECT * FROM shortlinks WHERE blob = ?').bind(stored).first<ShortLinkRow>();
}

export async function getShortLinkByShortId(db: D1Database, shortId: string): Promise<ShortLinkRow | null> {
  return await db.prepare('SELECT * FROM shortlinks WHERE short_id = ?').bind(shortId).first<ShortLinkRow>();
}

// A group run - see migrations/0008 and routes/groups.ts.
export interface GroupRow {
  id: string;
  short_id: string;
  host_user_id: string;
  name: string;
  invite_token: string;
  picks: string;
  route_order: string | null;
  created_at: string;
  updated_at: string;
}

export interface GroupBuildRow {
  group_id: string;
  build_id: string;
  added_by_user_id: string;
  character_name: string;
  added_at: string;
}

/**
 * One build of a group, with everything its live room sends of it: the
 * group_builds row, the build, and the public columns of its progress -
 * never its ticks or picks. In the order the builds were added.
 */
export interface GroupMemberRow {
  build_id: string;
  character_name: string;
  added_at: string;
  short_id: string;
  owner_user_id: string;
  name: string;
  blob: string;
  build_updated_at: string;
  needed: string | null;
  route: string | null;
  route_order: string | null;
  updated_at: string | null;
}

/** A group someone hosts or has a build in, for their list of group runs. */
export interface GroupSummaryRow {
  short_id: string;
  name: string;
  invite_token: string;
  host_user_id: string;
  updated_at: string;
  build_count: number;
  /** The latest progress write of any of its builds; null when none has any. */
  progress_at: string | null;
}

/**
 * Reserves the group's shortId and inserts it with its first builds, in one
 * atomic batch - the same allocator rationale as
 * reserveAndInsertBuildIfUnderLimit.
 */
export async function reserveAndInsertGroup(db: D1Database, group: GroupRow, builds: readonly GroupBuildRow[]): Promise<void> {
  await db.batch([
    db.prepare('INSERT INTO short_ids (short_id, kind, created_at) VALUES (?, ?, ?)')
      .bind(group.short_id, 'group', group.created_at),
    db.prepare(
      `INSERT INTO groups (id, short_id, host_user_id, name, invite_token, picks, route_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(group.id, group.short_id, group.host_user_id, group.name, group.invite_token, group.picks, group.route_order,
      group.created_at, group.updated_at),
    ...builds.map(build => insertGroupBuildStatement(db, build))
  ]);
}

function insertGroupBuildStatement(db: D1Database, row: GroupBuildRow): D1PreparedStatement {
  return db.prepare(
    'INSERT INTO group_builds (group_id, build_id, added_by_user_id, character_name, added_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(row.group_id, row.build_id, row.added_by_user_id, row.character_name, row.added_at);
}

export async function getGroupByShortId(db: D1Database, shortId: string): Promise<GroupRow | null> {
  return await db.prepare('SELECT * FROM groups WHERE short_id = ?').bind(shortId).first<GroupRow>();
}

export async function listGroupMembers(db: D1Database, groupId: string): Promise<GroupMemberRow[]> {
  const result = await db.prepare(
    `SELECT gb.build_id, gb.character_name, gb.added_at, b.short_id, b.owner_user_id, b.name, b.blob,
       b.updated_at AS build_updated_at, p.needed, p.route, p.route_order, p.updated_at
     FROM group_builds gb
     JOIN builds b ON b.id = gb.build_id
     LEFT JOIN build_progress p ON p.build_id = gb.build_id
     WHERE gb.group_id = ?
     ORDER BY gb.added_at, gb.build_id`
  ).bind(groupId).all<GroupMemberRow>();
  return result.results ?? [];
}

/** The groups a build is in, by shortId: where its friends' live list also goes. */
export async function listGroupShortIdsForBuild(db: D1Database, buildId: string): Promise<string[]> {
  const result = await db.prepare(
    'SELECT g.short_id FROM group_builds gb JOIN groups g ON g.id = gb.group_id WHERE gb.build_id = ?'
  ).bind(buildId).all<{ short_id: string }>();
  return (result.results ?? []).map(row => row.short_id);
}

/** The groups a user hosts or has a build in, most recently changed first. */
export async function listGroupsForUser(db: D1Database, userId: string): Promise<GroupSummaryRow[]> {
  const result = await db.prepare(
    `SELECT g.short_id, g.name, g.invite_token, g.host_user_id, g.updated_at,
       (SELECT COUNT(*) FROM group_builds c WHERE c.group_id = g.id) AS build_count,
       (SELECT MAX(p.updated_at) FROM group_builds pb JOIN build_progress p ON p.build_id = pb.build_id
         WHERE pb.group_id = g.id) AS progress_at
     FROM groups g
     WHERE g.host_user_id = ?
       OR EXISTS (SELECT 1 FROM group_builds m JOIN builds mb ON mb.id = m.build_id WHERE m.group_id = g.id AND mb.owner_user_id = ?)
     ORDER BY g.updated_at DESC`
  ).bind(userId, userId).all<GroupSummaryRow>();
  return result.results ?? [];
}

export async function countGroupsHostedBy(db: D1Database, userId: string): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) as count FROM groups WHERE host_user_id = ?')
    .bind(userId)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

/**
 * Adds a build to a group, re-checking the group's build count in the same
 * statement, as reserveAndInsertBuildIfUnderLimit does for a user's builds,
 * and bumps the group's updated_at. Returns whether the build was added -
 * false means the group is full. A build already in the group, or a
 * character name already taken there, throws a UNIQUE violation.
 */
export async function insertGroupBuildIfUnderLimit(db: D1Database, row: GroupBuildRow, max: number): Promise<boolean> {
  const result = await db.batch<unknown>([
    db.prepare(
      `INSERT INTO group_builds (group_id, build_id, added_by_user_id, character_name, added_at)
       SELECT ?, ?, ?, ?, ?
       WHERE (SELECT COUNT(*) FROM group_builds WHERE group_id = ?) < ?`
    ).bind(row.group_id, row.build_id, row.added_by_user_id, row.character_name, row.added_at, row.group_id, max),
    touchGroupStatement(db, row.group_id, row.added_at)
  ]);
  return (result[0]?.meta.changes ?? 0) > 0;
}

/** Renames a build's character in a group. Throws a UNIQUE violation for a name already taken there. */
export async function renameGroupBuild(db: D1Database, groupId: string, buildId: string, name: string, now: string): Promise<boolean> {
  const result = await db.batch<unknown>([
    db.prepare('UPDATE group_builds SET character_name = ? WHERE group_id = ? AND build_id = ?').bind(name, groupId, buildId),
    touchGroupStatement(db, groupId, now)
  ]);
  return (result[0]?.meta.changes ?? 0) > 0;
}

export async function deleteGroupBuild(db: D1Database, groupId: string, buildId: string, now: string): Promise<boolean> {
  const result = await db.batch<unknown>([
    db.prepare('DELETE FROM group_builds WHERE group_id = ? AND build_id = ?').bind(groupId, buildId),
    touchGroupStatement(db, groupId, now)
  ]);
  return (result[0]?.meta.changes ?? 0) > 0;
}

function touchGroupStatement(db: D1Database, groupId: string, now: string): D1PreparedStatement {
  return db.prepare('UPDATE groups SET updated_at = ? WHERE id = ?').bind(now, groupId);
}

/**
 * Replaces the group's shared route, but only if the row is still the one
 * the caller read (`baseUpdatedAt`) and was last written no later than
 * `notAfter` - the same throttle-and-lock as upsertBuildProgressIfUnchanged.
 * Returns whether it was written.
 */
export async function updateGroupRouteIfUnchanged(
  db: D1Database, groupId: string, route: { picks: string; route_order: string | null; updated_at: string },
  condition: { baseUpdatedAt: string; notAfter: string }
): Promise<boolean> {
  const result = await db.prepare(
    'UPDATE groups SET picks = ?, route_order = ?, updated_at = ? WHERE id = ? AND updated_at = ? AND updated_at <= ?'
  ).bind(route.picks, route.route_order, route.updated_at, groupId, condition.baseUpdatedAt, condition.notAfter).run();
  return (result.meta.changes ?? 0) > 0;
}

export async function updateGroupInviteToken(db: D1Database, groupId: string, token: string, now: string): Promise<void> {
  await db.prepare('UPDATE groups SET invite_token = ?, updated_at = ? WHERE id = ?').bind(token, now, groupId).run();
}

// Builds first, in one batch: group_builds references groups, and its ON
// DELETE CASCADE is only a backstop (see migrations/0008).
export async function deleteGroups(db: D1Database, groupIds: readonly string[]): Promise<void> {
  if (!groupIds.length) {
    return;
  }
  await db.batch(groupIds.flatMap(id => [
    db.prepare('DELETE FROM group_builds WHERE group_id = ?').bind(id),
    db.prepare('DELETE FROM groups WHERE id = ?').bind(id)
  ]));
}
