import { AuthenticatedUser, Env } from '../auth';
import {
  BuildRow,
  deleteBuild,
  getBuildById,
  getBuildByShortId,
  insertBuild,
  listBuildsByOwner,
  updateBuild,
  upsertUser
} from '../db';
import { errorResponse, jsonResponse } from '../http';
import { withUniqueShortId } from '../shortId';

// Long enough to be descriptive, short enough to stay sane in a list UI, a
// page <title>, and the derived slug. Mirrors the client-side validation in
// save-build-dialog.component.ts - client-side alone isn't a real guarantee
// since this API is callable directly.
const MAX_NAME_LENGTH = 60;

// The Worker treats `blob` as opaque (it never parses it - see
// build-url-codec.service.ts for why that matters for forward-compat), so
// this is just a sanity ceiling against accidental or malicious oversized
// writes. A real compact build payload should be well under 1-2 KB.
const MAX_BLOB_LENGTH = 4096;

function buildCacheKey(shortId: string): string {
  return `build:${shortId}`;
}

function validateName(name: unknown): string | null {
  if (typeof name !== 'string') {
    return null;
  }
  const trimmed = name.trim();
  return trimmed && trimmed.length <= MAX_NAME_LENGTH ? trimmed : null;
}

function validateBlob(blob: unknown): string | null {
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

async function resolveOwnerUserId(env: Env, user: AuthenticatedUser): Promise<string> {
  const row = await upsertUser(env.DB, {
    auth0Sub: user.sub,
    email: user.email ?? null,
    displayName: user.name ?? null
  });
  return row.id;
}

export async function handleCreateBuild(request: Request, user: AuthenticatedUser, env: Env): Promise<Response> {
  const body = await request.json().catch(() => null) as { name?: unknown; blob?: unknown } | null;
  const name = validateName(body?.name);
  const blob = validateBlob(body?.blob);
  if (!name || !blob) {
    return errorResponse(400, `A build needs a name (1-${MAX_NAME_LENGTH} chars) and a blob.`);
  }

  const ownerUserId = await resolveOwnerUserId(env, user);
  const now = new Date().toISOString();

  const row = await withUniqueShortId(async shortId => {
    const build: BuildRow = {
      id: crypto.randomUUID(),
      short_id: shortId,
      owner_user_id: ownerUserId,
      name,
      blob,
      created_at: now,
      updated_at: now
    };
    await insertBuild(env.DB, build);
    return build;
  });

  return jsonResponse(toBuildResponse(row), { status: 201 });
}

export async function handleListMine(user: AuthenticatedUser, env: Env): Promise<Response> {
  const ownerUserId = await resolveOwnerUserId(env, user);
  const builds = await listBuildsByOwner(env.DB, ownerUserId);
  return jsonResponse(builds.map(toBuildResponse));
}

export async function handleGetByShortId(shortId: string, env: Env): Promise<Response> {
  const cacheKey = buildCacheKey(shortId);
  const cached = await env.BUILD_CACHE.get<{ name: string; blob: string }>(cacheKey, 'json');
  if (cached) {
    return jsonResponse(cached);
  }

  const row = await getBuildByShortId(env.DB, shortId);
  if (!row) {
    return errorResponse(404, 'No build found for that link.');
  }

  const payload = { name: row.name, blob: row.blob };
  await env.BUILD_CACHE.put(cacheKey, JSON.stringify(payload));
  return jsonResponse(payload);
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
  const ownerUserId = await resolveOwnerUserId(env, user);
  if (row.owner_user_id !== ownerUserId) {
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

  await updateBuild(env.DB, id, fields);
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
  const ownerUserId = await resolveOwnerUserId(env, user);
  if (row.owner_user_id !== ownerUserId) {
    return errorResponse(403, 'You do not own this build.');
  }

  await deleteBuild(env.DB, id);
  await env.BUILD_CACHE.delete(buildCacheKey(row.short_id));
  return new Response(null, { status: 204 });
}
