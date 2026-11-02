import { Env } from '../auth';
import { getPublicBuildProgressByShortId } from '../db';
import { errorResponse, jsonResponse } from '../http';

// Shopping-list progress for saved builds (see migrations/0006). None of
// these routes go through checkMutationRateLimit or touch KV: that limiter
// costs a KV write per request, and the free tier's 1,000 KV writes a day
// would run out within about a hundred ticking sessions. Writes are
// throttled in D1 instead.

// A friend refreshing a live link sees an owner's tick within this long.
// Short enough to feel live, long enough that a link pasted into a busy
// Discord channel doesn't cost a Worker request per click.
const PUBLIC_PROGRESS_MAX_AGE_SECONDS = 15;

/**
 * The public half of a build's progress: what's still needed and where the
 * owner's list sends them for it. Never the owner's ticks or picks. 404s
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
      route: row.route === null ? {} : JSON.parse(row.route) as Record<string, string[]>,
      updatedAt: row.updated_at
    },
    { headers: { 'Cache-Control': `public, max-age=${PUBLIC_PROGRESS_MAX_AGE_SECONDS}` } }
  );
}
