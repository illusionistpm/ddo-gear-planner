import { describe, expect, it } from 'vitest';
import { AuthenticatedUser, Env } from '../src/auth';
import { handleCreateBuild, MAX_BUILDS_PER_USER } from '../src/routes/builds';

// Minimal in-memory stand-in for D1Database, covering just the users/builds
// queries handleCreateBuild's path touches (resolveOwnerUserId's upsert,
// countBuildsByOwner, and the shortId-minting insert).
class FakeD1 {
  users: { id: string; auth0_sub: string; email: string | null; display_name: string | null; created_at: string; last_login_at: string }[] = [];
  builds: { id: string; short_id: string; owner_user_id: string; name: string; blob: string; created_at: string; updated_at: string }[] = [];

  prepare(sql: string) {
    return {
      bind: (...args: unknown[]) => ({
        first: async () => {
          if (sql.includes('FROM users WHERE auth0_sub')) {
            return this.users.find(u => u.auth0_sub === args[0]) ?? null;
          }
          if (sql.includes('SELECT COUNT(*)')) {
            return { count: this.builds.filter(b => b.owner_user_id === args[0]).length };
          }
          if (sql.includes('FROM builds WHERE short_id')) {
            return this.builds.find(b => b.short_id === args[0]) ?? null;
          }
          return null;
        },
        run: async () => {
          if (sql.startsWith('INSERT INTO users')) {
            const [id, auth0Sub, email, displayName, createdAt, lastLoginAt] = args as [string, string, string | null, string | null, string, string];
            this.users.push({ id, auth0_sub: auth0Sub, email, display_name: displayName, created_at: createdAt, last_login_at: lastLoginAt });
          } else if (sql.startsWith('UPDATE users')) {
            const [lastLoginAt, email, displayName, id] = args as [string, string | null, string | null, string];
            const user = this.users.find(u => u.id === id);
            if (user) {
              user.last_login_at = lastLoginAt;
              user.email = email;
              user.display_name = displayName;
            }
          } else if (sql.startsWith('INSERT INTO builds')) {
            const [id, shortId, ownerUserId, name, blob, createdAt, updatedAt] = args as [string, string, string, string, string, string, string];
            if (this.builds.some(b => b.short_id === shortId)) {
              throw new Error('D1_ERROR: UNIQUE constraint failed: builds.short_id');
            }
            this.builds.push({ id, short_id: shortId, owner_user_id: ownerUserId, name, blob, created_at: createdAt, updated_at: updatedAt });
          }
          return {};
        }
      })
    };
  }
}

function makeEnv(): { env: Env; db: FakeD1 } {
  const db = new FakeD1();
  return { env: { DB: db as unknown as Env['DB'] } as Env, db };
}

const user: AuthenticatedUser = { sub: 'auth0|abc123', email: 'player@example.test', name: 'Player' };

function request(body: unknown): Request {
  return new Request('https://example.test/api/builds', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

describe('handleCreateBuild build-count limit', () => {
  it('allows creating a build when under the limit', async () => {
    const { env } = makeEnv();

    const response = await handleCreateBuild(request({ name: 'My Fighter', blob: 'z1.abc' }), user, env);

    expect(response.status).toBe(201);
  });

  it(`rejects creating a build once the owner already has ${MAX_BUILDS_PER_USER}`, async () => {
    const { env, db } = makeEnv();
    db.users.push({ id: 'user-1', auth0_sub: user.sub, email: null, display_name: null, created_at: 'now', last_login_at: 'now' });
    for (let i = 0; i < MAX_BUILDS_PER_USER; i++) {
      db.builds.push({
        id: `build-${i}`, short_id: `short${i}`, owner_user_id: 'user-1',
        name: `Build ${i}`, blob: 'z1.abc', created_at: 'now', updated_at: 'now'
      });
    }

    const response = await handleCreateBuild(request({ name: 'One Too Many', blob: 'z1.abc' }), user, env);

    expect(response.status).toBe(403);
    const body = await response.json() as { error: string };
    expect(body.error).toContain(String(MAX_BUILDS_PER_USER));
    expect(db.builds).toHaveLength(MAX_BUILDS_PER_USER);
  });

  it('allows creating the limit-th build (boundary: count is one below the limit)', async () => {
    const { env, db } = makeEnv();
    db.users.push({ id: 'user-1', auth0_sub: user.sub, email: null, display_name: null, created_at: 'now', last_login_at: 'now' });
    for (let i = 0; i < MAX_BUILDS_PER_USER - 1; i++) {
      db.builds.push({
        id: `build-${i}`, short_id: `short${i}`, owner_user_id: 'user-1',
        name: `Build ${i}`, blob: 'z1.abc', created_at: 'now', updated_at: 'now'
      });
    }

    const response = await handleCreateBuild(request({ name: 'The Last One', blob: 'z1.abc' }), user, env);

    expect(response.status).toBe(201);
    expect(db.builds).toHaveLength(MAX_BUILDS_PER_USER);
  });

  it('only counts builds owned by this user, not other owners', async () => {
    const { env, db } = makeEnv();
    db.users.push({ id: 'user-1', auth0_sub: user.sub, email: null, display_name: null, created_at: 'now', last_login_at: 'now' });
    for (let i = 0; i < MAX_BUILDS_PER_USER; i++) {
      db.builds.push({
        id: `other-build-${i}`, short_id: `othershort${i}`, owner_user_id: 'someone-else',
        name: `Build ${i}`, blob: 'z1.abc', created_at: 'now', updated_at: 'now'
      });
    }

    const response = await handleCreateBuild(request({ name: 'My First Build', blob: 'z1.abc' }), user, env);

    expect(response.status).toBe(201);
  });
});
