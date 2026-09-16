export interface UserRow {
  id: string;
  auth0_sub: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
  last_login_at: string;
}

export interface BuildRow {
  id: string;
  short_id: string;
  owner_user_id: string;
  name: string;
  blob: string;
  created_at: string;
  updated_at: string;
}

export async function getUserByAuth0Sub(db: D1Database, auth0Sub: string): Promise<UserRow | null> {
  return await db.prepare('SELECT * FROM users WHERE auth0_sub = ?').bind(auth0Sub).first<UserRow>();
}

/**
 * Finds the user by auth0_sub, updating last_login_at (and refreshing
 * email/display_name in case they changed at the provider) if found, or
 * creates a new row. This is where "basic user tracking" lands - see the
 * plan's Phase 4 note that created_at/last_login_at alone satisfy that at
 * this scale.
 */
export async function upsertUser(
  db: D1Database,
  params: { auth0Sub: string; email: string | null; displayName: string | null }
): Promise<UserRow> {
  const now = new Date().toISOString();
  const existing = await getUserByAuth0Sub(db, params.auth0Sub);

  if (existing) {
    await db.prepare('UPDATE users SET last_login_at = ?, email = ?, display_name = ? WHERE id = ?')
      .bind(now, params.email, params.displayName, existing.id)
      .run();
    return { ...existing, last_login_at: now, email: params.email, display_name: params.displayName };
  }

  const row: UserRow = {
    id: crypto.randomUUID(),
    auth0_sub: params.auth0Sub,
    email: params.email,
    display_name: params.displayName,
    created_at: now,
    last_login_at: now
  };
  await db.prepare(
    'INSERT INTO users (id, auth0_sub, email, display_name, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(row.id, row.auth0_sub, row.email, row.display_name, row.created_at, row.last_login_at).run();
  return row;
}

export async function insertBuild(db: D1Database, row: BuildRow): Promise<void> {
  await db.prepare(
    'INSERT INTO builds (id, short_id, owner_user_id, name, blob, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(row.id, row.short_id, row.owner_user_id, row.name, row.blob, row.created_at, row.updated_at).run();
}

export async function getBuildByShortId(db: D1Database, shortId: string): Promise<BuildRow | null> {
  return await db.prepare('SELECT * FROM builds WHERE short_id = ?').bind(shortId).first<BuildRow>();
}

export async function getBuildById(db: D1Database, id: string): Promise<BuildRow | null> {
  return await db.prepare('SELECT * FROM builds WHERE id = ?').bind(id).first<BuildRow>();
}

export async function listBuildsByOwner(db: D1Database, ownerUserId: string): Promise<BuildRow[]> {
  const result = await db.prepare('SELECT * FROM builds WHERE owner_user_id = ? ORDER BY updated_at DESC')
    .bind(ownerUserId)
    .all<BuildRow>();
  return result.results ?? [];
}

// A dedicated COUNT query rather than listBuildsByOwner(...).length - avoids
// pulling every row's full blob back just to check a limit (see
// handleCreateBuild's MAX_BUILDS_PER_USER check).
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
// to one row.
export interface ShortLinkRow {
  short_id: string;
  blob: string;
  created_at: string;
}

export async function insertShortLink(db: D1Database, row: ShortLinkRow): Promise<void> {
  await db.prepare(
    'INSERT INTO shortlinks (short_id, blob, created_at) VALUES (?, ?, ?)'
  ).bind(row.short_id, row.blob, row.created_at).run();
}

export async function getShortLinkByStoredBlob(db: D1Database, stored: string): Promise<ShortLinkRow | null> {
  return await db.prepare('SELECT * FROM shortlinks WHERE blob = ?').bind(stored).first<ShortLinkRow>();
}

export async function getShortLinkByShortId(db: D1Database, shortId: string): Promise<ShortLinkRow | null> {
  return await db.prepare('SELECT * FROM shortlinks WHERE short_id = ?').bind(shortId).first<ShortLinkRow>();
}
