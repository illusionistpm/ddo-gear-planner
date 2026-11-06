import { Env } from './auth';
import { parseAllowedOrigins } from './cors';
import { GroupMemberRow, GroupRow, LiveBuildRow, getGroupByShortId, listGroupMembers, listGroupShortIdsForBuild } from './db';
import { errorResponse } from './http';
import sharedConstants from '../../shared/constants.json';

// A friend's live list of what a saved build still needs. Each friend page
// holds a WebSocket to the build's ProgressRoom (progress-room.ts), which
// sends the whole list on connect and again whenever the owner changes
// what friends see. Friends never send anything but the keepalive ping.
//
// Why a socket and not polling: the free plan's request quota. A socket
// costs one request to open; while it's quiet the room hibernates and costs
// nothing; a change costs the Worker one request to the room, and the
// messages the room sends on are free. A friend polling would pay a request
// per poll whether anything changed or not.

/** The order the owner arranged the route in (see migrations/0007). */
export interface RouteOrder {
  packs: string[];
  quests: string[];
}

/** Everything a friend's page shows. Never the owner's ticks or picks. */
export interface FriendList {
  name: string;
  /** The build as saved, for the friend's page to work out what it needs. */
  blob: string;
  /** Still-needed entry keys; null when the owner has never shared a list. */
  needed: string[] | null;
  /** For each still-needed thing, the quests the owner's list sends them to. */
  route: Record<string, string[]>;
  order: RouteOrder | null;
  /**
   * The later of the build's and its progress's updated_at. A message older
   * than one already shown is stale - the connect snapshot can be overtaken
   * by a change sent while it was being read - and the page drops it.
   */
  version: string;
}

/**
 * What a friend's page receives: the list, or that there's no (longer a)
 * build to show - a missing, private or deleted one. The site's copy of
 * this shape is site/src/app/build/live-build-list.service.ts.
 */
export type LiveMessage = ({ kind: 'list' } & FriendList) | { kind: 'gone' };

/**
 * After 'gone' the room also closes the socket with this. Best effort: a
 * hibernated socket closed from the server end can be left half-closed
 * (seen under `wrangler dev`), so the page acts on the message and closes
 * the socket itself, which always completes.
 */
export const GONE_CLOSE_CODE = sharedConstants.liveGoneCloseCode;
export const GONE_MESSAGE = JSON.stringify({ kind: 'gone' } satisfies LiveMessage);
export const GONE_REASON = 'No build found for that link.';

/** Keepalive: the room answers this without waking (setWebSocketAutoResponse). */
export const PING = sharedConstants.livePing;
export const PONG = sharedConstants.livePong;

/** What the Worker's handlers are given to finish work after answering. */
export interface Waiter {
  waitUntil(promise: Promise<unknown>): void;
}

/** A progress row's public columns, as stored. */
interface SharedColumns {
  needed: string | null;
  route: string | null;
  route_order: string | null;
}

/**
 * What friends see of a build's progress, parsed: needed is null, not [],
 * when the owner has never shared a list, so a friend sees "nothing shared
 * yet" rather than "nothing left to get". The owner's own GET answers with
 * the same three fields.
 */
export function sharedListOf(progress: SharedColumns | null): Pick<FriendList, 'needed' | 'route' | 'order'> {
  return {
    needed: progress?.needed ? JSON.parse(progress.needed) as string[] : null,
    route: progress?.route ? JSON.parse(progress.route) as Record<string, string[]> : {},
    order: progress?.route_order ? JSON.parse(progress.route_order) as RouteOrder : null
  };
}

export function friendListOf(
  build: { name: string; blob: string; updated_at: string },
  progress: (SharedColumns & { updated_at: string | null }) | null
): FriendList {
  const progressAt = progress?.updated_at ?? '';
  return {
    name: build.name,
    blob: build.blob,
    ...sharedListOf(progress),
    version: progressAt > build.updated_at ? progressAt : build.updated_at
  };
}

export function friendListOfRow(row: LiveBuildRow): FriendList {
  return friendListOf({ name: row.name, blob: row.blob, updated_at: row.build_updated_at }, row);
}

/** The response refusing a live socket: not an upgrade, or from an origin not on the list. */
function refuseUpgrade(request: Request, env: Env): Response | null {
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    return errorResponse(426, 'This is a WebSocket endpoint.');
  }
  const origin = request.headers.get('Origin');
  if (!origin || !parseAllowedOrigins(env.ALLOWED_ORIGINS).includes(origin)) {
    return errorResponse(403, 'Origin not allowed.');
  }
  return null;
}

/**
 * GET /api/build/:shortId/live, a WebSocket upgrade. WebSockets aren't
 * covered by CORS, so the Origin is checked here. The room looks the build
 * up itself: it answers a missing one with 'gone', which a page can read -
 * a refused upgrade only reads as a network error.
 */
export async function handleLive(request: Request, shortId: string, env: Env): Promise<Response> {
  const refused = refuseUpgrade(request, env);
  if (refused) {
    return refused;
  }
  const url = `https://room/connect?shortId=${encodeURIComponent(shortId)}`;
  return roomFor(env, shortId).fetch(new Request(url, { headers: request.headers }));
}

/**
 * Sends a build's friends its list as it now is, and each group run the
 * build is in (group-room.ts) that build's part of the group's list. Best
 * effort: a failure only means they catch up on reconnect.
 */
export function tellFriends(env: Env, waiter: Waiter, build: { id: string; short_id: string }, list: FriendList): void {
  const message: LiveMessage = { kind: 'list', ...list };
  waiter.waitUntil(send(roomFor(env, build.short_id), JSON.stringify(message)));
  const memberMessage: GroupLiveMessage = { kind: 'member', buildId: build.id, list };
  waiter.waitUntil(
    listGroupShortIdsForBuild(env.DB, build.id)
      .then(groups => Promise.all(groups.map(group => send(groupRoomFor(env, group), JSON.stringify(memberMessage)))))
      .catch(() => undefined)
  );
}

/**
 * Tells a deleted build's friends it's gone, and closes their sockets; and
 * sends each group run it was in (`groups`, read before it was deleted)
 * the group as it now is, without it.
 */
export function closeFriends(env: Env, waiter: Waiter, shortId: string, groups: readonly string[] = []): void {
  waiter.waitUntil(roomFor(env, shortId).fetch('https://room/close', { method: 'POST' }).catch(() => undefined));
  for (const group of groups) {
    tellGroup(env, waiter, group);
  }
}

function roomFor(env: Env, shortId: string): DurableObjectStub {
  return env.PROGRESS_ROOMS.get(env.PROGRESS_ROOMS.idFromName(shortId));
}

function send(room: DurableObjectStub, text: string): Promise<unknown> {
  return room.fetch('https://room/send', { method: 'POST', body: text }).catch(() => undefined);
}

// Group runs (routes/groups.ts): one GroupRoom (group-room.ts) per group,
// by its shortId, holding the sockets of everyone watching its list. On
// connect it sends the whole group; after that, a build's list as it
// changes ('member'), and the whole group again when who's in it, their
// names or the route change ('group') - rare, and a whole group keeps the
// page simple.

/** One build of a group, as its live list sends it. */
export interface GroupMember {
  buildId: string;
  characterName: string;
  list: FriendList;
}

/** Everything a group's page shows. Never anyone's ticks or picks, nor the invite token. */
export interface GroupList {
  name: string;
  /** The group's one shared route: picks by thing, and the order the host arranged it in. */
  picks: Record<string, string[]>;
  order: RouteOrder | null;
  members: GroupMember[];
  /**
   * The group's updated_at. A 'group' message older than one already shown
   * is stale, and the page drops it; each member's list carries its own
   * version, for 'member' messages.
   */
  version: string;
}

/** What a group's page receives. The site's copy is site/src/app/build/live-group-list.service.ts. */
export type GroupLiveMessage =
  | ({ kind: 'group' } & GroupList)
  | { kind: 'member'; buildId: string; list: FriendList }
  | { kind: 'gone' };

export function groupListOf(group: GroupRow, members: readonly GroupMemberRow[]): GroupList {
  return {
    name: group.name,
    picks: JSON.parse(group.picks) as Record<string, string[]>,
    order: group.route_order === null ? null : JSON.parse(group.route_order) as RouteOrder,
    members: members.map(member => ({
      buildId: member.build_id,
      characterName: member.character_name,
      list: friendListOf({ name: member.name, blob: member.blob, updated_at: member.build_updated_at }, member)
    })),
    version: group.updated_at
  };
}

/** Sends a group's watchers the whole group as it now is. Best effort, like tellFriends. */
export function tellGroup(env: Env, waiter: Waiter, shortId: string): void {
  waiter.waitUntil((async () => {
    const group = await getGroupByShortId(env.DB, shortId);
    if (!group) {
      return;
    }
    const message: GroupLiveMessage = { kind: 'group', ...groupListOf(group, await listGroupMembers(env.DB, group.id)) };
    await send(groupRoomFor(env, shortId), JSON.stringify(message));
  })().catch(() => undefined));
}

/** Tells a group's watchers it's gone - ended, or its link replaced - and closes their sockets. */
export function closeGroup(env: Env, waiter: Waiter, shortId: string): void {
  waiter.waitUntil(groupRoomFor(env, shortId).fetch('https://room/close', { method: 'POST' }).catch(() => undefined));
}

/**
 * GET /api/groups/:shortId/live?t=, a WebSocket upgrade: handleLive's
 * checks, then the group's room, which checks the token itself and answers
 * a wrong one with 'gone', as it does a missing group.
 */
export async function handleGroupLive(request: Request, shortId: string, env: Env): Promise<Response> {
  const refused = refuseUpgrade(request, env);
  if (refused) {
    return refused;
  }
  const token = new URL(request.url).searchParams.get('t') ?? '';
  const url = `https://room/connect?shortId=${encodeURIComponent(shortId)}&t=${encodeURIComponent(token)}`;
  return groupRoomFor(env, shortId).fetch(new Request(url, { headers: request.headers }));
}

function groupRoomFor(env: Env, shortId: string): DurableObjectStub {
  return env.GROUP_ROOMS.get(env.GROUP_ROOMS.idFromName(shortId));
}
