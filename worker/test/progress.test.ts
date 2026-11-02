import { describe, expect, it } from 'vitest';
import { Env } from '../src/auth';
import worker from '../src/index';
import { handleGetPublicProgress } from '../src/routes/progress';
import { createFakeKv, FakeBuildProgressRow, FakeD1 } from './fakes';

function makeEnv(): { env: Env; db: FakeD1 } {
  const db = new FakeD1();
  return {
    env: {
      DB: db as unknown as Env['DB'],
      BUILD_CACHE: createFakeKv(),
      ALLOWED_ORIGINS: 'https://ddo-gear-planner.com'
    } as Env,
    db
  };
}

function seedBuild(db: FakeD1, id: string, shortId: string, visibility = 'public'): void {
  db.builds.push({
    id, short_id: shortId, owner_user_id: 'user-1', name: id, blob: 'z1.abc', visibility, created_at: 'now', updated_at: 'now'
  });
}

function seedProgress(db: FakeD1, buildId: string, overrides: Partial<FakeBuildProgressRow> = {}): void {
  db.buildProgress.push({
    build_id: buildId,
    owner_user_id: 'user-1',
    entries: '{"g|Ring 1|Secret Ring":1}',
    picks: '{"Secret Ring":["The Secret Quest"]}',
    needed: '["g|Neck|Needed Necklace"]',
    route: '{"Needed Necklace":["The Shared Quest"]}',
    updated_at: '2026-11-02T12:00:00.000Z',
    write_day: '2026-11-02',
    writes_today: 3,
    ...overrides
  });
}

describe('handleGetPublicProgress', () => {
  it('returns only what is still needed and the owner\'s route - never their ticks or picks', async () => {
    const { env, db } = makeEnv();
    seedBuild(db, 'build-1', 'short01');
    seedProgress(db, 'build-1');

    const response = await handleGetPublicProgress('short01', env);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      needed: ['g|Neck|Needed Necklace'],
      route: { 'Needed Necklace': ['The Shared Quest'] },
      updatedAt: '2026-11-02T12:00:00.000Z'
    });
  });

  it('lets a friend\'s browser cache the answer for a few seconds', async () => {
    const { env, db } = makeEnv();
    seedBuild(db, 'build-1', 'short01');
    seedProgress(db, 'build-1');

    const response = await handleGetPublicProgress('short01', env);

    expect(response.headers.get('Cache-Control')).toBe('public, max-age=15');
  });

  it('returns needed: null for a public build whose owner has never synced a list', async () => {
    const { env, db } = makeEnv();
    seedBuild(db, 'build-1', 'short01');

    const response = await handleGetPublicProgress('short01', env);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ needed: null, route: {}, updatedAt: null });
  });

  it('404s a private build, even with progress - indistinguishable from one that does not exist', async () => {
    const { env, db } = makeEnv();
    seedBuild(db, 'build-1', 'short01', 'private');
    seedProgress(db, 'build-1');

    const response = await handleGetPublicProgress('short01', env);

    expect(response.status).toBe(404);
  });

  it('404s a short link and an unknown shortId', async () => {
    const { env, db } = makeEnv();
    db.shortlinks.push({ short_id: 'link0001', blob: '{"name":"x","blob":"z1.abc"}', creator_user_id: null, created_at: 'now' });

    expect((await handleGetPublicProgress('link0001', env)).status).toBe(404);
    expect((await handleGetPublicProgress('nothing1', env)).status).toBe(404);
  });

  it('is routed without auth, and writes nothing to KV', async () => {
    const { env, db } = makeEnv();
    seedBuild(db, 'build-1', 'short01');
    seedProgress(db, 'build-1');
    let kvWrites = 0;
    const kvPut = env.BUILD_CACHE.put.bind(env.BUILD_CACHE);
    env.BUILD_CACHE.put = (async (...args: Parameters<KVNamespace['put']>) => {
      kvWrites++;
      return kvPut(...args);
    }) as KVNamespace['put'];

    const response = await worker.fetch(new Request('https://example.test/api/build/short01/progress'), env);

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=15');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://ddo-gear-planner.com');
    expect(kvWrites).toBe(0);
  });
});
