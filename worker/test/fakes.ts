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

export interface FakeUserRow {
  id: string;
  auth0_sub: string;
  email: string | null;
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
      shortIds: [...this.shortIds]
    };
  }

  private _restore(snapshot: FakeD1Snapshot): void {
    this.users = snapshot.users;
    this.builds = snapshot.builds;
    this.shortlinks = snapshot.shortlinks;
    this.shortIds = snapshot.shortIds;
  }

  _first(sql: string, args: unknown[]): unknown {
    if (sql.includes('SELECT id FROM users WHERE auth0_sub')) {
      const user = this.users.find(u => u.auth0_sub === args[0]);
      return user ? { id: user.id } : null;
    }
    if (sql.includes('FROM users WHERE auth0_sub')) {
      return this.users.find(u => u.auth0_sub === args[0]) ?? null;
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
      const [id, auth0Sub, email, displayName, createdAt, lastLoginAt] = args as [string, string, string | null, string | null, string, string];
      if (unique(this.users, u => u.auth0_sub === auth0Sub)) {
        throw new Error('D1_ERROR: UNIQUE constraint failed: users.auth0_sub');
      }
      this.users.push({ id, auth0_sub: auth0Sub, email, display_name: displayName, created_at: createdAt, last_login_at: lastLoginAt });
      return { meta: { changes: 1 } };
    }

    if (sql.startsWith('UPDATE users')) {
      const [lastLoginAt, email, displayName, id] = args as [string, string | null, string | null, string];
      const user = this.users.find(u => u.id === id);
      if (user) {
        user.last_login_at = lastLoginAt;
        user.email = email;
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

    if (sql.startsWith('DELETE FROM builds')) {
      const id = args[0] as string;
      const before = this.builds.length;
      this.builds = this.builds.filter(b => b.id !== id);
      return { meta: { changes: before - this.builds.length } };
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
