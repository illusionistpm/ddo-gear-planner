import { AuthenticatedUser, Env } from '../auth';
import {
  BuildProgressRow,
  BuildRow,
  countProgressWritesOnDay,
  getBuildById,
  getBuildProgress,
  upsertBuildProgressStatement
} from '../db';
import { errorResponse, jsonResponse } from '../http';
import { friendListOf, RouteOrder, tellFriends, Waiter } from '../live';
import sharedConstants from '../../../shared/constants.json';
import { resolveOwnerUserId } from './builds';

// Shopping-list progress for saved builds (see migrations/0006). None of
// these routes go through checkMutationRateLimit or touch KV: that limiter
// costs a KV write per request, and the free tier's 1,000 KV writes a day
// would run out within about a hundred ticking sessions. Writes are
// throttled in D1 instead - see planProgressWrite. Friends get what's
// still needed over live.ts's sockets, never from these routes.

// Sizing, from the longest names in data/: a key is up to about 230
// characters (slot, a 59-character item, a craftable, a 110-character
// selection), and a big build lists a few hundred things. These caps sit
// well above that; they only stop a runaway or scripted client.
const MAX_ENTRIES = sharedConstants.maxProgressEntries;
const MAX_PICKS = sharedConstants.maxProgressPicks;
const MAX_KEY_LENGTH = sharedConstants.maxProgressKeyLength;
// The stored JSON columns together, and the request body, counted in
// string length (UTF-16 units) - close enough to bytes for a ceiling.
export const MAX_PROGRESS_BYTES = sharedConstants.maxProgressBytes;
const MAX_BYTES = MAX_PROGRESS_BYTES;
const MIN_WRITE_INTERVAL_MS = sharedConstants.progressMinWriteIntervalMs;
const MAX_WRITES_PER_USER_PER_DAY = sharedConstants.maxProgressWritesPerUserPerDay;

type QuestLists = Record<string, string[]>;

export interface ProgressPut {
  /** Tick overrides to set (0 or 1) or forget (null). */
  patch: Map<string, 0 | 1 | null>;
  /** Picks to set or forget (null). */
  picksPatch: Map<string, string[] | null>;
  /** Replaces what friends see; absent leaves it as it was. */
  published: { needed: string[]; route: QuestLists } | null;
  /** Arranges the route, or (null) puts it back in its default order; undefined leaves it as it was. */
  order: RouteOrder | null | undefined;
}

function toOwnerProgress(row: BuildProgressRow | null) {
  return {
    entries: row ? JSON.parse(row.entries) as Record<string, 0 | 1> : {},
    picks: row ? JSON.parse(row.picks) as QuestLists : {},
    needed: row?.needed ? JSON.parse(row.needed) as string[] : null,
    route: row?.route ? JSON.parse(row.route) as QuestLists : {},
    order: orderOf(row?.route_order ?? null),
    updatedAt: row?.updated_at ?? null
  };
}

function orderOf(text: string | null): RouteOrder | null {
  return text === null ? null : JSON.parse(text) as RouteOrder;
}

/** The owner's whole progress doc. An empty one when nothing is stored yet. */
export async function handleGetOwnProgress(buildId: string, user: AuthenticatedUser, env: Env): Promise<Response> {
  const owned = await checkOwnership(buildId, user, env);
  if (owned instanceof Response) {
    return owned;
  }
  return jsonResponse(toOwnerProgress(await getBuildProgress(env.DB, buildId)));
}

/**
 * Merges tick and pick patches into the stored doc and, when given,
 * replaces what friends see and the route's order. Body: {patch?,
 * picksPatch?, needed?, route?, order?}, needed and route together or not
 * at all, order null to clear it. Answers with the merged doc, and tells
 * the build's friends when what they see changed.
 *
 * Throttled per build to one write every MIN_WRITE_INTERVAL_MS (429 with
 * retryAfterMs) and capped per user per UTC day (429 with
 * dailyCapReached). The client debounces well inside both, so either
 * means something is wrong with it or someone is scripting the API. Never
 * touches builds.updated_at or KV.
 */
export async function handlePutProgress(
  request: Request, buildId: string, user: AuthenticatedUser, env: Env, waiter: Waiter
): Promise<Response> {
  const owned = await checkOwnership(buildId, user, env);
  if (owned instanceof Response) {
    return owned;
  }

  const text = await request.text();
  if (text.length > MAX_BYTES) {
    return errorResponse(413, 'That shopping list is too big to save.');
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return errorResponse(400, 'Invalid shopping list progress.');
  }
  const put = parseProgressPut(body);
  if (!put) {
    return errorResponse(400, 'Invalid shopping list progress.');
  }

  const plan = await planProgressWrite(env, owned.build, owned.ownerUserId, put, Date.now());
  if (plan instanceof Response) {
    return plan;
  }
  const result = await plan.statement.run();
  if (!result.meta.changes) {
    // Another write landed between our read and this one.
    return throttled(MIN_WRITE_INTERVAL_MS);
  }
  if (plan.friendsSeeChange) {
    tellFriends(env, waiter, owned.build.short_id, friendListOf(owned.build, plan.row));
  }
  return jsonResponse(toOwnerProgress({ ...plan.row, writes_today: 0 }));
}

/** A progress write, checked and ready to run: it wrote the row if its statement changed one. */
export interface ProgressWritePlan {
  statement: D1PreparedStatement;
  row: Omit<BuildProgressRow, 'writes_today'>;
  /** It changes what friends see: needed, route or order. */
  friendsSeeChange: boolean;
}

/**
 * Merges a write into the stored doc, refusing it (the response to send)
 * when it comes too soon after the last, would make the doc too big, or
 * passes the owner's writes for today. Shared by PUT .../progress and a
 * build save that carries its list (routes/builds.ts).
 */
export async function planProgressWrite(
  env: Env, build: BuildRow, ownerUserId: string, put: ProgressPut, now: number
): Promise<ProgressWritePlan | Response> {
  const existing = await getBuildProgress(env.DB, build.id);
  if (existing) {
    const waitMs = Date.parse(existing.updated_at) + MIN_WRITE_INTERVAL_MS - now;
    if (waitMs > 0) {
      return throttled(waitMs);
    }
  }

  const entries = mergePatch(existing ? JSON.parse(existing.entries) as Record<string, 0 | 1> : {}, put.patch);
  const picks = mergePatch(existing ? JSON.parse(existing.picks) as QuestLists : {}, put.picksPatch);
  if (Object.keys(entries).length > MAX_ENTRIES || Object.keys(picks).length > MAX_PICKS) {
    return errorResponse(413, 'That shopping list is too big to save.');
  }

  const day = new Date(now).toISOString().slice(0, 10);
  const row: Omit<BuildProgressRow, 'writes_today'> = {
    build_id: build.id,
    owner_user_id: ownerUserId,
    entries: JSON.stringify(entries),
    picks: JSON.stringify(picks),
    needed: put.published ? JSON.stringify(put.published.needed) : existing?.needed ?? null,
    route: put.published ? JSON.stringify(put.published.route) : existing?.route ?? null,
    route_order: put.order === undefined ? existing?.route_order ?? null : put.order && JSON.stringify(put.order),
    updated_at: new Date(now).toISOString(),
    write_day: day
  };
  const stored = [row.entries, row.picks, row.needed, row.route, row.route_order];
  if (stored.reduce((total, column) => total + (column?.length ?? 0), 0) > MAX_BYTES) {
    return errorResponse(413, 'That shopping list is too big to save.');
  }

  if (await countProgressWritesOnDay(env.DB, ownerUserId, day) >= MAX_WRITES_PER_USER_PER_DAY) {
    return jsonResponse(
      { error: 'Too many shopping list changes today. They are kept on this device.', dailyCapReached: true },
      { status: 429 }
    );
  }

  const statement = upsertBuildProgressStatement(env.DB, row, {
    baseUpdatedAt: existing?.updated_at ?? null,
    notAfter: new Date(now - MIN_WRITE_INTERVAL_MS).toISOString()
  });
  const friendsSeeChange = row.needed !== (existing?.needed ?? null)
    || row.route !== (existing?.route ?? null)
    || row.route_order !== (existing?.route_order ?? null);
  return { statement, row, friendsSeeChange };
}

/** The build and its owner's user id, or the response refusing them. */
async function checkOwnership(
  buildId: string, user: AuthenticatedUser, env: Env
): Promise<{ build: BuildRow; ownerUserId: string } | Response> {
  const build = await getBuildById(env.DB, buildId);
  if (!build) {
    return errorResponse(404, 'Build not found.');
  }
  const ownerUserId = await resolveOwnerUserId(env, user);
  if (!ownerUserId || build.owner_user_id !== ownerUserId) {
    return errorResponse(403, 'You do not own this build.');
  }
  return { build, ownerUserId };
}

function throttled(retryAfterMs: number): Response {
  return jsonResponse(
    { error: 'Saving too fast. Please try again shortly.', retryAfterMs },
    { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } }
  );
}

// Built through a Map so a key like "__proto__" stays an ordinary key
// rather than reaching the object's prototype.
function mergePatch<T>(stored: Record<string, T>, patch: Map<string, T | null>): Record<string, T> {
  const merged = new Map(Object.entries(stored));
  for (const [key, value] of patch) {
    if (value === null) {
      merged.delete(key);
    } else {
      merged.set(key, value);
    }
  }
  return Object.fromEntries(merged);
}

/** A parsed request body as a ProgressPut; null when invalid. */
export function parseProgressPut(body: unknown): ProgressPut | null {
  if (!isPlainObject(body)) {
    return null;
  }

  const patch = parseKeyed(body['patch'], MAX_ENTRIES, (value): value is 0 | 1 | null => value === 0 || value === 1 || value === null);
  const picksPatch = parseKeyed(body['picksPatch'], MAX_PICKS, (value): value is string[] | null => value === null || isQuestList(value));
  if (!patch || !picksPatch) {
    return null;
  }

  const order = parseOrder(body['order']);
  if (order === false) {
    return null;
  }

  const { needed, route } = body;
  if (needed === undefined && route === undefined) {
    return { patch, picksPatch, published: null, order };
  }
  if (!Array.isArray(needed) || needed.length > MAX_ENTRIES || !needed.every(isKey)) {
    return null;
  }
  const routeMap = parseKeyed(route, MAX_ENTRIES, isQuestList);
  if (!routeMap || route === undefined) {
    return null;
  }
  return { patch, picksPatch, published: { needed, route: Object.fromEntries(routeMap) }, order };
}

/** A route order, null (clear it) or undefined (leave it); false when invalid. */
function parseOrder(value: unknown): RouteOrder | null | undefined | false {
  if (value === undefined || value === null) {
    return value;
  }
  if (!isPlainObject(value) || Object.keys(value).some(key => key !== 'packs' && key !== 'quests')) {
    return false;
  }
  const { packs, quests } = value;
  // A pack may be '': the quests in no pack.
  const isPack = (pack: unknown) => typeof pack === 'string' && pack.length <= MAX_KEY_LENGTH;
  if (!Array.isArray(packs) || packs.length > MAX_PICKS || !packs.every(isPack)) {
    return false;
  }
  if (!Array.isArray(quests) || quests.length > MAX_ENTRIES || !quests.every(isKey)) {
    return false;
  }
  return { packs, quests };
}

/** An object of valid keys to valid values, absent meaning empty; null when invalid. */
function parseKeyed<T>(value: unknown, maxKeys: number, isValue: (v: unknown) => v is T): Map<string, T> | null {
  if (value === undefined) {
    return new Map();
  }
  if (!isPlainObject(value)) {
    return null;
  }
  const entries = Object.entries(value);
  if (entries.length > maxKeys || !entries.every(([key, v]) => isKey(key) && isValue(v))) {
    return null;
  }
  return new Map(entries as [string, T][]);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isKey(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_KEY_LENGTH;
}

function isQuestList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(isKey);
}
