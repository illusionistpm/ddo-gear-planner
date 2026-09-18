import { AuthenticatedUser, Env } from '../auth';
import {
  BuildRow,
  countBuildsByOwner,
  deleteBuild,
  ensureUser,
  getBuildById,
  getBuildByShortId,
  getShortIdKind,
  getShortLinkByShortId,
  getUserIdByAuth0Sub,
  listBuildSummariesByOwner,
  reserveAndInsertBuildIfUnderLimit,
  updateBuild,
  BuildSummaryRow
} from '../db';
import { errorResponse, jsonResponse } from '../http';
import { withUniqueShortId } from '../shortId';
import sharedConstants from '../../../shared/constants.json';

// Long enough to be descriptive, short enough to stay sane in a list UI, a
// page <title>, and the derived slug. Mirrors the client-side validation in
// save-build-dialog.component.ts (both read shared/constants.json, so
// there's nothing to keep in sync by hand) - client-side alone isn't a
// real guarantee since this API is callable directly.
export const MAX_NAME_LENGTH = sharedConstants.maxNameLength;

// The Worker treats `blob` as opaque (it never parses it - see
// build-url-codec.service.ts for why that matters for forward-compat), so
// this is just a sanity ceiling against accidental or malicious oversized
// writes. A real compact build payload should be well under 1-2 KB.
const MAX_BLOB_LENGTH = sharedConstants.maxBlobLength;

// A generous ceiling, not a real storage/cost constraint at this scale -
// mainly a backstop against a runaway client (or a scripted abuse of the
// public API) piling up unbounded rows for one owner.
export const MAX_BUILDS_PER_USER = sharedConstants.maxBuildsPerUser;

// A genuine cross-table shortId collision (short_ids.short_id, or the
// legacy builds.short_id column UNIQUE as a redundant second guard) is
// what withUniqueShortId should retry with a fresh id. A duplicate-name
// violation (below) also reads as "UNIQUE constraint failed" but retrying
// with a different shortId would never fix it, so this pattern has to be
// narrow enough to exclude it - see handleCreateBuild.
const SHORT_ID_COLLISION_PATTERN = /UNIQUE constraint failed:\s*(short_ids\.short_id|builds\.short_id)/i;

// Matches the exact message SQLite gives for migrations/0004's composite
// UNIQUE index - verified against a real D1 instance (see the plan) rather
// than assumed, since the qualifying column list's exact format
// ("table.col1, table.col2") isn't otherwise documented.
const DUPLICATE_NAME_PATTERN = /UNIQUE constraint failed:\s*builds\.owner_user_id/i;

function isShortIdCollision(err: unknown): boolean {
  return err instanceof Error && SHORT_ID_COLLISION_PATTERN.test(err.message);
}

function isDuplicateNameViolation(err: unknown): boolean {
  return err instanceof Error && DUPLICATE_NAME_PATTERN.test(err.message);
}

function buildCacheKey(shortId: string): string {
  return `build:${shortId}`;
}

// Own namespace, kept separate from buildCacheKey's - this only separates
// the *cache*, though; the shortId lookup itself is unambiguous because of
// the short_ids allocator (see migrations/0003 and getShortIdKind), not
// because of this cache-key split.
function shortLinkCacheKey(shortId: string): string {
  return `shortlink:${shortId}`;
}

export function validateName(name: unknown): string | null {
  if (typeof name !== 'string') {
    return null;
  }
  const trimmed = name.trim();
  return trimmed && trimmed.length <= MAX_NAME_LENGTH ? trimmed : null;
}

export function validateBlob(blob: unknown): string | null {
  return typeof blob === 'string' && blob.length > 0 && blob.length <= MAX_BLOB_LENGTH ? blob : null;
}

function toBuildResponse(row: BuildRow) {
  return {
    id: row.id,
    shortId: row.short_id,
    name: row.name,
    blob: row.blob,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// No `blob` - see BuildSummaryRow's comment. listMine's callers (My Builds,
// the duplicate-name checks, ownership confirmation) never read it.
function toBuildSummaryResponse(row: BuildSummaryRow) {
  return {
    id: row.id,
    shortId: row.short_id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// Insert-if-missing, no write when the row already exists (see
// db.ts's ensureUser) - reserved for create, the one build-mutating route
// where the caller might genuinely be hitting the API for the very first
// time (the real client always calls GET /api/users/me on login first,
// which does the full upsertUser - see auth.service.ts - but this API is
// callable directly). list/update/delete use the plain read-only lookup
// below instead, since a build can only exist for a user who's already
// been ensured at least once.
async function resolveOwnerUserIdForCreate(env: Env, user: AuthenticatedUser): Promise<string> {
  return ensureUser(env.DB, {
    auth0Sub: user.sub,
    email: user.email ?? null,
    emailVerified: user.emailVerified ?? false,
    displayName: user.name ?? null
  });
}

export async function handleCreateBuild(request: Request, user: AuthenticatedUser, env: Env): Promise<Response> {
  const body = await request.json().catch(() => null) as { name?: unknown; blob?: unknown } | null;
  const name = validateName(body?.name);
  const blob = validateBlob(body?.blob);
  if (!name || !blob) {
    return errorResponse(400, `A build needs a name (1-${MAX_NAME_LENGTH} chars) and a blob.`);
  }

  const ownerUserId = await resolveOwnerUserIdForCreate(env, user);

  // Fast pre-check: rejects the common (non-racy) over-limit case without
  // ever touching the shortId allocator. Not what actually enforces the
  // cap, though - reserveAndInsertBuildIfUnderLimit's own live re-check
  // (below) is, since two near-simultaneous creates could otherwise both
  // pass this check before either finishes inserting.
  const existingCount = await countBuildsByOwner(env.DB, ownerUserId);
  if (existingCount >= MAX_BUILDS_PER_USER) {
    return errorResponse(403, `You've reached the limit of ${MAX_BUILDS_PER_USER} saved builds. Delete an existing build to save a new one.`);
  }

  const now = new Date().toISOString();

  try {
    const attempt = await withUniqueShortId(
      async shortId => {
        const build: BuildRow = {
          id: crypto.randomUUID(),
          short_id: shortId,
          owner_user_id: ownerUserId,
          name,
          blob,
          visibility: 'public',
          created_at: now,
          updated_at: now
        };
        const inserted = await reserveAndInsertBuildIfUnderLimit(env.DB, build, { ownerUserId, max: MAX_BUILDS_PER_USER });
        return { inserted, build };
      },
      { isUniqueConstraintError: isShortIdCollision }
    );

    if (!attempt.inserted) {
      // Lost the race against the fast pre-check above - a second create
      // from the same account landed in between. Same message either way;
      // the viewer has no reason to see this as a different error.
      return errorResponse(403, `You've reached the limit of ${MAX_BUILDS_PER_USER} saved builds. Delete an existing build to save a new one.`);
    }
    return jsonResponse(toBuildResponse(attempt.build), { status: 201 });
  } catch (err) {
    if (isDuplicateNameViolation(err)) {
      return errorResponse(409, `You already have a build named "${name}". Choose a different name.`);
    }
    throw err;
  }
}

export async function handleListMine(user: AuthenticatedUser, env: Env): Promise<Response> {
  const ownerUserId = await getUserIdByAuth0Sub(env.DB, user.sub);
  if (!ownerUserId) {
    // No user row at all yet (see resolveOwnerUserIdForCreate's comment) -
    // by construction, nothing they could have saved either.
    return jsonResponse([]);
  }
  const builds = await listBuildSummariesByOwner(env.DB, ownerUserId);
  return jsonResponse(builds.map(toBuildSummaryResponse));
}

export async function handleGetByShortId(shortId: string, env: Env): Promise<Response> {
  const cacheKey = buildCacheKey(shortId);
  const cached = await env.BUILD_CACHE.get<{ name: string; blob: string }>(cacheKey, 'json');
  if (cached) {
    return jsonResponse(cached);
  }

  const shortLinkCache = shortLinkCacheKey(shortId);
  const cachedShortLink = await env.BUILD_CACHE.get<{ name: string; blob: string }>(shortLinkCache, 'json');
  if (cachedShortLink) {
    return jsonResponse(cachedShortLink);
  }

  // The allocator (see migrations/0003) says which table this id actually
  // belongs to, if either - a single lookup instead of trying builds then
  // falling back to shortlinks, which is also what let the two silently
  // shadow each other before the allocator existed.
  const kind = await getShortIdKind(env.DB, shortId);

  if (kind === 'build') {
    const row = await getBuildByShortId(env.DB, shortId);
    // 404, not a distinct "this build is private" message - a private
    // build should be indistinguishable from a nonexistent one to anyone
    // but its owner (who reaches it through listMine/its own saved URL,
    // not this public lookup).
    if (!row || row.visibility === 'private') {
      return errorResponse(404, 'No build found for that link.');
    }
    const payload = { name: row.name, blob: row.blob };
    await env.BUILD_CACHE.put(cacheKey, JSON.stringify(payload));
    return jsonResponse(payload);
  }

  if (kind === 'shortlink') {
    const shortLink = await getShortLinkByShortId(env.DB, shortId);
    if (!shortLink) {
      return errorResponse(404, 'No build found for that link.');
    }
    const payload = JSON.parse(shortLink.blob) as { name: string; blob: string };
    await env.BUILD_CACHE.put(shortLinkCache, JSON.stringify(payload));
    return jsonResponse(payload);
  }

  return errorResponse(404, 'No build found for that link.');
}

export async function handleUpdateBuild(
  request: Request,
  id: string,
  user: AuthenticatedUser,
  env: Env
): Promise<Response> {
  const row = await getBuildById(env.DB, id);
  if (!row) {
    return errorResponse(404, 'Build not found.');
  }
  const ownerUserId = await getUserIdByAuth0Sub(env.DB, user.sub);
  if (!ownerUserId || row.owner_user_id !== ownerUserId) {
    return errorResponse(403, 'You do not own this build.');
  }

  const body = await request.json().catch(() => null) as { name?: unknown; blob?: unknown } | null;
  const fields: { name?: string; blob?: string } = {};

  if (body?.name !== undefined) {
    const name = validateName(body.name);
    if (!name) {
      return errorResponse(400, `Invalid name (1-${MAX_NAME_LENGTH} chars).`);
    }
    fields.name = name;
  }
  if (body?.blob !== undefined) {
    const blob = validateBlob(body.blob);
    if (!blob) {
      return errorResponse(400, 'Invalid blob.');
    }
    fields.blob = blob;
  }

  try {
    await updateBuild(env.DB, id, fields);
  } catch (err) {
    if (isDuplicateNameViolation(err)) {
      return errorResponse(409, `You already have a build named "${fields.name}". Choose a different name.`);
    }
    throw err;
  }
  // Write-through: invalidate rather than pre-populate, since the next
  // GET /api/build/:shortId will repopulate it and this keeps the update
  // path from needing to duplicate the cache payload shape.
  await env.BUILD_CACHE.delete(buildCacheKey(row.short_id));

  const updated = await getBuildById(env.DB, id);
  return jsonResponse(toBuildResponse(updated as BuildRow));
}

export async function handleDeleteBuild(id: string, user: AuthenticatedUser, env: Env): Promise<Response> {
  const row = await getBuildById(env.DB, id);
  if (!row) {
    return errorResponse(404, 'Build not found.');
  }
  const ownerUserId = await getUserIdByAuth0Sub(env.DB, user.sub);
  if (!ownerUserId || row.owner_user_id !== ownerUserId) {
    return errorResponse(403, 'You do not own this build.');
  }

  await deleteBuild(env.DB, id);
  await env.BUILD_CACHE.delete(buildCacheKey(row.short_id));
  return new Response(null, { status: 204 });
}
