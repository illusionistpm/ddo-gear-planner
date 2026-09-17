import { describe, expect, it } from 'vitest';
import { Env } from '../src/auth';
import worker from '../src/index';
import { createFakeKv, FakeD1 } from './fakes';

function makeEnv(): Env {
  return {
    DB: new FakeD1() as unknown as D1Database,
    BUILD_CACHE: createFakeKv(),
    AUTH0_DOMAIN: 'test-tenant.us.auth0.com',
    AUTH0_AUDIENCE: 'https://api.ddo-gear-planner.com',
    ALLOWED_ORIGINS: 'https://ddo-gear-planner.com,http://localhost:4200'
  };
}

function request(method: string, path: string, init?: RequestInit): Request {
  return new Request(`https://example.test${path}`, { method, ...init });
}

describe('router', () => {
  it('404s an unknown path', async () => {
    const response = await worker.fetch(request('GET', '/api/nonexistent'), makeEnv());

    expect(response.status).toBe(404);
  });

  it('401s a protected route with no Authorization header', async () => {
    const response = await worker.fetch(request('GET', '/api/users/me'), makeEnv());

    expect(response.status).toBe(401);
  });

  it('401s every other protected route with no Authorization header', async () => {
    const env = makeEnv();
    const cases: [string, string][] = [
      ['POST', '/api/builds'],
      ['GET', '/api/builds/mine'],
      ['PUT', '/api/builds/some-id'],
      ['DELETE', '/api/builds/some-id'],
      ['POST', '/api/shortlinks']
    ];

    for (const [method, path] of cases) {
      const response = await worker.fetch(request(method, path, { body: method === 'GET' || method === 'DELETE' ? undefined : '{}' }), env);
      expect(response.status, `${method} ${path}`).toBe(401);
    }
  });

  it('serves the public GET /api/build/:shortId route with no auth at all', async () => {
    const env = makeEnv();
    // A shortId the allocator has never heard of - the point here is that
    // this route is reachable without a 401, not what it returns.
    const response = await worker.fetch(request('GET', '/api/build/doesnotexist'), env);

    expect(response.status).toBe(404);
  });

  it('answers an OPTIONS preflight with 204 and CORS headers, without reaching the router', async () => {
    const env = makeEnv();
    const response = await worker.fetch(
      request('OPTIONS', '/api/users/me', { headers: { Origin: 'https://ddo-gear-planner.com' } }),
      env
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://ddo-gear-planner.com');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  it('attaches CORS headers to every response, including a 404', async () => {
    const env = makeEnv();
    const response = await worker.fetch(
      request('GET', '/api/nonexistent', { headers: { Origin: 'https://ddo-gear-planner.com' } }),
      env
    );

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://ddo-gear-planner.com');
    expect(response.headers.get('Vary')).toBe('Origin');
  });

  it('falls back to the first allowed origin for a disallowed Origin header', async () => {
    const env = makeEnv();
    const response = await worker.fetch(
      request('GET', '/api/nonexistent', { headers: { Origin: 'https://evil.example.test' } }),
      env
    );

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://ddo-gear-planner.com');
  });
});
