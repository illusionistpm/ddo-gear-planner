import { AuthenticatedUser, Env } from '../auth';
import { getShortLinkByStoredBlob, getUserIdByAuth0Sub, reserveAndInsertShortLink, ShortLinkRow } from '../db';
import { jsonResponse, errorResponse } from '../http';
import { withUniqueShortId } from '../shortId';
import { MAX_NAME_LENGTH, validateBlob, validateName } from './builds';

// Immutable, ownerless-in-the-sense-that-anyone-can-mint-one share
// snapshots - see the plan/migration comment. `stored` is the JSON
// envelope {"name", "blob"} written to the single UNIQUE `blob` column, so
// "same gear AND same name" dedupes to one row without needing a separate
// name column + NULL sentinel handling. `creatorUserId` is attribution only
// (see migrations/0003) - it doesn't gate access or ownership the way
// builds.owner_user_id does; this stays a public, unauthenticated-readable
// snapshot regardless of who created it.
async function mintShortLink(env: Env, stored: string, creatorUserId: string | null): Promise<ShortLinkRow> {
  try {
    return await withUniqueShortId(
      async shortId => {
        const row: ShortLinkRow = { short_id: shortId, blob: stored, creator_user_id: creatorUserId, created_at: new Date().toISOString() };
        await reserveAndInsertShortLink(env.DB, row);
        return row;
      },
      // Only a short_id collision (now via the shared short_ids allocator -
      // see migrations/0003 and db.ts's reserveAndInsertShortLink) is worth
      // retrying with a fresh id - a `blob` conflict (a concurrent
      // duplicate share racing the dedup SELECT below) would just fail
      // again with any shortId, so let it throw immediately and resolve it
      // by re-fetching the winning row.
      { isUniqueConstraintError: err => err instanceof Error && /UNIQUE constraint failed:\s*short_ids\.short_id/i.test(err.message) }
    );
  } catch (err) {
    if (err instanceof Error && /UNIQUE constraint failed/i.test(err.message)) {
      const existing = await getShortLinkByStoredBlob(env.DB, stored);
      if (existing) {
        return existing;
      }
    }
    throw err;
  }
}

export async function handleCreateShortLink(request: Request, user: AuthenticatedUser, env: Env): Promise<Response> {
  const body = await request.json().catch(() => null) as { name?: unknown; blob?: unknown } | null;
  const blob = validateBlob(body?.blob);
  if (!blob) {
    return errorResponse(400, 'A blob is required.');
  }

  let name = '';
  if (body?.name !== undefined && body?.name !== null && body.name !== '') {
    const validated = validateName(body.name);
    if (!validated) {
      return errorResponse(400, `Invalid name (1-${MAX_NAME_LENGTH} chars).`);
    }
    name = validated;
  }

  const stored = JSON.stringify({ name, blob });

  const existing = await getShortLinkByStoredBlob(env.DB, stored);
  if (existing) {
    return jsonResponse({ shortId: existing.short_id }, { status: 200 });
  }

  // Best-effort attribution, not a hard requirement (see mintShortLink's
  // comment) - a signed-in caller with no user row yet (only reachable by
  // calling this API directly, bypassing the client's own GET
  // /api/users/me-on-login) still gets to create the link, just without a
  // creator recorded.
  const creatorUserId = await getUserIdByAuth0Sub(env.DB, user.sub);
  const row = await mintShortLink(env, stored, creatorUserId);
  return jsonResponse({ shortId: row.short_id }, { status: 201 });
}
