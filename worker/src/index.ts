import { Env, requireAuth } from './auth';
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
import { handleCreateShortLink } from './routes/shortlinks';

const BUILD_SHORT_ID_PATH = /^\/api\/build\/([^/]+)$/;
const BUILD_ID_PATH = /^\/api\/builds\/([^/]+)$/;

function corsHeaders(request: Request, env: Env): HeadersInit {
  const allowedOrigin = resolveAllowedOrigin(request.headers.get('Origin'), parseAllowedOrigins(env.ALLOWED_ORIGINS));
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
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
  async fetch(request: Request, env: Env): Promise<Response> {
    // A Bearer Authorization header on a cross-origin request triggers a
    // browser preflight OPTIONS - this must be short-circuited explicitly
    // with the CORS headers rather than falling through to the router,
    // which would 404 it. curl/`wrangler dev` testing won't catch a missing
    // case here since curl doesn't send preflights; this needs verifying
    // from an actual browser.
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    const response = await route(request, env);
    return withCors(response, request, env);
  }
};

async function route(request: Request, env: Env): Promise<Response> {
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
    return handleCreateShortLink(request, env);
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

  const buildIdMatch = BUILD_ID_PATH.exec(pathname);
  if (buildIdMatch) {
    if (method === 'PUT') {
      const rateLimitResponse = await checkMutationRateLimit(request, env);
      if (rateLimitResponse) return rateLimitResponse;
      const authResult = await requireAuth(request, env);
      if (authResult instanceof Response) return authResult;
      return handleUpdateBuild(request, buildIdMatch[1], authResult, env);
    }
    if (method === 'DELETE') {
      const rateLimitResponse = await checkMutationRateLimit(request, env);
      if (rateLimitResponse) return rateLimitResponse;
      const authResult = await requireAuth(request, env);
      if (authResult instanceof Response) return authResult;
      return handleDeleteBuild(buildIdMatch[1], authResult, env);
    }
  }

  return errorResponse(404, 'Not found.');
}

// Checked before requireAuth on the mutating build endpoints (create/update/
// delete) so a flood of requests doesn't also pay the cost of JWKS
// verification for every one of them. See rateLimit.ts for why this exists
// in the Worker rather than as a Cloudflare dashboard rule.
async function checkMutationRateLimit(request: Request, env: Env): Promise<Response | null> {
  const limited = await isRateLimited(env.BUILD_CACHE, getClientIp(request));
  return limited ? errorResponse(429, 'Too many requests. Please slow down and try again shortly.') : null;
}
