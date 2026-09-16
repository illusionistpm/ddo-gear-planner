import { Env } from '../auth';
import { getShortLinkByStoredBlob, insertShortLink, ShortLinkRow } from '../db';
import { jsonResponse, errorResponse } from '../http';
import { withUniqueShortId } from '../shortId';
import { MAX_NAME_LENGTH, validateBlob, validateName } from './builds';

// Immutable, ownerless share snapshots - see the plan/migration comment.
// `stored` is the JSON envelope {"name", "blob"} written to the single
// UNIQUE `blob` column, so "same gear AND same name" dedupes to one row
// without needing a separate name column + NULL sentinel handling.
async function mintShortLink(env: Env, stored: string): Promise<ShortLinkRow> {
  try {
    return await withUniqueShortId(
      async shortId => {
        const row: ShortLinkRow = { short_id: shortId, blob: stored, created_at: new Date().toISOString() };
        await insertShortLink(env.DB, row);
        return row;
      },
      // Only a short_id collision is worth retrying with a fresh id - a
      // `blob` conflict (a concurrent duplicate share racing the dedup
      // SELECT below) would just fail again with any shortId, so let it
      // throw immediately and resolve it by re-fetching the winning row.
      { isUniqueConstraintError: err => err instanceof Error && /UNIQUE constraint failed:\s*shortlinks\.short_id/i.test(err.message) }
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

export async function handleCreateShortLink(request: Request, env: Env): Promise<Response> {
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

  const row = await mintShortLink(env, stored);
  return jsonResponse({ shortId: row.short_id }, { status: 201 });
}
