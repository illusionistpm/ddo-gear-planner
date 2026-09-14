// Cloudflare's dashboard Rate Limiting Rules (Security -> WAF) require a
// paid add-on outside Business/Enterprise plans, so this project (built to
// stay on free tiers) rate-limits the mutating build endpoints in the
// Worker itself instead, reusing the BUILD_CACHE KV namespace.
//
// This is a coarse, fixed-window counter, not a precise one: KV writes
// aren't atomic, so concurrent requests from the same IP in the same
// window can under-count (each reads the same stale value before either
// writes back the increment). That's an acceptable tradeoff at this
// project's traffic scale - the goal is blocking a script hammering
// POST/PUT/DELETE on builds, not exact accounting. A Durable Object would
// give atomic counts if this ever needs to be precise.
//
// KV also caps writes to the *same key* at 1/second (true on both free and
// paid plans) - and every request from one IP within a window writes to
// the same key here, so a genuine rapid burst can make that write fail.
// Any KV error below therefore fails OPEN (treated as "not limited") rather
// than throwing: a best-effort abuse guard should never be the reason a
// legitimate save request 500s.

export interface RateLimitOptions {
  limit: number;
  windowSeconds: number;
}

export const DEFAULT_RATE_LIMIT: RateLimitOptions = { limit: 20, windowSeconds: 60 };

export function getClientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP') ?? 'unknown';
}

export async function isRateLimited(
  cache: KVNamespace,
  clientIp: string,
  options: RateLimitOptions = DEFAULT_RATE_LIMIT
): Promise<boolean> {
  const windowStart = Math.floor(Date.now() / 1000 / options.windowSeconds) * options.windowSeconds;
  const key = `ratelimit:${clientIp}:${windowStart}`;

  try {
    const current = Number((await cache.get(key)) ?? '0');
    if (current >= options.limit) {
      return true;
    }

    // TTL a little past the window so the key doesn't linger, but survives
    // long enough to cover the whole window even if this write lands late.
    await cache.put(key, String(current + 1), { expirationTtl: options.windowSeconds + 5 });
    return false;
  } catch {
    return false;
  }
}
