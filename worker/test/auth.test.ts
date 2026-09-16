import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportJWK, generateKeyPair, KeyLike, SignJWT } from 'jose';
import { Env, requireAuth, verifyAuthToken } from '../src/auth';

const KID = 'test-key-1';
const AUDIENCE = 'https://api.ddo-gear-planner.com';

// auth.ts memoizes its JWKS fetcher at module scope, keyed by domain (see
// its own comment on why: it mirrors jose's own remote-set caching rather
// than rolling an in-memory key map, per the plan). That means reusing the
// same fake domain across tests would let one test's generated keypair leak
// into another via that cache. A fresh, unique domain per test sidesteps it
// without needing to reach into the module's private state.
let testCounter = 0;
function uniqueDomain(): string {
  testCounter++;
  return `test-tenant-${testCounter}.us.auth0.com`;
}

function makeEnv(domain: string): Env {
  return {
    DB: {} as unknown as D1Database,
    BUILD_CACHE: {} as unknown as KVNamespace,
    AUTH0_DOMAIN: domain,
    AUTH0_AUDIENCE: AUDIENCE,
    ALLOWED_ORIGINS: 'https://ddo-gear-planner.com'
  };
}

describe('verifyAuthToken', () => {
  let domain: string;
  let privateKey: KeyLike;

  beforeEach(async () => {
    domain = uniqueDomain();
    const { publicKey, privateKey: generatedPrivateKey } = await generateKeyPair('RS256');
    privateKey = generatedPrivateKey;

    const publicJwk = { ...(await exportJWK(publicKey)), kid: KID, alg: 'RS256', use: 'sig' };

    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
      if (url.toString() === `https://${domain}/.well-known/jwks.json`) {
        return new Response(JSON.stringify({ keys: [publicJwk] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function signToken(overrides: {
    audience?: string;
    issuer?: string;
    signingKey?: KeyLike;
    expiresInSeconds?: number;
  } = {}) {
    return new SignJWT({
      [`${AUDIENCE}/email`]: 'user@example.com',
      [`${AUDIENCE}/name`]: 'Test User'
    })
      .setProtectedHeader({ alg: 'RS256', kid: KID })
      .setSubject('google-oauth2|12345')
      .setIssuedAt()
      .setIssuer(overrides.issuer ?? `https://${domain}/`)
      .setAudience(overrides.audience ?? AUDIENCE)
      .setExpirationTime(Math.floor(Date.now() / 1000) + (overrides.expiresInSeconds ?? 3600))
      .sign(overrides.signingKey ?? privateKey);
  }

  it('verifies a valid token and returns the user', async () => {
    const token = await signToken();
    const request = new Request('https://api.ddo-gear-planner.com/api/users/me', {
      headers: { Authorization: `Bearer ${token}` }
    });

    expect(await verifyAuthToken(request, makeEnv(domain))).toEqual({
      sub: 'google-oauth2|12345',
      email: 'user@example.com',
      name: 'Test User'
    });
  });

  it('still verifies correctly if AUTH0_DOMAIN was pasted with a scheme by mistake', async () => {
    // Real incident: Auth0's dashboard shows the domain both bare and as a
    // full origin in different places, and it's an easy copy-paste mistake
    // to include "https://" in wrangler.toml's AUTH0_DOMAIN - which would
    // otherwise silently break JWKS resolution (fetching from a mis-parsed
    // host literally named "https").
    const token = await signToken();
    const request = new Request('https://api.ddo-gear-planner.com/api/users/me', {
      headers: { Authorization: `Bearer ${token}` }
    });

    const envWithSchemePrefixed = makeEnv(`https://${domain}`);

    expect(await verifyAuthToken(request, envWithSchemePrefixed)).toEqual({
      sub: 'google-oauth2|12345',
      email: 'user@example.com',
      name: 'Test User'
    });
  });

  it('returns null when there is no Authorization header', async () => {
    const request = new Request('https://api.ddo-gear-planner.com/api/users/me');
    expect(await verifyAuthToken(request, makeEnv(domain))).toBeNull();
  });

  it('returns null when the Authorization header is not a Bearer token', async () => {
    const request = new Request('https://api.ddo-gear-planner.com/api/users/me', {
      headers: { Authorization: 'Basic dXNlcjpwYXNz' }
    });
    expect(await verifyAuthToken(request, makeEnv(domain))).toBeNull();
  });

  it('returns null for a token with the wrong audience', async () => {
    const token = await signToken({ audience: 'https://wrong-audience.example.com' });
    const request = new Request('https://api.ddo-gear-planner.com/api/users/me', {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(await verifyAuthToken(request, makeEnv(domain))).toBeNull();
  });

  it('returns null for a token with the wrong issuer', async () => {
    const token = await signToken({ issuer: 'https://some-other-tenant.us.auth0.com/' });
    const request = new Request('https://api.ddo-gear-planner.com/api/users/me', {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(await verifyAuthToken(request, makeEnv(domain))).toBeNull();
  });

  it('returns null for an expired token', async () => {
    const token = await signToken({ expiresInSeconds: -10 });
    const request = new Request('https://api.ddo-gear-planner.com/api/users/me', {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(await verifyAuthToken(request, makeEnv(domain))).toBeNull();
  });

  it('returns null for a token signed with a key not in the JWKS', async () => {
    const { privateKey: unrelatedKey } = await generateKeyPair('RS256');
    const token = await signToken({ signingKey: unrelatedKey });
    const request = new Request('https://api.ddo-gear-planner.com/api/users/me', {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(await verifyAuthToken(request, makeEnv(domain))).toBeNull();
  });
});

describe('requireAuth', () => {
  it('returns a 401 Response when verification fails', async () => {
    const domain = uniqueDomain();
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('should not be called - no Authorization header at all');
    }));

    const request = new Request('https://api.ddo-gear-planner.com/api/users/me');
    const result = await requireAuth(request, makeEnv(domain));

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);

    vi.unstubAllGlobals();
  });
});
