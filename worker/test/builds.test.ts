import { describe, expect, it } from 'vitest';
import { AuthenticatedUser, Env } from '../src/auth';
import {
  handleCreateBuild,
  handleDeleteBuild,
  handleGetByShortId,
  handleListMine,
  handleUpdateBuild,
  MAX_BUILDS_PER_USER
} from '../src/routes/builds';
import { createFakeKv, FakeD1 } from './fakes';

function makeEnv(): { env: Env; db: FakeD1 } {
  const db = new FakeD1();
  return { env: { DB: db as unknown as Env['DB'], BUILD_CACHE: createFakeKv() } as Env, db };
}

const user: AuthenticatedUser = { sub: 'auth0|abc123', email: 'player@example.test', name: 'Player' };
const otherUser: AuthenticatedUser = { sub: 'auth0|xyz789', email: 'other@example.test', name: 'Other' };

function seedUser(db: FakeD1, id: string, authUser: AuthenticatedUser): void {
  db.users.push({ id, auth0_sub: authUser.sub, email: null, display_name: null, created_at: 'now', last_login_at: 'now' });
}

function seedBuild(db: FakeD1, overrides: Partial<FakeD1['builds'][number]> & { id: string; short_id: string; owner_user_id: string }): void {
  db.builds.push({
    name: 'Build',
    blob: 'z1.abc',
    visibility: 'public',
    created_at: 'now',
    updated_at: 'now',
    ...overrides
  });
}

function request(body: unknown, method = 'POST'): Request {
  return new Request('https://example.test/api/builds', { method, body: JSON.stringify(body) });
}

describe('handleCreateBuild build-count limit', () => {
  it('allows creating a build when under the limit', async () => {
    const { env } = makeEnv();

    const response = await handleCreateBuild(request({ name: 'My Fighter', blob: 'z1.abc' }), user, env);

    expect(response.status).toBe(201);
  });

  it(`rejects creating a build once the owner already has ${MAX_BUILDS_PER_USER}`, async () => {
    const { env, db } = makeEnv();
    seedUser(db, 'user-1', user);
    for (let i = 0; i < MAX_BUILDS_PER_USER; i++) {
      seedBuild(db, { id: `build-${i}`, short_id: `short${i}`, owner_user_id: 'user-1', name: `Build ${i}` });
    }

    const response = await handleCreateBuild(request({ name: 'One Too Many', blob: 'z1.abc' }), user, env);

    expect(response.status).toBe(403);
    const body = await response.json() as { error: string };
    expect(body.error).toContain(String(MAX_BUILDS_PER_USER));
    expect(db.builds).toHaveLength(MAX_BUILDS_PER_USER);
  });

  it('allows creating the limit-th build (boundary: count is one below the limit)', async () => {
    const { env, db } = makeEnv();
    seedUser(db, 'user-1', user);
    for (let i = 0; i < MAX_BUILDS_PER_USER - 1; i++) {
      seedBuild(db, { id: `build-${i}`, short_id: `short${i}`, owner_user_id: 'user-1', name: `Build ${i}` });
    }

    const response = await handleCreateBuild(request({ name: 'The Last One', blob: 'z1.abc' }), user, env);

    expect(response.status).toBe(201);
    expect(db.builds).toHaveLength(MAX_BUILDS_PER_USER);
  });

  it('only counts builds owned by this user, not other owners', async () => {
    const { env, db } = makeEnv();
    seedUser(db, 'user-1', user);
    for (let i = 0; i < MAX_BUILDS_PER_USER; i++) {
      seedBuild(db, { id: `other-build-${i}`, short_id: `othershort${i}`, owner_user_id: 'someone-else', name: `Build ${i}` });
    }

    const response = await handleCreateBuild(request({ name: 'My First Build', blob: 'z1.abc' }), user, env);

    expect(response.status).toBe(201);
  });
});

describe('handleCreateBuild duplicate names', () => {
  it('rejects a second build with the same name (case-insensitive) for the same owner', async () => {
    const { env, db } = makeEnv();
    seedUser(db, 'user-1', user);
    seedBuild(db, { id: 'build-1', short_id: 'short01', owner_user_id: 'user-1', name: 'My Fighter' });

    const response = await handleCreateBuild(request({ name: 'my fighter', blob: 'z1.def' }), user, env);

    expect(response.status).toBe(409);
    expect(db.builds).toHaveLength(1);
  });

  it('allows the same name for a different owner', async () => {
    const { env, db } = makeEnv();
    seedUser(db, 'user-1', user);
    seedBuild(db, { id: 'build-1', short_id: 'short01', owner_user_id: 'someone-else', name: 'My Fighter' });

    const response = await handleCreateBuild(request({ name: 'My Fighter', blob: 'z1.def' }), user, env);

    expect(response.status).toBe(201);
  });
});

describe('handleUpdateBuild / handleDeleteBuild ownership', () => {
  it('403s an update from a non-owner, and leaves the build unchanged', async () => {
    const { env, db } = makeEnv();
    seedUser(db, 'user-1', user);
    seedUser(db, 'user-2', otherUser);
    seedBuild(db, { id: 'build-1', short_id: 'short01', owner_user_id: 'user-1', name: 'My Fighter' });

    const response = await handleUpdateBuild(request({ name: 'Hijacked' }, 'PUT'), 'build-1', otherUser, env);

    expect(response.status).toBe(403);
    expect(db.builds[0].name).toBe('My Fighter');
  });

  it('403s a delete from a non-owner, and leaves the build in place', async () => {
    const { env, db } = makeEnv();
    seedUser(db, 'user-1', user);
    seedUser(db, 'user-2', otherUser);
    seedBuild(db, { id: 'build-1', short_id: 'short01', owner_user_id: 'user-1', name: 'My Fighter' });

    const response = await handleDeleteBuild('build-1', otherUser, env);

    expect(response.status).toBe(403);
    expect(db.builds).toHaveLength(1);
  });

  it('403s an update or delete from an authenticated caller with no user row at all', async () => {
    // Reachable only by calling the API directly (the real client always
    // creates the row via GET /api/users/me on login first) - must read as
    // "not the owner," not crash or silently no-op.
    const { env, db } = makeEnv();
    seedUser(db, 'user-1', user);
    seedBuild(db, { id: 'build-1', short_id: 'short01', owner_user_id: 'user-1', name: 'My Fighter' });
    const strangerWithNoRow: AuthenticatedUser = { sub: 'auth0|no-row' };

    const updateResponse = await handleUpdateBuild(request({ name: 'Hijacked' }, 'PUT'), 'build-1', strangerWithNoRow, env);
    const deleteResponse = await handleDeleteBuild('build-1', strangerWithNoRow, env);

    expect(updateResponse.status).toBe(403);
    expect(deleteResponse.status).toBe(403);
    expect(db.builds).toHaveLength(1);
  });

  it('allows the owner to update their own build', async () => {
    const { env, db } = makeEnv();
    seedUser(db, 'user-1', user);
    seedBuild(db, { id: 'build-1', short_id: 'short01', owner_user_id: 'user-1', name: 'My Fighter' });

    const response = await handleUpdateBuild(request({ name: 'Renamed Fighter' }, 'PUT'), 'build-1', user, env);

    expect(response.status).toBe(200);
    expect(db.builds[0].name).toBe('Renamed Fighter');
  });

  it('rejects a rename that collides with another of the owner\'s own builds', async () => {
    const { env, db } = makeEnv();
    seedUser(db, 'user-1', user);
    seedBuild(db, { id: 'build-1', short_id: 'short01', owner_user_id: 'user-1', name: 'My Fighter' });
    seedBuild(db, { id: 'build-2', short_id: 'short02', owner_user_id: 'user-1', name: 'My Wizard' });

    const response = await handleUpdateBuild(request({ name: 'my fighter' }, 'PUT'), 'build-2', user, env);

    expect(response.status).toBe(409);
    expect(db.builds[1].name).toBe('My Wizard');
  });

  it('allows the owner to delete their own build', async () => {
    const { env, db } = makeEnv();
    seedUser(db, 'user-1', user);
    seedBuild(db, { id: 'build-1', short_id: 'short01', owner_user_id: 'user-1', name: 'My Fighter' });

    const response = await handleDeleteBuild('build-1', user, env);

    expect(response.status).toBe(204);
    expect(db.builds).toHaveLength(0);
  });

  it('404s an update or delete for a build id that does not exist', async () => {
    const { env } = makeEnv();

    const updateResponse = await handleUpdateBuild(request({ name: 'X' }, 'PUT'), 'nope', user, env);
    const deleteResponse = await handleDeleteBuild('nope', user, env);

    expect(updateResponse.status).toBe(404);
    expect(deleteResponse.status).toBe(404);
  });
});

describe('handleListMine', () => {
  it('lists only the caller\'s own builds, most recently updated first, without the blob field', async () => {
    const { env, db } = makeEnv();
    seedUser(db, 'user-1', user);
    seedBuild(db, { id: 'build-1', short_id: 'short01', owner_user_id: 'user-1', name: 'Older', updated_at: '2026-01-01' });
    seedBuild(db, { id: 'build-2', short_id: 'short02', owner_user_id: 'user-1', name: 'Newer', updated_at: '2026-02-01' });
    seedBuild(db, { id: 'build-3', short_id: 'short03', owner_user_id: 'someone-else', name: 'Not mine', updated_at: '2026-03-01' });

    const response = await handleListMine(user, env);

    expect(response.status).toBe(200);
    const body = await response.json() as Array<{ id: string; blob?: string }>;
    expect(body.map(b => b.id)).toEqual(['build-2', 'build-1']);
    expect(body.every(b => !('blob' in b))).toBe(true);
  });

  it('returns an empty list for a caller with no user row yet, rather than erroring', async () => {
    const { env } = makeEnv();
    const strangerWithNoRow: AuthenticatedUser = { sub: 'auth0|no-row' };

    const response = await handleListMine(strangerWithNoRow, env);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });
});

describe('handleGetByShortId', () => {
  it('serves a public build by its shortId', async () => {
    const { env, db } = makeEnv();
    seedUser(db, 'user-1', user);
    seedBuild(db, { id: 'build-1', short_id: 'short01', owner_user_id: 'user-1', name: 'My Fighter', blob: 'z1.abc' });
    db.shortIds.push({ short_id: 'short01', kind: 'build', created_at: 'now' });

    const response = await handleGetByShortId('short01', env);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ name: 'My Fighter', blob: 'z1.abc' });
  });

  it('404s a private build\'s shortId - indistinguishable from one that does not exist', async () => {
    const { env, db } = makeEnv();
    seedUser(db, 'user-1', user);
    seedBuild(db, { id: 'build-1', short_id: 'short01', owner_user_id: 'user-1', name: 'My Fighter', visibility: 'private' });
    db.shortIds.push({ short_id: 'short01', kind: 'build', created_at: 'now' });

    const response = await handleGetByShortId('short01', env);

    expect(response.status).toBe(404);
  });

  it('404s a shortId the allocator has never heard of', async () => {
    const { env } = makeEnv();

    const response = await handleGetByShortId('doesnotexist', env);

    expect(response.status).toBe(404);
  });

  it('populates the KV cache on a hit, and serves subsequent requests from it', async () => {
    const { env, db } = makeEnv();
    seedUser(db, 'user-1', user);
    seedBuild(db, { id: 'build-1', short_id: 'short01', owner_user_id: 'user-1', name: 'My Fighter', blob: 'z1.abc' });
    db.shortIds.push({ short_id: 'short01', kind: 'build', created_at: 'now' });

    await handleGetByShortId('short01', env);
    db.builds = []; // prove the second call doesn't hit the DB at all
    const response = await handleGetByShortId('short01', env);

    expect(await response.json()).toEqual({ name: 'My Fighter', blob: 'z1.abc' });
  });

  it('invalidates the KV cache when the build is updated', async () => {
    const { env, db } = makeEnv();
    seedUser(db, 'user-1', user);
    seedBuild(db, { id: 'build-1', short_id: 'short01', owner_user_id: 'user-1', name: 'My Fighter', blob: 'z1.abc' });
    db.shortIds.push({ short_id: 'short01', kind: 'build', created_at: 'now' });
    await handleGetByShortId('short01', env); // populate the cache

    await handleUpdateBuild(request({ blob: 'z1.updated' }, 'PUT'), 'build-1', user, env);
    const response = await handleGetByShortId('short01', env);

    expect(await response.json()).toEqual({ name: 'My Fighter', blob: 'z1.updated' });
  });
});
