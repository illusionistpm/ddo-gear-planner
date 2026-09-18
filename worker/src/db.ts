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

export type ShortIdKind = 'build' | 'shortlink';

export async function getUserByAuth0Sub(db: D1Database, auth0Sub: string): Promise<UserRow | null> {
  return await db.prepare('SELECT * FROM users WHERE auth0_sub = ?').bind(auth0Sub).first<UserRow>();
}

// Read-only - the id lookup every authenticated route except handleGetMe
// actually needs. upsertUser (below) does a write on every call (an UPDATE
// even when nothing changed), which made every GET/PUT/DELETE pay for a
// last_login_at bump that has nothing to do with logging in - see
// resolveOwnerUserId in routes/builds.ts. Returns null rather than creating
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

export async function updateBuild(db: D1Database, id: string, fields: { name?: string; blob?: string }): Promise<void> {
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
  values.push(new Date().toISOString());
  values.push(id);

  await db.prepare(`UPDATE builds SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run();
}

export async function deleteBuild(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM builds WHERE id = ?').bind(id).run();
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
