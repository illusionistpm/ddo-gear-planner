import { createRemoteJWKSet, jwtVerify } from 'jose';

export interface Env {
  DB: D1Database;
  BUILD_CACHE: KVNamespace;
  AUTH0_DOMAIN: string;
  AUTH0_AUDIENCE: string;
  ALLOWED_ORIGIN: string;
}

export interface AuthenticatedUser {
  sub: string;
  email?: string;
  name?: string;
}

type RemoteJWKSet = ReturnType<typeof createRemoteJWKSet>;

// jose's createRemoteJWKSet does its own internal caching/cooldown of the
// actual key material, which is the "JWKS library with its own remote-set
// caching" option from the plan - deliberately not a raw in-memory Map of
// keys here, since Cloudflare doesn't guarantee isolate reuse across
// requests and a plain module-scope cache of the keys themselves would look
// like it works under `wrangler dev` (one isolate, never recycled) while
// silently degrading to a near-every-request JWKS fetch in production.
// Memoizing the JWKSet wrapper object itself is just a minor optimization
// for the case where the isolate *is* reused; when it isn't, this simply
// gets rebuilt and jose fetches fresh, which is correct either way.
let cachedJwks: RemoteJWKSet | null = null;
let cachedJwksDomain: string | null = null;

function getJwks(domain: string): RemoteJWKSet {
  if (!cachedJwks || cachedJwksDomain !== domain) {
    cachedJwks = createRemoteJWKSet(new URL(`https://${domain}/.well-known/jwks.json`));
    cachedJwksDomain = domain;
  }
  return cachedJwks;
}

export async function verifyAuthToken(request: Request, env: Env): Promise<AuthenticatedUser | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.slice('Bearer '.length);

  try {
    const jwks = getJwks(env.AUTH0_DOMAIN);
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `https://${env.AUTH0_DOMAIN}/`,
      audience: env.AUTH0_AUDIENCE
    });

    if (typeof payload.sub !== 'string') {
      return null;
    }

    return {
      sub: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      name: typeof payload.name === 'string' ? payload.name : undefined
    };
  } catch {
    return null;
  }
}

/**
 * Gates a route on a valid Bearer token: returns the authenticated user, or
 * a ready-to-return 401 Response if verification failed. Callers do
 * `const authResult = await requireAuth(request, env); if (authResult
 * instanceof Response) return authResult;` to keep route handlers flat.
 */
export async function requireAuth(request: Request, env: Env): Promise<AuthenticatedUser | Response> {
  const user = await verifyAuthToken(request, env);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  return user;
}
