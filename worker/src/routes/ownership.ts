import { AuthenticatedUser, Env } from '../auth';
import { BuildRow, getBuildById, resolveUserId } from '../db';
import { errorResponse } from '../http';

// The read-only lookup list/update/delete use - see db.ts's resolveUserId
// for why it falls back to the verified email.
export async function resolveOwnerUserId(env: Env, user: AuthenticatedUser): Promise<string | null> {
  return resolveUserId(env.DB, {
    auth0Sub: user.sub,
    email: user.email ?? null,
    emailVerified: user.emailVerified ?? false
  });
}

/**
 * The build and its owner's user id, or the response refusing them: 404
 * for no such build, 403 for anyone but its owner. Every route that
 * changes a build, or reads its owner-only progress, starts here.
 */
export async function checkOwnership(
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
