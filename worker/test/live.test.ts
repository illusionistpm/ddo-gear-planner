import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthenticatedUser, Env } from '../src/auth';
import worker from '../src/index';
import { GONE_CLOSE_CODE, LiveMessage } from '../src/live';
import { ProgressRoom } from '../src/progress-room';
import { handleDeleteBuild, handleUpdateBuild } from '../src/routes/builds';
import { handlePutProgress } from '../src/routes/progress';
import { createFakeKv, createFakeRooms, FakeBuildProgressRow, FakeD1, FakeRooms, noWait } from './fakes';

const owner: AuthenticatedUser = { sub: 'auth0|owner', email: 'owner@example.test', name: 'Owner' };
const ORIGIN = 'https://ddo-gear-planner.com';

function makeEnv(): { env: Env; db: FakeD1; rooms: FakeRooms } {
  const db = new FakeD1();
  const rooms = createFakeRooms();
  db.users.push({ id: 'user-1', auth0_sub: owner.sub, email: null, email_verified: 0, display_name: null, created_at: 'now', last_login_at: 'now' });
  db.builds.push({
    id: 'build-1', short_id: 'short01', owner_user_id: 'user-1', name: 'My Fighter', blob: 'z1.abc', visibility: 'public',
    created_at: '2026-11-01T00:00:00.000Z', updated_at: '2026-11-01T00:00:00.000Z'
  });
  return {
    env: {
      DB: db as unknown as Env['DB'], BUILD_CACHE: createFakeKv(), PROGRESS_ROOMS: rooms.namespace, ALLOWED_ORIGINS: `${ORIGIN},http://localhost:4200`
    } as Env,
    db,
    rooms
  };
}

function seedProgress(db: FakeD1, overrides: Partial<FakeBuildProgressRow> = {}): void {
  db.buildProgress.push({
    build_id: 'build-1',
    owner_user_id: 'user-1',
    entries: '{"g|Ring 1|Secret Ring":1}',
    picks: '{"Secret Ring":["The Secret Quest"]}',
    needed: '["g|Neck|Needed Necklace"]',
    route: '{"Needed Necklace":["The Shared Quest"]}',
    route_order: null,
    updated_at: '2026-11-02T11:00:00.000Z',
    write_day: '2026-11-02',
    writes_today: 1,
    ...overrides
  });
}

function liveRequest(path: string, headers: Record<string, string>): Request {
  return new Request(`https://example.test${path}`, { headers });
}

describe('GET /api/build/:shortId/live', () => {
  it('forwards a WebSocket upgrade from an allowed origin to the build\'s room', async () => {
    const { env, rooms } = makeEnv();

    await worker.fetch(liveRequest('/api/build/short01/live', { Upgrade: 'websocket', Origin: ORIGIN }), env);

    expect(rooms.connects.map(connect => connect.shortId)).toEqual(['short01']);
    expect(rooms.connects[0].request.headers.get('Upgrade')).toBe('websocket');
  });

  it('426s a request that isn\'t an upgrade', async () => {
    const { env, rooms } = makeEnv();

    const response = await worker.fetch(liveRequest('/api/build/short01/live', { Origin: ORIGIN }), env);

    expect(response.status).toBe(426);
    expect(rooms.connects).toEqual([]);
  });

  it('403s an origin not on the list, and a request with none - CORS doesn\'t cover WebSockets', async () => {
    const { env, rooms } = makeEnv();

    const elsewhere = await worker.fetch(liveRequest('/api/build/short01/live', { Upgrade: 'websocket', Origin: 'https://evil.test' }), env);
    const none = await worker.fetch(liveRequest('/api/build/short01/live', { Upgrade: 'websocket' }), env);

    expect(elsewhere.status).toBe(403);
    expect(none.status).toBe(403);
    expect(rooms.connects).toEqual([]);
  });

  it('is gone with the polling route it replaced', async () => {
    const { env } = makeEnv();

    expect((await worker.fetch(liveRequest('/api/build/short01/progress', {}), env)).status).toBe(404);
  });
});

/** Just enough of the Workers runtime for ProgressRoom under Node. */
class FakeSocket {
  sent: string[] = [];
  closed: { code: number; reason: string } | null = null;
  send(text: string): void {
    if (this.closed) {
      throw new Error('closed');
    }
    this.sent.push(text);
  }
  close(code: number, reason: string): void {
    this.closed = { code, reason };
  }
  accept(): void {
    // Nothing to do.
  }
}

describe('ProgressRoom', () => {
  let accepted: FakeSocket[];
  let room: ProgressRoom;
  let db: FakeD1;
  let autoResponse: unknown;

  beforeEach(() => {
    accepted = [];
    let env: Env;
    ({ env, db } = makeEnv());
    vi.stubGlobal('WebSocketPair', class {
      0 = new FakeSocket();
      1 = new FakeSocket();
    });
    vi.stubGlobal('WebSocketRequestResponsePair', class {
      constructor(readonly request: string, readonly response: string) {}
    });
    // Node's Response refuses a 101 and has no webSocket.
    vi.stubGlobal('Response', class {
      readonly status: number;
      readonly webSocket: unknown;
      constructor(_body: unknown, init?: { status?: number; webSocket?: unknown }) {
        this.status = init?.status ?? 200;
        this.webSocket = init?.webSocket;
      }
    });
    const state = {
      setWebSocketAutoResponse: (pair: unknown) => { autoResponse = pair; },
      acceptWebSocket: (socket: FakeSocket) => { accepted.push(socket); },
      getWebSockets: () => accepted
    } as unknown as DurableObjectState;
    room = new ProgressRoom(state, env);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function connect(shortId: string): Promise<Response> {
    return room.fetch(new Request(`https://room/connect?shortId=${shortId}`));
  }

  function messages(socket: FakeSocket): LiveMessage[] {
    return socket.sent.map(text => JSON.parse(text) as LiveMessage);
  }

  it('answers the keepalive ping without waking', () => {
    expect(autoResponse).toEqual({ request: 'ping', response: 'pong' });
  });

  it('upgrades, and sends the build and what its owner shares - never their ticks or picks', async () => {
    seedProgress(db, { route_order: '{"packs":["Pack B"],"quests":[]}' });

    const response = await connect('short01');

    expect(response.status).toBe(101);
    expect(accepted).toHaveLength(1);
    expect(messages(accepted[0])).toEqual([{
      kind: 'list',
      name: 'My Fighter',
      blob: 'z1.abc',
      needed: ['g|Neck|Needed Necklace'],
      route: { 'Needed Necklace': ['The Shared Quest'] },
      order: { packs: ['Pack B'], quests: [] },
      version: '2026-11-02T11:00:00.000Z'
    }]);
  });

  it('sends needed: null for a build whose owner has never shared a list, versioned by the build', async () => {
    const response = await connect('short01');

    expect(response.status).toBe(101);
    expect(messages(accepted[0])).toEqual([
      { kind: 'list', name: 'My Fighter', blob: 'z1.abc', needed: null, route: {}, order: null, version: '2026-11-01T00:00:00.000Z' }
    ]);
  });

  it('says gone, and closes, for a missing build, a private one, or a short link', async () => {
    db.builds.push({ ...db.builds[0], id: 'build-2', short_id: 'private1', visibility: 'private' });
    db.shortlinks.push({ short_id: 'link0001', blob: '{"name":"x","blob":"z1.abc"}', creator_user_id: null, created_at: 'now' });

    for (const shortId of ['nothing1', 'private1', 'link0001']) {
      await connect(shortId);
    }

    expect(accepted.map(messages)).toEqual([[{ kind: 'gone' }], [{ kind: 'gone' }], [{ kind: 'gone' }]]);
    expect(accepted.map(socket => socket.closed?.code)).toEqual([GONE_CLOSE_CODE, GONE_CLOSE_CODE, GONE_CLOSE_CODE]);
  });

  it('sends a message to every socket, skipping one that has closed', async () => {
    await connect('short01');
    await connect('short01');
    accepted[0].close(1000, '');

    await room.fetch(new Request('https://room/send', { method: 'POST', body: '{"kind":"list"}' }));

    expect(accepted[0].sent).toHaveLength(1);
    expect(accepted[1].sent).toEqual([expect.any(String), '{"kind":"list"}']);
  });

  it('says gone to every socket on /close, then closes it', async () => {
    await connect('short01');
    await connect('short01');

    await room.fetch(new Request('https://room/close', { method: 'POST' }));

    expect(accepted.map(socket => messages(socket).at(-1))).toEqual([{ kind: 'gone' }, { kind: 'gone' }]);
    expect(accepted.map(socket => socket.closed?.code)).toEqual([GONE_CLOSE_CODE, GONE_CLOSE_CODE]);
  });

  it('completes a closing handshake, answering a code that can\'t be sent back with 1000', () => {
    const socket = new FakeSocket();

    room.webSocketClose(socket as unknown as WebSocket, 1006, '');

    expect(socket.closed).toEqual({ code: 1000, reason: '' });
  });
});

describe('telling friends', () => {
  let env: Env;
  let db: FakeD1;
  let rooms: FakeRooms;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-02T12:00:00.000Z'));
    ({ env, db, rooms } = makeEnv());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function sent(): Extract<LiveMessage, { kind: 'list' }>[] {
    return (rooms.sent.get('short01') ?? []) as Extract<LiveMessage, { kind: 'list' }>[];
  }

  async function putProgress(body: unknown): Promise<Response> {
    const request = new Request('https://example.test/api/builds/build-1/progress', { method: 'PUT', body: JSON.stringify(body) });
    return handlePutProgress(request, 'build-1', owner, env, noWait);
  }

  async function save(body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
    const request = new Request('https://example.test/api/builds/build-1', { method: 'PUT', body: JSON.stringify(body) });
    const response = await handleUpdateBuild(request, 'build-1', owner, env, noWait);
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  }

  describe('a progress write', () => {
    beforeEach(() => seedProgress(db));

    it('tells them when what is still needed changes', async () => {
      await putProgress({ patch: { 'g|Neck|Needed Necklace': 1 }, needed: [], route: {} });

      expect(sent()).toEqual([{
        kind: 'list', name: 'My Fighter', blob: 'z1.abc', needed: [], route: {}, order: null, version: '2026-11-02T12:00:00.000Z'
      }]);
    });

    it('tells them when a pick moves the route, though nothing more is needed', async () => {
      await putProgress({
        picksPatch: { 'Needed Necklace': ['Another Quest'] },
        needed: ['g|Neck|Needed Necklace'],
        route: { 'Needed Necklace': ['Another Quest'] }
      });

      expect(sent().map(message => message.route)).toEqual([{ 'Needed Necklace': ['Another Quest'] }]);
    });

    it('tells them when the route is rearranged', async () => {
      await putProgress({ order: { packs: ['Pack A'], quests: [] } });

      expect(sent().map(message => message.order)).toEqual([{ packs: ['Pack A'], quests: [] }]);
    });

    it('tells them nothing when only private ticks or picks change, or what they see is sent again unchanged', async () => {
      await putProgress({ patch: { 'g|Ring 1|Secret Ring': 0 } });
      vi.setSystemTime(new Date('2026-11-02T12:01:00.000Z'));
      await putProgress({ needed: ['g|Neck|Needed Necklace'], route: { 'Needed Necklace': ['The Shared Quest'] } });

      expect(sent()).toEqual([]);
    });

    it('tells them nothing when the write is refused', async () => {
      db.buildProgress[0].updated_at = '2026-11-02T11:59:59.500Z';

      const response = await putProgress({ needed: [], route: {} });

      expect(response.status).toBe(429);
      expect(sent()).toEqual([]);
    });
  });

  describe('a build save', () => {
    it('stores the list it carries with the build, and sends both in one message', async () => {
      seedProgress(db);

      const response = await save({
        blob: 'z1.new',
        progress: { needed: ['g|Neck|New Necklace'], route: { 'New Necklace': ['New Quest'] }, order: null }
      });

      expect(response.status).toBe(200);
      expect(response.body['progressSaved']).toBe(true);
      expect(db.builds[0].blob).toBe('z1.new');
      expect(db.buildProgress[0]).toMatchObject({
        needed: '["g|Neck|New Necklace"]',
        route: '{"New Necklace":["New Quest"]}',
        // The owner's ticks and picks are left as they were.
        entries: '{"g|Ring 1|Secret Ring":1}',
        picks: '{"Secret Ring":["The Secret Quest"]}'
      });
      expect(sent()).toEqual([{
        kind: 'list', name: 'My Fighter', blob: 'z1.new', needed: ['g|Neck|New Necklace'], route: { 'New Necklace': ['New Quest'] },
        order: null, version: '2026-11-02T12:00:00.000Z'
      }]);
    });

    it('saves the build anyway when the list is throttled, sending friends the build with the list as stored', async () => {
      seedProgress(db, { updated_at: '2026-11-02T11:59:59.500Z' });

      const response = await save({ blob: 'z1.new', progress: { needed: [], route: {} } });

      expect(response.status).toBe(200);
      expect(response.body['progressSaved']).toBe(false);
      expect(db.builds[0].blob).toBe('z1.new');
      expect(db.buildProgress[0].needed).toBe('["g|Neck|Needed Necklace"]');
      expect(sent().map(message => [message.blob, message.needed])).toEqual([['z1.new', ['g|Neck|Needed Necklace']]]);
    });

    it('sends the build with the stored list when the save carries none, and says nothing of progress', async () => {
      seedProgress(db);

      const response = await save({ name: 'Renamed' });

      expect(response.body['progressSaved']).toBeUndefined();
      expect(sent().map(message => [message.name, message.needed])).toEqual([['Renamed', ['g|Neck|Needed Necklace']]]);
    });

    it('400s a list carrying ticks or picks, or a malformed one, saving nothing', async () => {
      for (const progress of [{ patch: { a: 1 } }, { needed: 'x', route: {} }, 'nope']) {
        const response = await save({ blob: 'z1.new', progress });
        expect(response.status, JSON.stringify(progress)).toBe(400);
      }

      expect(db.builds[0].blob).toBe('z1.abc');
      expect(sent()).toEqual([]);
    });
  });

  it('closes friends\' sockets when the build is deleted', async () => {
    const response = await handleDeleteBuild('build-1', owner, env, noWait);

    expect(response.status).toBe(204);
    expect(rooms.closed).toEqual(['short01']);
  });
});
