import { AuthenticatedUser, Env } from '../auth';
import {
  BuildProgressRow,
  countProgressWritesOnDay,
  getBuildById,
  getBuildProgress,
  getPublicBuildProgressByShortId,
  upsertBuildProgressIfUnchanged
} from '../db';
import { errorResponse, jsonResponse } from '../http';
import sharedConstants from '../../../shared/constants.json';
import { resolveOwnerUserId } from './builds';

// Shopping-list progress for saved builds (see migrations/0006). None of
// these routes go through checkMutationRateLimit or touch KV: that limiter
// costs a KV write per request, and the free tier's 1,000 KV writes a day
// would run out within about a hundred ticking sessions. Writes are
// throttled in D1 instead - see handlePutProgress.

// A friend refreshing a live link sees an owner's tick within this long.
// Short enough to feel live, long enough that a link pasted into a busy
// Discord channel doesn't cost a Worker request per click.
const PUBLIC_PROGRESS_MAX_AGE_SECONDS = 15;

// Sizing, from the longest names in data/: a key is up to about 230
// characters (slot, a 59-character item, a craftable, a 110-character
// selection), and a big build lists a few hundred things. These caps sit
// well above that; they only stop a runaway or scripted client.
const MAX_ENTRIES = sharedConstants.maxProgressEntries;
const MAX_PICKS = sharedConstants.maxProgressPicks;
const MAX_KEY_LENGTH = sharedConstants.maxProgressKeyLength;
// The four stored JSON columns together, and the request body, counted in
// string length (UTF-16 units) - close enough to bytes for a ceiling.
const MAX_BYTES = sharedConstants.maxProgressBytes;
const MIN_WRITE_INTERVAL_MS = sharedConstants.progressMinWriteIntervalMs;
const MAX_WRITES_PER_USER_PER_DAY = sharedConstants.maxProgressWritesPerUserPerDay;

type QuestLists = Record<string, string[]>;

/** The order the owner arranged the route in (see migrations/0007). */
interface RouteOrder {
  packs: string[];
  quests: string[];
}

interface ProgressPut {
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

/**
 * The public half of a build's progress: what's still needed, where the
 * owner's list sends them for it, and the order it's in. Never the owner's
 * ticks or picks. 404s
 * exactly where GET /api/build/:shortId does for builds - private ones are
 * indistinguishable from missing ones - and for short links, which are
 * snapshots with no progress of their own.
 */
export async function handleGetPublicProgress(shortId: string, env: Env): Promise<Response> {
  const row = await getPublicBuildProgressByShortId(env.DB, shortId);
  if (!row) {
    return errorResponse(404, 'No build found for that link.');
  }
  // needed is null, not [], when the owner has never synced a list: a
  // friend sees "nothing shared yet" rather than "nothing left to get".
  return jsonResponse(
    {
      needed: row.needed === null ? null : JSON.parse(row.needed) as string[],
      route: row.route === null ? {} : JSON.parse(row.route) as QuestLists,
      order: orderOf(row.route_order),
      updatedAt: row.updated_at
    },
    { headers: { 'Cache-Control': `public, max-age=${PUBLIC_PROGRESS_MAX_AGE_SECONDS}` } }
  );
}

/** The owner's whole progress doc. An empty one when nothing is stored yet. */
export async function handleGetOwnProgress(buildId: string, user: AuthenticatedUser, env: Env): Promise<Response> {
  const denied = await checkOwnership(buildId, user, env);
  if (typeof denied !== 'string') {
    return denied;
  }
  return jsonResponse(toOwnerProgress(await getBuildProgress(env.DB, buildId)));
}

/**
 * Merges tick and pick patches into the stored doc and, when given,
 * replaces what friends see and the route's order. Body: {patch?,
 * picksPatch?, needed?, route?, order?}, needed and route together or not
 * at all, order null to clear it. Answers with the merged doc.
 *
 * Throttled per build to one write every MIN_WRITE_INTERVAL_MS (429 with
 * retryAfterMs) and capped per user per UTC day (429 with
 * dailyCapReached). The client debounces well inside both, so either
 * means something is wrong with it or someone is scripting the API. Never
 * touches builds.updated_at or KV.
 */
export async function handlePutProgress(request: Request, buildId: string, user: AuthenticatedUser, env: Env): Promise<Response> {
  const ownerUserId = await checkOwnership(buildId, user, env);
  if (typeof ownerUserId !== 'string') {
    return ownerUserId;
  }

  const text = await request.text();
  if (text.length > MAX_BYTES) {
    return errorResponse(413, 'That shopping list is too big to save.');
  }
  const put = parseProgressPut(text);
  if (!put) {
    return errorResponse(400, 'Invalid shopping list progress.');
  }

  const existing = await getBuildProgress(env.DB, buildId);
  const now = Date.now();
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
    build_id: buildId,
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

  const written = await upsertBuildProgressIfUnchanged(env.DB, row, {
    baseUpdatedAt: existing?.updated_at ?? null,
    notAfter: new Date(now - MIN_WRITE_INTERVAL_MS).toISOString()
  });
  if (!written) {
    // Another write landed between our read and this one.
    return throttled(MIN_WRITE_INTERVAL_MS);
  }
  return jsonResponse(toOwnerProgress({ ...row, writes_today: 0 }));
}

/** The owner's user id, or the response refusing them. */
async function checkOwnership(buildId: string, user: AuthenticatedUser, env: Env): Promise<string | Response> {
  const build = await getBuildById(env.DB, buildId);
  if (!build) {
    return errorResponse(404, 'Build not found.');
  }
  const ownerUserId = await resolveOwnerUserId(env, user);
  if (!ownerUserId || build.owner_user_id !== ownerUserId) {
    return errorResponse(403, 'You do not own this build.');
  }
  return ownerUserId;
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

function parseProgressPut(text: string): ProgressPut | null {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
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
