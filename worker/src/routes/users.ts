import { AuthenticatedUser, Env } from '../auth';
import { countBuildsByOwner, upsertUser } from '../db';
import { jsonResponse } from '../http';

export async function handleGetMe(user: AuthenticatedUser, env: Env): Promise<Response> {
  const row = await upsertUser(env.DB, {
    auth0Sub: user.sub,
    email: user.email ?? null,
    displayName: user.name ?? null
  });
  // A dedicated COUNT rather than listBuildSummariesByOwner(...).length -
  // this only ever needs the number, not every row.
  const buildCount = await countBuildsByOwner(env.DB, row.id);

  return jsonResponse({
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    buildCount
  });
}
