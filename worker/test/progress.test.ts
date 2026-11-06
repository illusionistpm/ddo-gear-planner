import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthenticatedUser, Env } from '../src/auth';
import { upsertBuildProgressIfUnchanged } from '../src/db';
import worker from '../src/index';
import { handleGetOwnProgress, handlePutProgress } from '../src/routes/progress';
import sharedConstants from '../../shared/constants.json';
import { FakeD1, makeEnv, noWait, seedProgress } from './fakes';

function seedBuild(db: FakeD1, id: string, shortId: string, visibility = 'public'): void {
  db.builds.push({
    id, short_id: shortId, owner_user_id: 'user-1', name: id, blob: 'z1.abc', visibility, created_at: 'now', updated_at: 'now'
  });
}

const owner: AuthenticatedUser = { sub: 'auth0|owner', email: 'owner@example.test', name: 'Owner' };
const stranger: AuthenticatedUser = { sub: 'auth0|stranger', email: 'stranger@example.test', name: 'Stranger' };

function seedUsers(db: FakeD1): void {
  for (const [id, authUser] of [['user-1', owner], ['user-2', stranger]] as const) {
    db.users.push({ id, auth0_sub: authUser.sub, email: null, email_verified: 0, display_name: null, created_at: 'now', last_login_at: 'now' });
  }
}

function put(body: unknown): Request {
  return new Request('https://example.test/api/builds/build-1/progress', {
    method: 'PUT',
    body: typeof body === 'string' ? body : JSON.stringify(body)
  });
}

async function putJson(env: Env, body: unknown, buildId = 'build-1', user = owner): Promise<{ status: number; body: any }> {
  const response = await handlePutProgress(put(body), buildId, user, env, noWait);
  return { status: response.status, body: await response.json() };
}

function countKvWrites(env: Env): () => number {
  let kvWrites = 0;
  const kvPut = env.BUILD_CACHE.put.bind(env.BUILD_CACHE);
  env.BUILD_CACHE.put = (async (...args: Parameters<KVNamespace['put']>) => {
    kvWrites++;
    return kvPut(...args);
  }) as KVNamespace['put'];
  return () => kvWrites;
}

describe('owner progress', () => {
  let env: Env;
  let db: FakeD1;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-02T12:00:00.000Z'));
    ({ env, db } = makeEnv());
    seedUsers(db);
    seedBuild(db, 'build-1', 'short01');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function advance(ms: number): void {
    vi.setSystemTime(new Date(Date.now() + ms));
  }

  describe('GET', () => {
    it('returns an empty doc when nothing is stored yet', async () => {
      const response = await handleGetOwnProgress('build-1', owner, env);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ entries: {}, picks: {}, needed: null, route: {}, order: null, updatedAt: null });
    });

    it('returns the whole doc, private parts included, to the owner', async () => {
      seedProgress(db, 'build-1');

      const response = await handleGetOwnProgress('build-1', owner, env);

      expect(await response.json()).toEqual({
        entries: { 'g|Ring 1|Secret Ring': 1 },
        picks: { 'Secret Ring': ['The Secret Quest'] },
        needed: ['g|Neck|Needed Necklace'],
        route: { 'Needed Necklace': ['The Shared Quest'] },
        order: { packs: ['Pack B', ''], quests: ['The Shared Quest'] },
        updatedAt: '2026-11-02T12:00:00.000Z'
      });
    });

    it('403s anyone else, and 404s a build that does not exist', async () => {
      seedProgress(db, 'build-1');

      expect((await handleGetOwnProgress('build-1', stranger, env)).status).toBe(403);
      expect((await handleGetOwnProgress('nope', owner, env)).status).toBe(404);
    });
  });

  describe('PUT', () => {
    it('creates the doc on the first write, without publishing anything to friends', async () => {
      const response = await putJson(env, { patch: { 'g|Neck|Necklace': 1 }, picksPatch: { Necklace: ['Quest A'] } });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        entries: { 'g|Neck|Necklace': 1 },
        picks: { Necklace: ['Quest A'] },
        needed: null,
        route: {},
        order: null,
        updatedAt: '2026-11-02T12:00:00.000Z'
      });
      expect(db.buildProgress).toEqual([expect.objectContaining({
        build_id: 'build-1', owner_user_id: 'user-1', needed: null, route: null, route_order: null, write_day: '2026-11-02',
        writes_today: 1
      })]);
    });

    it('merges patches into what is stored: a value sets, null forgets, anything unmentioned stays', async () => {
      await putJson(env, { patch: { a: 1, b: 0, c: 1 }, picksPatch: { X: ['Q1'], Y: ['Q2'] } });
      advance(2000);

      const response = await putJson(env, { patch: { a: 0, b: null }, picksPatch: { X: null, Z: ['Q3', 'Q4'] } });

      expect(response.status).toBe(200);
      expect(response.body.entries).toEqual({ a: 0, c: 1 });
      expect(response.body.picks).toEqual({ Y: ['Q2'], Z: ['Q3', 'Q4'] });
    });

    it('replaces needed and route when given, and leaves them alone when not', async () => {
      await putJson(env, { needed: ['k1', 'k2'], route: { Thing: ['Quest A'] } });
      advance(2000);
      await putJson(env, { patch: { k1: 1 } });

      expect(db.buildProgress[0].needed).toBe('["k1","k2"]');
      expect(db.buildProgress[0].route).toBe('{"Thing":["Quest A"]}');

      advance(2000);
      const response = await putJson(env, { needed: [], route: {} });

      expect(response.body.needed).toEqual([]);
      expect(response.body.route).toEqual({});
    });

    it('arranges the route when given an order, clears it on null, and leaves it alone when not given one', async () => {
      const order = { packs: ['Pack B', '', 'Pack A'], quests: ['Quest B', 'Quest A'] };
      expect((await putJson(env, { order })).body.order).toEqual(order);
      advance(2000);

      const kept = await putJson(env, { patch: { k1: 1 }, needed: ['k2'], route: {} });
      expect(kept.body.order).toEqual(order);
      expect(db.buildProgress[0].route_order).toBe(JSON.stringify(order));

      advance(2000);
      expect((await putJson(env, { order: null })).body.order).toBeNull();
      expect(db.buildProgress[0].route_order).toBeNull();
    });

    it('400s an order that isn\'t packs and quests, each a list of names', async () => {
      for (const order of [
        [], 'Pack A', { packs: ['Pack A'] }, { quests: [] }, { packs: [], quests: [], extra: [] },
        { packs: [1], quests: [] }, { packs: [], quests: [''] }, { packs: ['x'.repeat(301)], quests: [] },
        { packs: Array(201).fill('Pack'), quests: [] }, { packs: [], quests: Array(301).fill('Quest') },
      ]) {
        expect((await putJson(env, { order })).status, JSON.stringify(order).slice(0, 40)).toBe(400);
      }
      expect(db.buildProgress).toEqual([]);
    });

    it('keeps a "__proto__" key as an ordinary key', async () => {
      const response = await putJson(env, '{"patch":{"__proto__":1}}');

      expect(response.status).toBe(200);
      expect(db.buildProgress[0].entries).toBe('{"__proto__":1}');
      expect(Object.keys(response.body.entries)).toEqual(['__proto__']);
    });

    it.each([
      ['not JSON', '{'],
      ['an array', '[]'],
      ['a tick value other than 0, 1 or null', { patch: { a: 2 } }],
      ['an empty key', { patch: { '': 1 } }],
      ['a key over the length cap', { patch: { ['k'.repeat(sharedConstants.maxProgressKeyLength + 1)]: 1 } }],
      ['an empty pick', { picksPatch: { X: [] } }],
      ['a pick that is not a list of names', { picksPatch: { X: 'Quest A' } }],
      ['needed without route', { needed: ['k'] }],
      ['route without needed', { route: {} }],
      ['needed that is not a list of keys', { needed: [1], route: {} }]
    ])('400s %s, and stores nothing', async (_, body) => {
      const response = await putJson(env, body);

      expect(response.status).toBe(400);
      expect(db.buildProgress).toEqual([]);
    });

    it('413s a body over the size cap', async () => {
      const response = await putJson(env, { patch: {}, padding: 'x'.repeat(sharedConstants.maxProgressBytes) });

      expect(response.status).toBe(413);
    });

    it('413s a write that would leave more ticks than the cap, and keeps what was stored', async () => {
      const half = Math.ceil(sharedConstants.maxProgressEntries / 2) + 1;
      const patch = (prefix: string) => Object.fromEntries(Array.from({ length: half }, (_, i) => [`${prefix}${i}`, 1]));
      await putJson(env, { patch: patch('a') });
      advance(2000);

      const response = await putJson(env, { patch: patch('b') });

      expect(response.status).toBe(413);
      expect(Object.keys(JSON.parse(db.buildProgress[0].entries))).toHaveLength(half);
    });

    it('429s a second write within the interval, saying how long to wait, and changes nothing', async () => {
      await putJson(env, { patch: { a: 1 } });
      advance(500);

      const response = await handlePutProgress(put({ patch: { b: 1 } }), 'build-1', owner, env, noWait);

      expect(response.status).toBe(429);
      expect(await response.json()).toEqual(expect.objectContaining({ retryAfterMs: sharedConstants.progressMinWriteIntervalMs - 500 }));
      expect(response.headers.get('Retry-After')).toBe('1');
      expect(db.buildProgress[0].entries).toBe('{"a":1}');

      advance(sharedConstants.progressMinWriteIntervalMs - 500);
      expect((await putJson(env, { patch: { b: 1 } })).status).toBe(200);
    });

    it('caps writes per user per UTC day across all their builds, and starts again the next day', async () => {
      seedBuild(db, 'build-2', 'short02');
      seedProgress(db, 'build-2', {
        writes_today: sharedConstants.maxProgressWritesPerUserPerDay - 1,
        updated_at: '2026-11-02T00:00:00.000Z'
      });
      await putJson(env, { patch: { a: 1 } });
      advance(2000);

      const capped = await putJson(env, { patch: { b: 1 } });

      expect(capped.status).toBe(429);
      expect(capped.body).toEqual(expect.objectContaining({ dailyCapReached: true }));

      vi.setSystemTime(new Date('2026-11-03T00:00:01.000Z'));
      const nextDay = await putJson(env, { patch: { b: 1 } });

      expect(nextDay.status).toBe(200);
      expect(db.buildProgress.find(p => p.build_id === 'build-1'))
        .toEqual(expect.objectContaining({ write_day: '2026-11-03', writes_today: 1 }));
    });

    it('does not count another user\'s writes against the cap', async () => {
      db.builds.push({
        id: 'build-9', short_id: 'short09', owner_user_id: 'user-2', name: 'Theirs', blob: 'z1.abc', visibility: 'public',
        created_at: 'now', updated_at: 'now'
      });
      seedProgress(db, 'build-9', { owner_user_id: 'user-2', writes_today: sharedConstants.maxProgressWritesPerUserPerDay });

      expect((await putJson(env, { patch: { a: 1 } })).status).toBe(200);
    });

    it('403s anyone else, and 404s a build that does not exist, storing nothing', async () => {
      expect((await putJson(env, { patch: { a: 1 } }, 'build-1', stranger)).status).toBe(403);
      expect((await putJson(env, { patch: { a: 1 } }, 'nope')).status).toBe(404);
      expect(db.buildProgress).toEqual([]);
    });

    it('never touches the build itself or KV', async () => {
      const kvWrites = countKvWrites(env);
      const before = { ...db.builds[0] };

      await putJson(env, { patch: { a: 1 }, needed: ['a'], route: {} });

      expect(db.builds[0]).toEqual(before);
      expect(kvWrites()).toBe(0);
    });

    it('is routed behind auth', async () => {
      const response = await worker.fetch(put({ patch: { a: 1 } }), env);

      expect(response.status).toBe(401);
    });
  });

  describe('upsertBuildProgressIfUnchanged', () => {
    const row = {
      build_id: 'build-1', owner_user_id: 'user-1', entries: '{"new":1}', picks: '{}', needed: null, route: null, route_order: null,
      updated_at: '2026-11-02T12:00:00.000Z', write_day: '2026-11-02'
    };

    it('changes nothing when another write landed after the caller read the row', async () => {
      seedProgress(db, 'build-1', { updated_at: '2026-11-02T11:59:58.000Z' });

      const written = await upsertBuildProgressIfUnchanged(env.DB, row, {
        baseUpdatedAt: '2026-11-02T11:59:00.000Z',
        notAfter: '2026-11-02T11:59:58.500Z'
      });

      expect(written).toBe(false);
      expect(db.buildProgress[0].entries).toBe('{"g|Ring 1|Secret Ring":1}');
    });

    it('changes nothing when two first writes race - the loser finds a row it never read', async () => {
      seedProgress(db, 'build-1', { updated_at: '2026-11-02T12:00:00.000Z' });

      const written = await upsertBuildProgressIfUnchanged(env.DB, row, { baseUpdatedAt: null, notAfter: '2026-11-02T11:59:58.500Z' });

      expect(written).toBe(false);
    });
  });
});
