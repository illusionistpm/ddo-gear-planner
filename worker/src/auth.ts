import { createRemoteJWKSet, jwtVerify } from 'jose';

export interface Env {
  DB: D1Database;
  BUILD_CACHE: KVNamespace;
  AUTH0_DOMAIN: string;
  AUTH0_AUDIENCE: string;
  // Comma-separated - see cors.ts for why this isn't a single origin.
  ALLOWED_ORIGINS: string;
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

// AUTH0_DOMAIN is meant to be a bare host (e.g. "your-tenant.us.auth0.com"),
// but it's an easy copy-paste mistake to paste the full origin instead
// (Auth0's own dashboard shows it both ways in different places). Stripping
// an accidental scheme here means that mistake fails loudly in local
// testing rather than silently breaking JWKS resolution in a way that's
// only noticed when real login stops working.
function normalizeDomain(domain: string): string {
  return domain.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

// AUTH0_AUDIENCE (e.g. "https://api.ddo-gear-planner.com") doubles as the
// namespace prefix for the custom claims the login Action adds - stripping a
// trailing slash keeps `${namespace}/email` from ending up with "//".
function normalizeAudience(audience: string): string {
  return audience.replace(/\/+$/, '');
}

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
    const domain = normalizeDomain(env.AUTH0_DOMAIN);
    const jwks = getJwks(domain);
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `https://${domain}/`,
      audience: env.AUTH0_AUDIENCE
    });

    if (typeof payload.sub !== 'string') {
      return null;
    }

    // Auth0 access tokens for a custom API audience carry only registered
    // claims (sub/iss/aud/scope/...) by default - email and name live on the
    // ID token, not this one. Getting them onto the access token requires an
    // Auth0 Action (see SETUP.md) that adds them as namespaced custom claims,
    // since Auth0 silently drops any non-namespaced custom claim.
    const claimNamespace = normalizeAudience(env.AUTH0_AUDIENCE);
    const email = payload[`${claimNamespace}/email`];
    const name = payload[`${claimNamespace}/name`];

    return {
      sub: payload.sub,
      email: typeof email === 'string' ? email : undefined,
      name: typeof name === 'string' ? name : undefined
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
