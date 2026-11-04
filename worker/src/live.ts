import { Env } from './auth';
import { parseAllowedOrigins } from './cors';
import { LiveBuildRow } from './db';
import { errorResponse } from './http';

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
 * build to show - a missing, private or deleted one.
 */
export type LiveMessage = ({ kind: 'list' } & FriendList) | { kind: 'gone' };

/**
 * After 'gone' the room also closes the socket with this. Best effort: a
 * hibernated socket closed from the server end can be left half-closed
 * (seen under `wrangler dev`), so the page acts on the message and closes
 * the socket itself, which always completes.
 */
export const GONE_CLOSE_CODE = 4404;
export const GONE_MESSAGE = JSON.stringify({ kind: 'gone' } satisfies LiveMessage);

/** Keepalive: the room answers this without waking (setWebSocketAutoResponse). */
export const PING = 'ping';
export const PONG = 'pong';

/** What the Worker's handlers are given to finish work after answering. */
export interface Waiter {
  waitUntil(promise: Promise<unknown>): void;
}

export function friendListOf(
  build: { name: string; blob: string; updated_at: string },
  progress: { needed: string | null; route: string | null; route_order: string | null; updated_at: string | null } | null
): FriendList {
  const progressAt = progress?.updated_at ?? '';
  return {
    name: build.name,
    blob: build.blob,
    needed: progress?.needed ? JSON.parse(progress.needed) as string[] : null,
    route: progress?.route ? JSON.parse(progress.route) as Record<string, string[]> : {},
    order: progress?.route_order ? JSON.parse(progress.route_order) as RouteOrder : null,
    version: progressAt > build.updated_at ? progressAt : build.updated_at
  };
}

export function friendListOfRow(row: LiveBuildRow): FriendList {
  return friendListOf({ name: row.name, blob: row.blob, updated_at: row.build_updated_at }, row);
}

/**
 * GET /api/build/:shortId/live, a WebSocket upgrade. WebSockets aren't
 * covered by CORS, so the Origin is checked here. The room looks the build
 * up itself: it answers a missing one with 'gone', which a page can read -
 * a refused upgrade only reads as a network error.
 */
export async function handleLive(request: Request, shortId: string, env: Env): Promise<Response> {
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    return errorResponse(426, 'This is a WebSocket endpoint.');
  }
  const origin = request.headers.get('Origin');
  if (!origin || !parseAllowedOrigins(env.ALLOWED_ORIGINS).includes(origin)) {
    return errorResponse(403, 'Origin not allowed.');
  }
  const url = `https://room/connect?shortId=${encodeURIComponent(shortId)}`;
  return roomFor(env, shortId).fetch(new Request(url, { headers: request.headers }));
}

/** Sends a build's friends its list as it now is. Best effort: a failure only means they catch up on reconnect. */
export function tellFriends(env: Env, waiter: Waiter, shortId: string, list: FriendList): void {
  const message: LiveMessage = { kind: 'list', ...list };
  waiter.waitUntil(
    roomFor(env, shortId).fetch('https://room/send', { method: 'POST', body: JSON.stringify(message) }).catch(() => undefined)
  );
}

/** Tells a deleted build's friends it's gone, and closes their sockets. */
export function closeFriends(env: Env, waiter: Waiter, shortId: string): void {
  waiter.waitUntil(roomFor(env, shortId).fetch('https://room/close', { method: 'POST' }).catch(() => undefined));
}

function roomFor(env: Env, shortId: string): DurableObjectStub {
  return env.PROGRESS_ROOMS.get(env.PROGRESS_ROOMS.idFromName(shortId));
}
