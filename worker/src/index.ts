import { AuthenticatedUser, Env, requireAuth } from './auth';
import { parseAllowedOrigins, resolveAllowedOrigin } from './cors';
import { errorResponse } from './http';
import { getClientIp, isRateLimited } from './rateLimit';
import { handleGetMe } from './routes/users';
import {
  handleCreateBuild,
  handleDeleteBuild,
  handleGetByShortId,
  handleListMine,
  handleUpdateBuild
} from './routes/builds';
import { handleGroupLive, handleLive, Waiter } from './live';
import {
  handleAddGroupBuild,
  handleCreateGroup,
  handleDeleteGroup,
  handleGetGroupMe,
  handleListMyGroups,
  handlePutGroupRoute,
  handleRemoveGroupBuild,
  handleRenameGroup,
  handleRenameGroupBuild,
  handleRotateGroupInvite
} from './routes/groups';
import { handleGetOwnProgress, handlePutProgress } from './routes/progress';
import { handleCreateShortLink } from './routes/shortlinks';

export { GroupRoom } from './group-room';
export { ProgressRoom } from './progress-room';

const BUILD_SHORT_ID_PATH = /^\/api\/build\/([^/]+)$/;
const BUILD_SHORT_ID_LIVE_PATH = /^\/api\/build\/([^/]+)\/live$/;
const BUILD_ID_PATH = /^\/api\/builds\/([^/]+)$/;
const BUILD_ID_PROGRESS_PATH = /^\/api\/builds\/([^/]+)\/progress$/;
const GROUP_PATH = /^\/api\/groups\/([^/]+)$/;
const GROUP_SUB_PATH = /^\/api\/groups\/([^/]+)\/(me|live|builds|route|invite)$/;
const GROUP_BUILD_PATH = /^\/api\/groups\/([^/]+)\/builds\/([^/]+)$/;
const PREFLIGHT_MAX_AGE_SECONDS = 86400;

function corsHeaders(request: Request, env: Env): HeadersInit {
  const allowedOrigin = resolveAllowedOrigin(request.headers.get('Origin'), parseAllowedOrigins(env.ALLOWED_ORIGINS));
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Vary': 'Origin'
  };
}

function withCors(response: Response, request: Request, env: Env): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(request, env))) {
    headers.set(key, value);
  }
  return new Response(response.body, { status: response.status, headers });
}

export default {
  // ctx is optional only for the tests, which call this without one.
  async fetch(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    // A Bearer Authorization header on a cross-origin request triggers a
    // browser preflight OPTIONS - this must be short-circuited explicitly
    // with the CORS headers rather than falling through to the router,
    // which would 404 it. curl/`wrangler dev` testing won't catch a missing
    // case here since curl doesn't send preflights; this needs verifying
    // from an actual browser.
    if (request.method === 'OPTIONS') {
      // Without a max-age every authenticated request pays a preflight
      // round trip - two Worker requests instead of one. Browsers clamp the
      // value (Chrome to 2 hours), so a day is just "as long as allowed".
      const headers = new Headers(corsHeaders(request, env));
      headers.set('Access-Control-Max-Age', String(PREFLIGHT_MAX_AGE_SECONDS));
      return new Response(null, { status: 204, headers });
    }

    // A WebSocket upgrade's 101 can't be copied into a new Response the way
    // withCors does, and CORS doesn't cover WebSockets anyway: handleLive
    // checks the Origin itself.
    const { pathname } = new URL(request.url);
    const liveMatch = BUILD_SHORT_ID_LIVE_PATH.exec(pathname);
    if (request.method === 'GET' && liveMatch) {
      return handleLive(request, liveMatch[1], env);
    }
    const groupLiveMatch = GROUP_SUB_PATH.exec(pathname);
    if (request.method === 'GET' && groupLiveMatch?.[2] === 'live') {
      return handleGroupLive(request, groupLiveMatch[1], env);
    }

    const waiter: Waiter = ctx ?? { waitUntil: () => undefined };
    const response = await route(request, env, waiter);
    return withCors(response, request, env);
  }
};

async function route(request: Request, env: Env, waiter: Waiter): Promise<Response> {
  const { pathname } = new URL(request.url);
  const { method } = request;

  if (method === 'GET' && pathname === '/api/users/me') {
    const authResult = await requireAuth(request, env);
    if (authResult instanceof Response) return authResult;
    return handleGetMe(authResult, env);
  }

  if (method === 'POST' && pathname === '/api/builds') {
    const rateLimitResponse = await checkMutationRateLimit(request, env);
    if (rateLimitResponse) return rateLimitResponse;
    const authResult = await requireAuth(request, env);
    if (authResult instanceof Response) return authResult;
    return handleCreateBuild(request, authResult, env);
  }

  if (method === 'POST' && pathname === '/api/shortlinks') {
    const rateLimitResponse = await checkMutationRateLimit(request, env);
    if (rateLimitResponse) return rateLimitResponse;
    const authResult = await requireAuth(request, env);
    if (authResult instanceof Response) return authResult;
    return handleCreateShortLink(request, authResult, env);
  }

  if (method === 'GET' && pathname === '/api/builds/mine') {
    const authResult = await requireAuth(request, env);
    if (authResult instanceof Response) return authResult;
    return handleListMine(authResult, env);
  }

  const shortIdMatch = BUILD_SHORT_ID_PATH.exec(pathname);
  if (method === 'GET' && shortIdMatch) {
    return handleGetByShortId(shortIdMatch[1], env);
  }

  // Not behind checkMutationRateLimit: it costs a KV write per request, and
  // progress writes are throttled in D1 instead - see routes/progress.ts.
  const progressBuildIdMatch = BUILD_ID_PROGRESS_PATH.exec(pathname);
  if (progressBuildIdMatch && (method === 'GET' || method === 'PUT')) {
    const authResult = await requireAuth(request, env);
    if (authResult instanceof Response) return authResult;
    return method === 'GET'
      ? handleGetOwnProgress(progressBuildIdMatch[1], authResult, env)
      : handlePutProgress(request, progressBuildIdMatch[1], authResult, env, waiter);
  }

  const buildIdMatch = BUILD_ID_PATH.exec(pathname);
  if (buildIdMatch) {
    if (method === 'PUT') {
      const rateLimitResponse = await checkMutationRateLimit(request, env);
      if (rateLimitResponse) return rateLimitResponse;
      const authResult = await requireAuth(request, env);
      if (authResult instanceof Response) return authResult;
      return handleUpdateBuild(request, buildIdMatch[1], authResult, env, waiter);
    }
    if (method === 'DELETE') {
      const rateLimitResponse = await checkMutationRateLimit(request, env);
      if (rateLimitResponse) return rateLimitResponse;
      const authResult = await requireAuth(request, env);
      if (authResult instanceof Response) return authResult;
      return handleDeleteBuild(buildIdMatch[1], authResult, env, waiter);
    }
  }

  const groupResponse = await routeGroups(request, env, waiter);
  if (groupResponse) {
    return groupResponse;
  }

  return errorResponse(404, 'Not found.');
}

// Group runs - routes/groups.ts. Changing who's in a group goes through
// checkMutationRateLimit, as changing a build does; the shared route, which
// the host may arrange a step at a time, is throttled in D1 instead, as a
// build's progress is. The live socket is routed before CORS, in fetch().
async function routeGroups(request: Request, env: Env, waiter: Waiter): Promise<Response | null> {
  const url = new URL(request.url);
  const { pathname } = url;
  const { method } = request;
  const token = url.searchParams.get('t');

  const authed = async (handle: (user: AuthenticatedUser) => Promise<Response>, rateLimited: boolean): Promise<Response> => {
    if (rateLimited) {
      const rateLimitResponse = await checkMutationRateLimit(request, env);
      if (rateLimitResponse) return rateLimitResponse;
    }
    const authResult = await requireAuth(request, env);
    if (authResult instanceof Response) return authResult;
    return handle(authResult);
  };

  if (method === 'POST' && pathname === '/api/groups') {
    return authed(user => handleCreateGroup(request, user, env), true);
  }
  if (method === 'GET' && pathname === '/api/groups/mine') {
    return authed(user => handleListMyGroups(user, env), false);
  }

  const buildMatch = GROUP_BUILD_PATH.exec(pathname);
  if (buildMatch && method === 'PATCH') {
    return authed(user => handleRenameGroupBuild(request, buildMatch[1], buildMatch[2], user, env, waiter), true);
  }
  if (buildMatch && method === 'DELETE') {
    return authed(user => handleRemoveGroupBuild(buildMatch[1], buildMatch[2], user, env, waiter), true);
  }

  const subMatch = GROUP_SUB_PATH.exec(pathname);
  if (subMatch) {
    const [, shortId, part] = subMatch;
    if (method === 'GET' && part === 'me') {
      return authed(user => handleGetGroupMe(shortId, token, user, env), false);
    }
    if (method === 'POST' && part === 'builds') {
      return authed(user => handleAddGroupBuild(request, shortId, token, user, env, waiter), true);
    }
    if (method === 'PUT' && part === 'route') {
      return authed(user => handlePutGroupRoute(request, shortId, user, env, waiter), false);
    }
    if (method === 'POST' && part === 'invite') {
      return authed(user => handleRotateGroupInvite(shortId, user, env, waiter), true);
    }
  }

  const groupMatch = GROUP_PATH.exec(pathname);
  if (groupMatch && groupMatch[1] !== 'mine' && method === 'DELETE') {
    return authed(user => handleDeleteGroup(groupMatch[1], user, env, waiter), true);
  }
  if (groupMatch && groupMatch[1] !== 'mine' && method === 'PATCH') {
    return authed(user => handleRenameGroup(request, groupMatch[1], user, env, waiter), true);
  }
  return null;
}

// Checked before requireAuth on the mutating build endpoints (create/update/
// delete) so a flood of requests doesn't also pay the cost of JWKS
// verification for every one of them. See rateLimit.ts for why this exists
// in the Worker rather than as a Cloudflare dashboard rule.
async function checkMutationRateLimit(request: Request, env: Env): Promise<Response | null> {
  const limited = await isRateLimited(env.BUILD_CACHE, getClientIp(request));
  return limited ? errorResponse(429, 'Too many requests. Please slow down and try again shortly.') : null;
}
