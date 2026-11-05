// Shared in-memory D1/KV stand-ins for the route-handler tests. Previously
// each test file (builds.test.ts, shortlinks.test.ts, rateLimit.test.ts)
// hand-rolled its own minimal FakeD1/FakeKV covering only the queries its
// own file's handlers happened to touch - once builds and shortlinks
// started sharing the short_ids allocator table (see migrations/0003),
// keeping those independent would mean re-deriving the same cross-table
// invariants twice. One shared fake, covering every query src/db.ts
// actually issues, plus a real (snapshot/restore) implementation of
// D1Database.batch()'s all-or-nothing semantics - not a full SQL engine,
// just enough pattern-matching on each known query shape to stand in for
// the real thing in a unit test. A genuine SQL-semantics regression still
// belongs in an integration test against real D1 (`wrangler dev --local`),
// not here.

import type { Env } from '../src/auth';

export interface FakeUserRow {
  id: string;
  auth0_sub: string;
  email: string | null;
  email_verified: number;
  display_name: string | null;
  created_at: string;
  last_login_at: string;
}

export interface FakeBuildRow {
  id: string;
  short_id: string;
  owner_user_id: string;
  name: string;
  blob: string;
  visibility: string;
  created_at: string;
  updated_at: string;
}

export interface FakeShortLinkRow {
  short_id: string;
  blob: string;
  creator_user_id: string | null;
  created_at: string;
}

export interface FakeBuildProgressRow {
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

export interface FakeGroupRow {
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

export interface FakeGroupBuildRow {
  group_id: string;
  build_id: string;
  added_by_user_id: string;
  character_name: string;
  added_at: string;
}

export interface FakeShortIdRow {
  short_id: string;
  kind: string;
  created_at: string;
}

interface FakeD1Snapshot {
  users: FakeUserRow[];
  builds: FakeBuildRow[];
  shortlinks: FakeShortLinkRow[];
  shortIds: FakeShortIdRow[];
  buildProgress: FakeBuildProgressRow[];
  groups: FakeGroupRow[];
  groupBuilds: FakeGroupBuildRow[];
}

class FakeD1PreparedStatement {
  constructor(private readonly db: FakeD1, private readonly sql: string, private readonly args: unknown[] = []) {}

  bind(...args: unknown[]): FakeD1PreparedStatement {
    return new FakeD1PreparedStatement(this.db, this.sql, args);
  }

  async first<T = unknown>(): Promise<T | null> {
    return this.db._first(this.sql, this.args) as T | null;
  }

  async all<T = unknown>(): Promise<{ results: T[] }> {
    return { results: this.db._all(this.sql, this.args) as T[] };
  }

  async run(): Promise<{ meta: { changes: number } }> {
    return this.db._write(this.sql, this.args);
  }
}

function unique<T>(rows: T[], predicate: (row: T) => boolean): boolean {
  return rows.some(predicate);
}

export class FakeD1 {
  users: FakeUserRow[] = [];
  builds: FakeBuildRow[] = [];
  shortlinks: FakeShortLinkRow[] = [];
  shortIds: FakeShortIdRow[] = [];
  buildProgress: FakeBuildProgressRow[] = [];
  groups: FakeGroupRow[] = [];
  groupBuilds: FakeGroupBuildRow[] = [];

  prepare(sql: string): FakeD1PreparedStatement {
    return new FakeD1PreparedStatement(this, sql);
  }

  // D1's real batch() wraps every statement in one atomic transaction - a
  // failure partway through rolls back everything in the batch, not just
  // the failing statement. reserveAndInsertBuildIfUnderLimit/
  // reserveAndInsertShortLink (db.ts) depend on exactly this: a short_ids
  // reservation must not survive if the row it was reserved for never
  // actually got inserted.
  async batch<T = unknown>(statements: FakeD1PreparedStatement[]): Promise<{ meta: { changes: number } }[]> {
    const snapshot = this._snapshot();
    const results: { meta: { changes: number } }[] = [];
    try {
      for (const statement of statements) {
        results.push(await statement.run());
      }
      return results as unknown as { meta: { changes: number } }[] & T[];
    } catch (err) {
      this._restore(snapshot);
      throw err;
    }
  }

  private _snapshot(): FakeD1Snapshot {
    return {
      users: [...this.users],
      builds: [...this.builds],
      shortlinks: [...this.shortlinks],
      shortIds: [...this.shortIds],
      buildProgress: this.buildProgress.map(row => ({ ...row })),
      groups: this.groups.map(row => ({ ...row })),
      groupBuilds: this.groupBuilds.map(row => ({ ...row }))
    };
  }

  private _restore(snapshot: FakeD1Snapshot): void {
    this.users = snapshot.users;
    this.builds = snapshot.builds;
    this.shortlinks = snapshot.shortlinks;
    this.shortIds = snapshot.shortIds;
    this.buildProgress = snapshot.buildProgress;
    this.groups = snapshot.groups;
    this.groupBuilds = snapshot.groupBuilds;
  }

  /** Inserts a group_builds row, enforcing its primary key and its case-insensitive name index. */
  private _insertGroupBuild(row: FakeGroupBuildRow): void {
    if (this.groupBuilds.some(g => g.group_id === row.group_id && g.build_id === row.build_id)) {
      throw new Error('D1_ERROR: UNIQUE constraint failed: group_builds.group_id, group_builds.build_id');
    }
    if (this.groupBuilds.some(g => g.group_id === row.group_id && g.character_name.toLowerCase() === row.character_name.toLowerCase())) {
      throw new Error('D1_ERROR: UNIQUE constraint failed: group_builds.group_id, group_builds.character_name');
    }
    this.groupBuilds.push(row);
  }

  _first(sql: string, args: unknown[]): unknown {
    if (sql.includes('SELECT id FROM users WHERE auth0_sub')) {
      const user = this.users.find(u => u.auth0_sub === args[0]);
      return user ? { id: user.id } : null;
    }
    if (sql.includes('FROM users WHERE auth0_sub')) {
      return this.users.find(u => u.auth0_sub === args[0]) ?? null;
    }
    if (sql.includes('FROM users WHERE email') && sql.includes('email_verified = 1')) {
      return this.users.find(u => u.email === args[0] && u.email_verified === 1) ?? null;
    }
    if (sql.includes('SELECT * FROM build_progress WHERE build_id')) {
      const row = this.buildProgress.find(p => p.build_id === args[0]);
      return row ? { ...row } : null;
    }
    if (sql.includes('SUM(writes_today)') && sql.includes('FROM build_progress')) {
      const [ownerUserId, day] = args as [string, string];
      return {
        count: this.buildProgress
          .filter(p => p.owner_user_id === ownerUserId && p.write_day === day)
          .reduce((sum, p) => sum + p.writes_today, 0)
      };
    }
    // getLiveBuildByShortId: builds LEFT JOIN build_progress, public
    // builds only, and only the public columns.
    if (sql.includes('FROM builds b') && sql.includes('LEFT JOIN build_progress p')) {
      const build = this.builds.find(b => b.short_id === args[0] && b.visibility === 'public');
      if (!build) {
        return null;
      }
      const progress = this.buildProgress.find(p => p.build_id === build.id);
      return {
        name: build.name, blob: build.blob, build_updated_at: build.updated_at,
        needed: progress?.needed ?? null, route: progress?.route ?? null, route_order: progress?.route_order ?? null,
        updated_at: progress?.updated_at ?? null
      };
    }
    if (sql.includes('SELECT * FROM groups WHERE short_id')) {
      const row = this.groups.find(g => g.short_id === args[0]);
      return row ? { ...row } : null;
    }
    if (sql.includes('SELECT COUNT(*) as count FROM groups WHERE host_user_id')) {
      return { count: this.groups.filter(g => g.host_user_id === args[0]).length };
    }
    if (sql.includes('SELECT kind FROM short_ids WHERE short_id')) {
      const row = this.shortIds.find(s => s.short_id === args[0]);
      return row ? { kind: row.kind } : null;
    }
    if (sql.includes('SELECT COUNT(*) as count FROM builds WHERE owner_user_id')) {
      return { count: this.builds.filter(b => b.owner_user_id === args[0]).length };
    }
    if (sql.includes('FROM builds WHERE short_id')) {
      return this.builds.find(b => b.short_id === args[0]) ?? null;
    }
    if (sql.includes('FROM builds WHERE id')) {
      return this.builds.find(b => b.id === args[0]) ?? null;
    }
    if (sql.includes('FROM shortlinks WHERE blob')) {
      return this.shortlinks.find(s => s.blob === args[0]) ?? null;
    }
    if (sql.includes('FROM shortlinks WHERE short_id')) {
      return this.shortlinks.find(s => s.short_id === args[0]) ?? null;
    }
    throw new Error(`FakeD1: unrecognized first() SQL: ${sql}`);
  }

  _all(sql: string, args: unknown[]): unknown[] {
    // listGroupMembers: group_builds JOIN builds LEFT JOIN build_progress, in the order added.
    if (sql.includes('FROM group_builds gb') && sql.includes('WHERE gb.group_id')) {
      return this.groupBuilds
        .filter(g => g.group_id === args[0])
        .slice()
        .sort((a, b) => a.added_at.localeCompare(b.added_at) || a.build_id.localeCompare(b.build_id))
        .flatMap(g => {
          const build = this.builds.find(b => b.id === g.build_id);
          if (!build) {
            return [];
          }
          const progress = this.buildProgress.find(p => p.build_id === g.build_id);
          return [{
            build_id: g.build_id, character_name: g.character_name, added_at: g.added_at,
            short_id: build.short_id, owner_user_id: build.owner_user_id, name: build.name, blob: build.blob,
            build_updated_at: build.updated_at, needed: progress?.needed ?? null, route: progress?.route ?? null,
            route_order: progress?.route_order ?? null, updated_at: progress?.updated_at ?? null
          }];
        });
    }
    if (sql.includes('SELECT g.short_id FROM group_builds gb JOIN groups g')) {
      return this.groupBuilds
        .filter(g => g.build_id === args[0])
        .flatMap(g => this.groups.filter(group => group.id === g.group_id).map(group => ({ short_id: group.short_id })));
    }
    // listGroupsForUser: hosted, or holding one of the user's builds; newest change first.
    if (sql.includes('FROM groups g') && sql.includes('WHERE g.host_user_id')) {
      const userId = args[0] as string;
      return this.groups
        .filter(group => group.host_user_id === userId || this.groupBuilds.some(g => g.group_id === group.id
          && this.builds.some(b => b.id === g.build_id && b.owner_user_id === userId)))
        .slice()
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .map(group => {
          const builds = this.groupBuilds.filter(g => g.group_id === group.id);
          const progressAt = builds
            .map(g => this.buildProgress.find(p => p.build_id === g.build_id)?.updated_at ?? null)
            .reduce<string | null>((latest, at) => at && (!latest || at > latest) ? at : latest, null);
          return {
            short_id: group.short_id, name: group.name, invite_token: group.invite_token, host_user_id: group.host_user_id,
            updated_at: group.updated_at, build_count: builds.length, progress_at: progressAt
          };
        });
    }
    if (sql.includes('FROM builds WHERE owner_user_id')) {
      const rows = this.builds
        .filter(b => b.owner_user_id === args[0])
        .slice()
        .sort((a, b) => (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0));
      if (sql.includes('SELECT id, short_id')) {
        return rows.map(({ blob, ...summary }) => summary);
      }
      return rows;
    }
    throw new Error(`FakeD1: unrecognized all() SQL: ${sql}`);
  }

  _write(sql: string, args: unknown[]): { meta: { changes: number } } {
    if (sql.startsWith('INSERT INTO users')) {
      const [id, auth0Sub, email, emailVerified, displayName, createdAt, lastLoginAt] =
        args as [string, string, string | null, number, string | null, string, string];
      if (unique(this.users, u => u.auth0_sub === auth0Sub)) {
        throw new Error('D1_ERROR: UNIQUE constraint failed: users.auth0_sub');
      }
      if (emailVerified === 1 && email !== null && unique(this.users, u => u.email === email && u.email_verified === 1)) {
        throw new Error('D1_ERROR: UNIQUE constraint failed: idx_users_verified_email');
      }
      this.users.push({ id, auth0_sub: auth0Sub, email, email_verified: emailVerified, display_name: displayName, created_at: createdAt, last_login_at: lastLoginAt });
      return { meta: { changes: 1 } };
    }

    // ensureUser's link-only write: just repoints auth0_sub onto an
    // existing row found by verified email, nothing else changes.
    if (sql.startsWith('UPDATE users SET auth0_sub = ? WHERE id')) {
      const [auth0Sub, id] = args as [string, string];
      const user = this.users.find(u => u.id === id);
      if (user) {
        user.auth0_sub = auth0Sub;
      }
      return { meta: { changes: user ? 1 : 0 } };
    }

    // upsertUser's link write: repoints auth0_sub AND refreshes the
    // login/profile fields in one go, for the "found by email, not by sub"
    // case.
    if (sql.startsWith('UPDATE users SET auth0_sub = ?, last_login_at')) {
      const [auth0Sub, lastLoginAt, email, emailVerified, displayName, id] =
        args as [string, string, string | null, number, string | null, string];
      const user = this.users.find(u => u.id === id);
      if (user) {
        user.auth0_sub = auth0Sub;
        user.last_login_at = lastLoginAt;
        user.email = email;
        user.email_verified = emailVerified;
        user.display_name = displayName;
      }
      return { meta: { changes: user ? 1 : 0 } };
    }

    if (sql.startsWith('UPDATE users')) {
      const [lastLoginAt, email, emailVerified, displayName, id] = args as [string, string | null, number, string | null, string];
      const user = this.users.find(u => u.id === id);
      if (user) {
        user.last_login_at = lastLoginAt;
        user.email = email;
        user.email_verified = emailVerified;
        user.display_name = displayName;
      }
      return { meta: { changes: user ? 1 : 0 } };
    }

    if (sql.startsWith('INSERT INTO short_ids')) {
      const [shortId, kind, createdAt] = args as [string, string, string];
      if (unique(this.shortIds, s => s.short_id === shortId)) {
        throw new Error('D1_ERROR: UNIQUE constraint failed: short_ids.short_id');
      }
      this.shortIds.push({ short_id: shortId, kind, created_at: createdAt });
      return { meta: { changes: 1 } };
    }

    // reserveAndInsertBuildIfUnderLimit's guarded insert - a SELECT-shaped
    // INSERT whose WHERE clause is the live build-count re-check. Matched
    // by both markers since the real query spans multiple lines.
    if (sql.includes('INSERT INTO builds') && sql.includes('WHERE (SELECT COUNT')) {
      const [id, shortId, ownerUserId, name, blob, visibility, createdAt, updatedAt, countOwnerUserId, max] =
        args as [string, string, string, string, string, string, string, string, string, number];
      const currentCount = this.builds.filter(b => b.owner_user_id === countOwnerUserId).length;
      if (currentCount >= max) {
        return { meta: { changes: 0 } };
      }
      if (unique(this.builds, b => b.short_id === shortId)) {
        throw new Error('D1_ERROR: UNIQUE constraint failed: builds.short_id');
      }
      if (unique(this.builds, b => b.owner_user_id === ownerUserId && b.name.toLowerCase() === name.toLowerCase())) {
        throw new Error('D1_ERROR: UNIQUE constraint failed: builds.owner_user_id, builds.name');
      }
      this.builds.push({ id, short_id: shortId, owner_user_id: ownerUserId, name, blob, visibility, created_at: createdAt, updated_at: updatedAt });
      return { meta: { changes: 1 } };
    }

    if (sql.startsWith('UPDATE builds')) {
      const id = args[args.length - 1] as string;
      const build = this.builds.find(b => b.id === id);
      if (!build) {
        return { meta: { changes: 0 } };
      }
      let argIndex = 0;
      if (sql.includes('name = ?')) {
        const newName = args[argIndex++] as string;
        if (unique(this.builds, b => b.id !== id && b.owner_user_id === build.owner_user_id && b.name.toLowerCase() === newName.toLowerCase())) {
          throw new Error('D1_ERROR: UNIQUE constraint failed: builds.owner_user_id, builds.name');
        }
        build.name = newName;
      }
      if (sql.includes('blob = ?')) {
        build.blob = args[argIndex++] as string;
      }
      build.updated_at = args[argIndex] as string;
      return { meta: { changes: 1 } };
    }

    // upsertBuildProgressIfUnchanged: insert, or on a build_id conflict
    // update only while the stored row is the caller's base and old enough.
    if (sql.startsWith('INSERT INTO build_progress') && sql.includes('ON CONFLICT(build_id)')) {
      const [buildId, ownerUserId, entries, picks, needed, route, routeOrder, updatedAt, writeDay, baseUpdatedAt, notAfter] =
        args as [string, string, string, string, string | null, string | null, string | null, string, string, string | null, string];
      if (!this.builds.some(b => b.id === buildId)) {
        throw new Error('D1_ERROR: FOREIGN KEY constraint failed');
      }
      const existing = this.buildProgress.find(p => p.build_id === buildId);
      if (!existing) {
        this.buildProgress.push({
          build_id: buildId, owner_user_id: ownerUserId, entries, picks, needed, route, route_order: routeOrder,
          updated_at: updatedAt, write_day: writeDay, writes_today: 1
        });
        return { meta: { changes: 1 } };
      }
      if (existing.updated_at !== baseUpdatedAt || existing.updated_at > notAfter) {
        return { meta: { changes: 0 } };
      }
      existing.writes_today = existing.write_day === writeDay ? existing.writes_today + 1 : 1;
      Object.assign(existing, { entries, picks, needed, route, route_order: routeOrder, updated_at: updatedAt, write_day: writeDay });
      return { meta: { changes: 1 } };
    }

    if (sql.startsWith('DELETE FROM build_progress WHERE build_id')) {
      const before = this.buildProgress.length;
      this.buildProgress = this.buildProgress.filter(p => p.build_id !== args[0]);
      return { meta: { changes: before - this.buildProgress.length } };
    }

    if (sql.startsWith('DELETE FROM builds')) {
      const id = args[0] as string;
      const before = this.builds.length;
      this.builds = this.builds.filter(b => b.id !== id);
      return { meta: { changes: before - this.builds.length } };
    }

    if (sql.startsWith('INSERT INTO groups')) {
      const [id, shortId, hostUserId, name, inviteToken, picks, routeOrder, createdAt, updatedAt] =
        args as [string, string, string, string, string, string, string | null, string, string];
      if (unique(this.groups, g => g.short_id === shortId)) {
        throw new Error('D1_ERROR: UNIQUE constraint failed: groups.short_id');
      }
      this.groups.push({
        id, short_id: shortId, host_user_id: hostUserId, name, invite_token: inviteToken, picks, route_order: routeOrder,
        created_at: createdAt, updated_at: updatedAt
      });
      return { meta: { changes: 1 } };
    }

    // insertGroupBuildIfUnderLimit's guarded insert, and the plain one reserveAndInsertGroup makes.
    if (sql.startsWith('INSERT INTO group_builds')) {
      const [groupId, buildId, addedBy, characterName, addedAt, countGroupId, max] =
        args as [string, string, string, string, string, string?, number?];
      if (sql.includes('WHERE (SELECT COUNT') && this.groupBuilds.filter(g => g.group_id === countGroupId).length >= (max as number)) {
        return { meta: { changes: 0 } };
      }
      if (!this.builds.some(b => b.id === buildId) || !this.groups.some(g => g.id === groupId)) {
        throw new Error('D1_ERROR: FOREIGN KEY constraint failed');
      }
      this._insertGroupBuild({ group_id: groupId, build_id: buildId, added_by_user_id: addedBy, character_name: characterName, added_at: addedAt });
      return { meta: { changes: 1 } };
    }

    if (sql.startsWith('UPDATE group_builds SET character_name')) {
      const [name, groupId, buildId] = args as [string, string, string];
      const row = this.groupBuilds.find(g => g.group_id === groupId && g.build_id === buildId);
      if (!row) {
        return { meta: { changes: 0 } };
      }
      if (this.groupBuilds.some(g => g !== row && g.group_id === groupId && g.character_name.toLowerCase() === name.toLowerCase())) {
        throw new Error('D1_ERROR: UNIQUE constraint failed: group_builds.group_id, group_builds.character_name');
      }
      row.character_name = name;
      return { meta: { changes: 1 } };
    }

    if (sql.startsWith('DELETE FROM group_builds')) {
      const before = this.groupBuilds.length;
      if (sql.includes('WHERE group_id = ? AND build_id = ?')) {
        this.groupBuilds = this.groupBuilds.filter(g => !(g.group_id === args[0] && g.build_id === args[1]));
      } else if (sql.includes('WHERE group_id = ?')) {
        this.groupBuilds = this.groupBuilds.filter(g => g.group_id !== args[0]);
      } else {
        this.groupBuilds = this.groupBuilds.filter(g => g.build_id !== args[0]);
      }
      return { meta: { changes: before - this.groupBuilds.length } };
    }

    if (sql.startsWith('DELETE FROM groups WHERE id')) {
      const before = this.groups.length;
      this.groups = this.groups.filter(g => g.id !== args[0]);
      return { meta: { changes: before - this.groups.length } };
    }

    if (sql.startsWith('UPDATE groups SET updated_at = ? WHERE id')) {
      const group = this.groups.find(g => g.id === args[1]);
      if (group) {
        group.updated_at = args[0] as string;
      }
      return { meta: { changes: group ? 1 : 0 } };
    }

    if (sql.startsWith('UPDATE groups SET picks')) {
      const [picks, routeOrder, updatedAt, id, baseUpdatedAt, notAfter] = args as [string, string | null, string, string, string, string];
      const group = this.groups.find(g => g.id === id);
      if (!group || group.updated_at !== baseUpdatedAt || group.updated_at > notAfter) {
        return { meta: { changes: 0 } };
      }
      Object.assign(group, { picks, route_order: routeOrder, updated_at: updatedAt });
      return { meta: { changes: 1 } };
    }

    if (sql.startsWith('UPDATE groups SET invite_token')) {
      const [token, updatedAt, id] = args as [string, string, string];
      const group = this.groups.find(g => g.id === id);
      if (group) {
        Object.assign(group, { invite_token: token, updated_at: updatedAt });
      }
      return { meta: { changes: group ? 1 : 0 } };
    }

    if (sql.startsWith('INSERT INTO shortlinks')) {
      const [shortId, blob, creatorUserId, createdAt] = args as [string, string, string | null, string];
      if (unique(this.shortlinks, s => s.short_id === shortId)) {
        throw new Error('D1_ERROR: UNIQUE constraint failed: shortlinks.short_id');
      }
      if (unique(this.shortlinks, s => s.blob === blob)) {
        throw new Error('D1_ERROR: UNIQUE constraint failed: shortlinks.blob');
      }
      this.shortlinks.push({ short_id: shortId, blob, creator_user_id: creatorUserId, created_at: createdAt });
      return { meta: { changes: 1 } };
    }

    throw new Error(`FakeD1: unrecognized write SQL: ${sql}`);
  }
}

// Minimal in-memory stand-in for the one KVNamespace method the routes
// actually call (rateLimit.ts's get/put; handleGetByShortId's
// get/put/delete) - a real KV integration test belongs against
// `wrangler dev`'s local KV, not a unit test.
export function createFakeKv(): KVNamespace {
  const store = new Map<string, string>();
  return {
    get: async (key: string, type?: string) => {
      const value = store.get(key) ?? null;
      if (value !== null && type === 'json') {
        return JSON.parse(value);
      }
      return value;
    },
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
    delete: async (key: string) => {
      store.delete(key);
    }
  } as unknown as KVNamespace;
}

/**
 * Stands in for the PROGRESS_ROOMS namespace: records what the Worker asks
 * each build's room (live.ts) - the messages sent, and the closes - by the
 * room's name, the build's shortId. Records synchronously, as the call is
 * made, so a test needn't wait on the Worker's waitUntil.
 */
export interface FakeRooms {
  namespace: DurableObjectNamespace;
  /** Each message sent to a room, parsed. */
  sent: Map<string, unknown[]>;
  closed: string[];
  /** The requests forwarded to a room's /connect. */
  connects: { shortId: string; request: Request }[];
}

export function createFakeRooms(): FakeRooms {
  const rooms: FakeRooms = { namespace: null as unknown as DurableObjectNamespace, sent: new Map(), closed: [], connects: [] };
  rooms.namespace = {
    idFromName: (name: string) => ({ name }),
    get: (id: { name: string }) => ({
      fetch: (input: RequestInfo, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(input, init);
        const url = new URL(request.url);
        if (url.pathname === '/send') {
          const body = init?.body as string;
          rooms.sent.set(id.name, [...(rooms.sent.get(id.name) ?? []), JSON.parse(body)]);
        } else if (url.pathname === '/close') {
          rooms.closed.push(id.name);
        } else if (url.pathname === '/connect') {
          rooms.connects.push({ shortId: url.searchParams.get('shortId') ?? '', request });
        }
        return Promise.resolve(new Response(null, { status: 204 }));
      }
    })
  } as unknown as DurableObjectNamespace;
  return rooms;
}

/** A Waiter for handlers called directly; the fake rooms record without it. */
export const noWait = { waitUntil: (): void => undefined };

/**
 * A Waiter that keeps what it's given, for work done after reading D1 (a
 * group's room is sent the group as re-read): settle() waits for it all.
 */
export function collectingWaiter(): { waitUntil(promise: Promise<unknown>): void; settle(): Promise<void> } {
  const pending: Promise<unknown>[] = [];
  return {
    waitUntil: promise => { pending.push(promise); },
    settle: async () => {
      while (pending.length) {
        await Promise.all(pending.splice(0));
      }
    }
  };
}

/**
 * An Env over fresh fakes, for the route-handler tests: the D1 and the
 * rooms to inspect, and both allowed origins (production first).
 */
export function makeEnv(): { env: Env; db: FakeD1; rooms: FakeRooms; groupRooms: FakeRooms } {
  const db = new FakeD1();
  const rooms = createFakeRooms();
  const groupRooms = createFakeRooms();
  return {
    env: {
      DB: db as unknown as D1Database,
      BUILD_CACHE: createFakeKv(),
      PROGRESS_ROOMS: rooms.namespace,
      GROUP_ROOMS: groupRooms.namespace,
      AUTH0_DOMAIN: 'test-tenant.us.auth0.com',
      AUTH0_AUDIENCE: 'https://api.ddo-gear-planner.com',
      ALLOWED_ORIGINS: 'https://ddo-gear-planner.com,http://localhost:4200'
    },
    db,
    rooms,
    groupRooms
  };
}

/**
 * A build's progress row, owned by user-1: a private tick and pick, and
 * what friends see - one thing still needed, routed and arranged.
 */
export function seedProgress(db: FakeD1, buildId: string, overrides: Partial<FakeBuildProgressRow> = {}): void {
  db.buildProgress.push({
    build_id: buildId,
    owner_user_id: 'user-1',
    entries: '{"g|Ring 1|Secret Ring":1}',
    picks: '{"Secret Ring":["The Secret Quest"]}',
    needed: '["g|Neck|Needed Necklace"]',
    route: '{"Needed Necklace":["The Shared Quest"]}',
    route_order: '{"packs":["Pack B",""],"quests":["The Shared Quest"]}',
    updated_at: '2026-11-02T12:00:00.000Z',
    write_day: '2026-11-02',
    writes_today: 3,
    ...overrides
  });
}
