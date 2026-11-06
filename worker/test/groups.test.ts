import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthenticatedUser, Env } from '../src/auth';
import { GroupRoom } from '../src/group-room';
import worker from '../src/index';
import { GONE_CLOSE_CODE, GroupLiveMessage } from '../src/live';
import { handleDeleteBuild } from '../src/routes/builds';
import {
  GROUP_IDLE_MS,
  handleAddGroupBuild,
  handleCreateGroup,
  handleDeleteGroup,
  handleGetGroupMe,
  handleListMyGroups,
  handlePutGroupRoute,
  handleRemoveGroupBuild,
  handleRenameGroupBuild,
  handleRotateGroupInvite,
  MAX_GROUP_BUILDS,
  MAX_GROUPS_PER_USER
} from '../src/routes/groups';
import { handlePutProgress } from '../src/routes/progress';
import { collectingWaiter, FakeD1, FakeRooms, makeEnv as makeTestEnv, seedProgress } from './fakes';

const host: AuthenticatedUser = { sub: 'auth0|host', name: 'Host' };
const friend: AuthenticatedUser = { sub: 'auth0|friend', name: 'Friend' };
const stranger: AuthenticatedUser = { sub: 'auth0|stranger', name: 'Stranger' };
const NOW = '2026-11-05T12:00:00.000Z';
const ORIGIN = 'https://ddo-gear-planner.com';

interface Made {
  env: Env;
  db: FakeD1;
  rooms: FakeRooms;
  groupRooms: FakeRooms;
}

function build(id: string, owner: string, name: string) {
  return {
    id, short_id: `s-${id}`, owner_user_id: owner, name, blob: `z1.${id}`, visibility: 'public',
    created_at: '2026-11-01T00:00:00.000Z', updated_at: '2026-11-01T00:00:00.000Z'
  };
}

/** A host with two builds, a friend with one, and a stranger with one. */
function makeEnv(): Made {
  const made = makeTestEnv();
  for (const [id, sub] of [['user-host', host.sub], ['user-friend', friend.sub], ['user-stranger', stranger.sub]]) {
    made.db.users.push({ id, auth0_sub: sub, email: null, email_verified: 0, display_name: null, created_at: 'now', last_login_at: 'now' });
  }
  made.db.builds.push(
    build('b-host1', 'user-host', 'Tank build'),
    build('b-host2', 'user-host', 'Healer build'),
    build('b-friend', 'user-friend', 'Archer build'),
    build('b-stranger', 'user-stranger', 'Other build')
  );
  return made;
}

function json(path: string, body: unknown, method = 'POST'): Request {
  return new Request(`https://example.test${path}`, { method, body: JSON.stringify(body) });
}

async function bodyOf(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

describe('group runs', () => {
  let made: Made;
  let waiter: ReturnType<typeof collectingWaiter>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(NOW));
    made = makeEnv();
    waiter = collectingWaiter();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function create(body: unknown = { name: 'Reaper night', builds: [{ buildId: 'b-host1', characterName: 'Kira' }] }) {
    const response = await handleCreateGroup(json('/api/groups', body), host, made.env);
    return { status: response.status, body: await bodyOf(response) };
  }

  /** A group the host made with their tank as Kira; its shortId and token. */
  async function created(): Promise<{ shortId: string; token: string }> {
    const { body } = await create();
    return { shortId: body['shortId'] as string, token: body['inviteToken'] as string };
  }

  function add(shortId: string, token: string | null, user: AuthenticatedUser, buildId: string, characterName: string) {
    return handleAddGroupBuild(json(`/api/groups/${shortId}/builds`, { buildId, characterName }), shortId, token, user, made.env, waiter);
  }

  /** The messages the group's room was sent, once the waiter's work is done. */
  async function groupSent(shortId: string): Promise<GroupLiveMessage[]> {
    await waiter.settle();
    return (made.groupRooms.sent.get(shortId) ?? []) as GroupLiveMessage[];
  }

  describe('creating one', () => {
    it('makes the caller host, with the builds it starts with, and answers its link', async () => {
      const response = await create({ name: '  Reaper night ', builds: [
        { buildId: 'b-host1', characterName: 'Kira' }, { buildId: 'b-host2', characterName: ' Thane ' }
      ] });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ shortId: expect.any(String), name: 'Reaper night', inviteToken: expect.stringMatching(/^[A-Za-z0-9]{22}$/) });
      expect(made.db.groups).toEqual([expect.objectContaining({
        short_id: response.body['shortId'], host_user_id: 'user-host', name: 'Reaper night', picks: '{}', route_order: null,
        created_at: NOW, updated_at: NOW
      })]);
      expect(made.db.groupBuilds.map(row => [row.build_id, row.character_name])).toEqual([['b-host1', 'Kira'], ['b-host2', 'Thane']]);
      expect(made.db.shortIds).toEqual([{ short_id: response.body['shortId'], kind: 'group', created_at: NOW }]);
    });

    it('may start empty, named by default', async () => {
      const response = await create({});

      expect(response.status).toBe(201);
      expect(response.body['name']).toBe('Shopping list');
      expect(made.db.groupBuilds).toEqual([]);
    });

    it('refuses someone else\'s build, a build twice, or two characters of one name', async () => {
      expect((await create({ builds: [{ buildId: 'b-friend', characterName: 'Vex' }] })).status).toBe(403);
      expect((await create({ builds: [{ buildId: 'b-host1', characterName: 'A' }, { buildId: 'b-host1', characterName: 'B' }] })).status).toBe(400);
      expect((await create({ builds: [{ buildId: 'b-host1', characterName: 'Kira' }, { buildId: 'b-host2', characterName: 'KIRA' }] })).status).toBe(409);
      expect(made.db.groups).toEqual([]);
    });

    it('refuses a character name that is blank or too long, and a group name too long', async () => {
      expect((await create({ builds: [{ buildId: 'b-host1', characterName: '  ' }] })).status).toBe(400);
      expect((await create({ builds: [{ buildId: 'b-host1', characterName: 'x'.repeat(21) }] })).status).toBe(400);
      expect((await create({ name: 'x'.repeat(61) })).status).toBe(400);
    });

    it(`caps the groups one user hosts at ${MAX_GROUPS_PER_USER}, not counting idle ones, which it deletes`, async () => {
      for (let i = 0; i < MAX_GROUPS_PER_USER; i++) {
        expect((await create({})).status).toBe(201);
      }
      expect((await create({})).status).toBe(409);

      made.db.groups[0].updated_at = new Date(Date.parse(NOW) - GROUP_IDLE_MS - 1).toISOString();
      expect((await create({})).status).toBe(201);
      expect(made.db.groups).toHaveLength(MAX_GROUPS_PER_USER);
    });
  });

  describe('adding a build', () => {
    it('adds the caller\'s own build with the invite token, and sends the group to its watchers', async () => {
      const { shortId, token } = await created();
      vi.setSystemTime(new Date(Date.parse(NOW) + 1000));

      const response = await add(shortId, token, friend, 'b-friend', 'Vex');

      expect(response.status).toBe(201);
      expect(await bodyOf(response)).toEqual({ buildId: 'b-friend', characterName: 'Vex' });
      const [message] = await groupSent(shortId);
      expect(message).toEqual({
        kind: 'group', name: 'Reaper night', picks: {}, order: null, version: '2026-11-05T12:00:01.000Z',
        members: [
          { buildId: 'b-host1', characterName: 'Kira', list: { name: 'Tank build', blob: 'z1.b-host1', needed: null, route: {}, order: null, version: '2026-11-01T00:00:00.000Z' } },
          { buildId: 'b-friend', characterName: 'Vex', list: { name: 'Archer build', blob: 'z1.b-friend', needed: null, route: {}, order: null, version: '2026-11-01T00:00:00.000Z' } }
        ]
      });
    });

    it('404s without the token, or with an old one, exactly as for no group', async () => {
      const { shortId } = await created();

      expect((await add(shortId, null, friend, 'b-friend', 'Vex')).status).toBe(404);
      expect((await add(shortId, 'wrong-token-wrong-token', friend, 'b-friend', 'Vex')).status).toBe(404);
      expect((await add('nothing', 'x', friend, 'b-friend', 'Vex')).status).toBe(404);
      expect(made.db.groupBuilds).toHaveLength(1);
    });

    it('refuses someone else\'s build', async () => {
      const { shortId, token } = await created();

      expect((await add(shortId, token, friend, 'b-host2', 'Thane')).status).toBe(403);
    });

    it('409s a build already in, and a character name taken, saying which', async () => {
      const { shortId, token } = await created();

      expect((await add(shortId, token, host, 'b-host1', 'Other')).status).toBe(409);
      const taken = await add(shortId, token, friend, 'b-friend', 'kira');
      expect(taken.status).toBe(409);
      expect((await bodyOf(taken))['nameTaken']).toBe(true);
    });

    it(`holds up to ${MAX_GROUP_BUILDS} builds`, async () => {
      const { shortId, token } = await created();
      for (let i = 2; i <= MAX_GROUP_BUILDS + 1; i++) {
        made.db.builds.push(build(`b-more${i}`, 'user-friend', `More ${i}`));
      }

      for (let i = 2; i <= MAX_GROUP_BUILDS; i++) {
        expect((await add(shortId, token, friend, `b-more${i}`, `Alt ${i}`)).status).toBe(201);
      }
      const full = await add(shortId, token, friend, `b-more${MAX_GROUP_BUILDS + 1}`, 'One too many');

      expect(full.status).toBe(409);
      expect((await bodyOf(full))['full']).toBe(true);
      expect(made.db.groupBuilds).toHaveLength(MAX_GROUP_BUILDS);
    });
  });

  describe('renaming and removing', () => {
    let shortId: string;

    beforeEach(async () => {
      const group = await created();
      shortId = group.shortId;
      await add(shortId, group.token, friend, 'b-friend', 'Vex');
    });

    function rename(user: AuthenticatedUser, buildId: string, characterName: string) {
      return handleRenameGroupBuild(json('', { characterName }, 'PATCH'), shortId, buildId, user, made.env, waiter);
    }

    it('lets a build\'s owner rename its character, and no one else - not even the host', async () => {
      expect((await rename(friend, 'b-friend', 'Vexx')).status).toBe(200);
      expect((await rename(host, 'b-friend', 'Hosted')).status).toBe(403);
      expect(made.db.groupBuilds.find(row => row.build_id === 'b-friend')?.character_name).toBe('Vexx');
      expect((await rename(friend, 'b-friend', 'KIRA')).status).toBe(409);
    });

    it('lets a build\'s owner or the host take it out, and no one else', async () => {
      expect((await handleRemoveGroupBuild(shortId, 'b-friend', stranger, made.env, waiter)).status).toBe(403);
      expect((await handleRemoveGroupBuild(shortId, 'b-host1', friend, made.env, waiter)).status).toBe(403);
      expect((await handleRemoveGroupBuild(shortId, 'b-friend', host, made.env, waiter)).status).toBe(204);
      expect((await handleRemoveGroupBuild(shortId, 'b-friend', friend, made.env, waiter)).status).toBe(404);

      const messages = await groupSent(shortId);
      expect(messages.at(-1)).toMatchObject({ kind: 'group', members: [{ buildId: 'b-host1' }] });
    });
  });

  describe('the shared route', () => {
    let shortId: string;

    beforeEach(async () => {
      ({ shortId } = await created());
      vi.setSystemTime(new Date(Date.parse(NOW) + 60000));
    });

    function putRoute(user: AuthenticatedUser, body: unknown) {
      return handlePutGroupRoute(json('', body, 'PUT'), shortId, user, made.env, waiter);
    }

    it('is the host\'s to arrange: picks merge, the order replaces, and watchers are sent it', async () => {
      const response = await putRoute(host, { picksPatch: { 'Ring': ['Quest A'] }, order: { packs: ['Pack B'], quests: [] } });

      expect(response.status).toBe(200);
      expect(await bodyOf(response)).toEqual({ picks: { Ring: ['Quest A'] }, order: { packs: ['Pack B'], quests: [] } });
      expect((await groupSent(shortId)).at(-1)).toMatchObject({ kind: 'group', picks: { Ring: ['Quest A'] }, order: { packs: ['Pack B'], quests: [] } });

      vi.setSystemTime(new Date(Date.parse(NOW) + 120000));
      const cleared = await putRoute(host, { picksPatch: { 'Ring': null }, order: null });
      expect(await bodyOf(cleared)).toEqual({ picks: {}, order: null });
    });

    it('403s anyone else, and 400s ticks or a published list', async () => {
      expect((await putRoute(friend, { order: null })).status).toBe(403);
      expect((await putRoute(host, { patch: { a: 1 } })).status).toBe(400);
      expect((await putRoute(host, { needed: [], route: {} })).status).toBe(400);
    });

    it('is throttled like a build\'s progress', async () => {
      expect((await putRoute(host, { order: null })).status).toBe(200);

      const response = await putRoute(host, { order: null });

      expect(response.status).toBe(429);
      expect((await bodyOf(response))['retryAfterMs']).toEqual(expect.any(Number));
    });
  });

  describe('the invite link and the group itself', () => {
    it('lets the host rotate the token, which closes every watcher\'s socket', async () => {
      const { shortId, token } = await created();

      expect((await handleRotateGroupInvite(shortId, friend, made.env, waiter)).status).toBe(403);
      const response = await handleRotateGroupInvite(shortId, host, made.env, waiter);

      const fresh = (await bodyOf(response))['inviteToken'] as string;
      expect(fresh).not.toBe(token);
      expect(made.groupRooms.closed).toEqual([shortId]);
      expect((await add(shortId, token, friend, 'b-friend', 'Vex')).status).toBe(404);
      expect((await add(shortId, fresh, friend, 'b-friend', 'Vex')).status).toBe(201);
    });

    it('lets the host end it, leaving the builds as they were', async () => {
      const { shortId } = await created();

      expect((await handleDeleteGroup(shortId, friend, made.env, waiter)).status).toBe(403);
      expect((await handleDeleteGroup(shortId, host, made.env, waiter)).status).toBe(204);

      expect(made.db.groups).toEqual([]);
      expect(made.db.groupBuilds).toEqual([]);
      expect(made.db.builds).toHaveLength(4);
      expect(made.groupRooms.closed).toEqual([shortId]);
    });

    it('tells the viewer whether they host it and which builds are theirs', async () => {
      const { shortId, token } = await created();
      await add(shortId, token, friend, 'b-friend', 'Vex');

      expect(await bodyOf(await handleGetGroupMe(shortId, token, host, made.env))).toEqual({ isHost: true, yourBuildIds: ['b-host1'] });
      expect(await bodyOf(await handleGetGroupMe(shortId, token, friend, made.env))).toEqual({ isHost: false, yourBuildIds: ['b-friend'] });
      expect((await handleGetGroupMe(shortId, 'nope', friend, made.env)).status).toBe(404);
    });

    it('lists the groups a user hosts or has a build in, deleting idle ones', async () => {
      const { shortId, token } = await created();
      await add(shortId, token, friend, 'b-friend', 'Vex');
      await create({ name: 'Old run' });
      made.db.groups[1].updated_at = new Date(Date.parse(NOW) - GROUP_IDLE_MS - 1).toISOString();

      const forHost = await (await handleListMyGroups(host, made.env)).json();
      const forFriend = await (await handleListMyGroups(friend, made.env)).json();
      const forStranger = await (await handleListMyGroups(stranger, made.env)).json();

      expect(forHost).toEqual([
        { shortId, name: 'Reaper night', inviteToken: token, isHost: true, buildCount: 2, yourBuildIds: ['b-host1'], updatedAt: NOW }
      ]);
      expect(forFriend).toEqual([
        { shortId, name: 'Reaper night', inviteToken: token, isHost: false, buildCount: 2, yourBuildIds: ['b-friend'], updatedAt: NOW }
      ]);
      expect(forStranger).toEqual([]);
      expect(made.db.groups).toHaveLength(1);
    });

    it('counts a tick in any of its builds as activity, so a group in use isn\'t idle', async () => {
      const { shortId } = await created();
      made.db.groups[0].updated_at = '2026-10-01T00:00:00.000Z';
      seedProgress(made.db, 'b-host1', { owner_user_id: 'user-host', updated_at: '2026-11-04T00:00:00.000Z' });

      const listed = await (await handleListMyGroups(host, made.env)).json() as { shortId: string; updatedAt: string }[];

      expect(listed.map(group => [group.shortId, group.updatedAt])).toEqual([[shortId, '2026-11-04T00:00:00.000Z']]);
    });
  });

  describe('what a build\'s changes send its groups', () => {
    it('sends each group the build is in that build\'s list as it changes', async () => {
      const { shortId } = await created();
      seedProgress(made.db, 'b-host1', { owner_user_id: 'user-host', route_order: null, updated_at: '2026-11-05T11:00:00.000Z' });

      const request = json('/api/builds/b-host1/progress', { needed: [], route: {} }, 'PUT');
      expect((await handlePutProgress(request, 'b-host1', host, made.env, waiter)).status).toBe(200);

      expect(await groupSent(shortId)).toEqual([{
        kind: 'member', buildId: 'b-host1',
        list: { name: 'Tank build', blob: 'z1.b-host1', needed: [], route: {}, order: null, version: NOW }
      }]);
      // The build's own friends still get theirs.
      expect(made.rooms.sent.get('s-b-host1')).toHaveLength(1);
    });

    it('takes a deleted build out of its groups, sending each the group without it', async () => {
      const { shortId, token } = await created();
      await add(shortId, token, friend, 'b-friend', 'Vex');
      await waiter.settle();
      made.groupRooms.sent.clear();

      expect((await handleDeleteBuild('b-friend', friend, made.env, waiter)).status).toBe(204);

      expect(made.db.groupBuilds.map(row => row.build_id)).toEqual(['b-host1']);
      expect(await groupSent(shortId)).toEqual([expect.objectContaining({ kind: 'group', members: [expect.objectContaining({ buildId: 'b-host1' })] })]);
    });
  });
});

describe('GET /api/groups/:shortId/live', () => {
  function liveRequest(path: string, headers: Record<string, string>): Request {
    return new Request(`https://example.test${path}`, { headers });
  }

  it('forwards an upgrade from an allowed origin to the group\'s room, with the token', async () => {
    const { env, groupRooms } = makeEnv();

    await worker.fetch(liveRequest('/api/groups/grp00001/live?t=abc', { Upgrade: 'websocket', Origin: ORIGIN }), env);

    expect(groupRooms.connects.map(connect => connect.shortId)).toEqual(['grp00001']);
    expect(new URL(groupRooms.connects[0].request.url).searchParams.get('t')).toBe('abc');
  });

  it('426s a request that isn\'t an upgrade, and 403s a foreign origin', async () => {
    const { env, groupRooms } = makeEnv();

    expect((await worker.fetch(liveRequest('/api/groups/grp00001/live', { Origin: ORIGIN }), env)).status).toBe(426);
    expect((await worker.fetch(liveRequest('/api/groups/grp00001/live', { Upgrade: 'websocket', Origin: 'https://evil.test' }), env)).status).toBe(403);
    expect(groupRooms.connects).toEqual([]);
  });
});

/** Just enough of the Workers runtime for GroupRoom under Node; as live.test.ts's. */
class FakeSocket {
  sent: string[] = [];
  closed: { code: number; reason: string } | null = null;
  send(text: string): void {
    this.sent.push(text);
  }
  close(code: number, reason: string): void {
    this.closed = { code, reason };
  }
}

describe('GroupRoom', () => {
  let accepted: FakeSocket[];
  let room: GroupRoom;
  let made: Made;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(NOW));
    accepted = [];
    made = makeEnv();
    vi.stubGlobal('WebSocketPair', class {
      0 = new FakeSocket();
      1 = new FakeSocket();
    });
    vi.stubGlobal('WebSocketRequestResponsePair', class {
      constructor(readonly request: string, readonly response: string) {}
    });
    vi.stubGlobal('Response', class {
      readonly status: number;
      readonly webSocket: unknown;
      constructor(_body: unknown, init?: { status?: number; webSocket?: unknown }) {
        this.status = init?.status ?? 200;
        this.webSocket = init?.webSocket;
      }
    });
    const state = {
      setWebSocketAutoResponse: () => undefined,
      acceptWebSocket: (socket: FakeSocket) => { accepted.push(socket); },
      getWebSockets: () => accepted
    } as unknown as DurableObjectState;
    room = new GroupRoom(state, made.env);
    made.db.groups.push({
      id: 'g1', short_id: 'grp00001', host_user_id: 'user-host', name: 'Reaper night', invite_token: 'secret-token',
      picks: '{"Ring":["Quest A"]}', route_order: null, created_at: NOW, updated_at: NOW
    });
    made.db.groupBuilds.push({ group_id: 'g1', build_id: 'b-host1', added_by_user_id: 'user-host', character_name: 'Kira', added_at: NOW });
    seedProgress(made.db, 'b-host1', { owner_user_id: 'user-host', updated_at: '2026-11-05T11:00:00.000Z' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function connect(token: string): Promise<Response> {
    return room.fetch(new Request(`https://room/connect?shortId=grp00001&t=${token}`));
  }

  it('sends the whole group to a socket with the token - what friends see of each build, never ticks or picks', async () => {
    const response = await connect('secret-token');

    expect(response.status).toBe(101);
    expect(accepted[0].sent.map(text => JSON.parse(text))).toEqual([{
      kind: 'group', name: 'Reaper night', picks: { Ring: ['Quest A'] }, order: null, version: NOW,
      members: [{
        buildId: 'b-host1', characterName: 'Kira',
        list: {
          name: 'Tank build', blob: 'z1.b-host1', needed: ['g|Neck|Needed Necklace'], route: { 'Needed Necklace': ['The Shared Quest'] },
          order: { packs: ['Pack B', ''], quests: ['The Shared Quest'] }, version: '2026-11-05T11:00:00.000Z'
        }
      }]
    }]);
  });

  it('says gone, and closes, to a wrong token', async () => {
    await connect('wrong');

    expect(accepted[0].sent).toEqual(['{"kind":"gone"}']);
    expect(accepted[0].closed?.code).toBe(GONE_CLOSE_CODE);
  });

  it('deletes an idle group, saying gone', async () => {
    made.db.groups[0].updated_at = '2026-10-01T00:00:00.000Z';
    made.db.buildProgress[0].updated_at = '2026-10-01T00:00:00.000Z';

    await connect('secret-token');

    expect(accepted[0].sent).toEqual(['{"kind":"gone"}']);
    expect(made.db.groups).toEqual([]);
  });
});
