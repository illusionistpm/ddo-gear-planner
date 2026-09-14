import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isRateLimited } from '../src/rateLimit';

// Minimal in-memory stand-in for the one KVNamespace method isRateLimited
// actually calls - a real KV integration test belongs against `wrangler
// dev`'s local KV, not a unit test.
function createFakeKv(): KVNamespace {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    })
  } as unknown as KVNamespace;
}

describe('isRateLimited', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  it('allows requests under the limit', async () => {
    const kv = createFakeKv();

    for (let i = 0; i < 5; i++) {
      expect(await isRateLimited(kv, '1.2.3.4', { limit: 5, windowSeconds: 60 })).toBe(false);
    }
  });

  it('blocks once the limit is reached within the window', async () => {
    const kv = createFakeKv();
    const options = { limit: 3, windowSeconds: 60 };

    expect(await isRateLimited(kv, '1.2.3.4', options)).toBe(false);
    expect(await isRateLimited(kv, '1.2.3.4', options)).toBe(false);
    expect(await isRateLimited(kv, '1.2.3.4', options)).toBe(false);
    expect(await isRateLimited(kv, '1.2.3.4', options)).toBe(true);
  });

  it('tracks each client IP independently', async () => {
    const kv = createFakeKv();
    const options = { limit: 1, windowSeconds: 60 };

    expect(await isRateLimited(kv, '1.2.3.4', options)).toBe(false);
    expect(await isRateLimited(kv, '5.6.7.8', options)).toBe(false);
    expect(await isRateLimited(kv, '1.2.3.4', options)).toBe(true);
    expect(await isRateLimited(kv, '5.6.7.8', options)).toBe(true);
  });

  it('resets once a new window starts', async () => {
    const kv = createFakeKv();
    const options = { limit: 1, windowSeconds: 60 };

    expect(await isRateLimited(kv, '1.2.3.4', options)).toBe(false);
    expect(await isRateLimited(kv, '1.2.3.4', options)).toBe(true);

    vi.advanceTimersByTime(61_000);

    expect(await isRateLimited(kv, '1.2.3.4', options)).toBe(false);
  });

  it('sets a TTL slightly longer than the window so keys self-expire', async () => {
    const kv = createFakeKv();

    await isRateLimited(kv, '1.2.3.4', { limit: 5, windowSeconds: 60 });

    expect(kv.put).toHaveBeenCalledWith(
      expect.stringContaining('ratelimit:1.2.3.4:'),
      '1',
      { expirationTtl: 65 }
    );
  });

  it('fails open (allows the request) if the KV read errors', async () => {
    const kv = {
      get: vi.fn().mockRejectedValue(new Error('KV unavailable')),
      put: vi.fn()
    } as unknown as KVNamespace;

    expect(await isRateLimited(kv, '1.2.3.4', { limit: 1, windowSeconds: 60 })).toBe(false);
  });

  it('fails open (allows the request) if the KV write errors', async () => {
    // KV caps writes to the *same key* at 1/second (true on paid plans
    // too) - every request from one IP in a window hits the same key, so a
    // genuine rapid burst is exactly the scenario this write can fail in.
    const kv = {
      get: vi.fn().mockResolvedValue('0'),
      put: vi.fn().mockRejectedValue(new Error('KV put rate limit exceeded'))
    } as unknown as KVNamespace;

    expect(await isRateLimited(kv, '1.2.3.4', { limit: 1, windowSeconds: 60 })).toBe(false);
  });
});
