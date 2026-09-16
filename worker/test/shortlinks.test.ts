import { describe, expect, it } from 'vitest';
import { Env } from '../src/auth';
import { handleCreateShortLink } from '../src/routes/shortlinks';

// Minimal in-memory stand-in for D1Database - just enough of the
// prepare().bind().first()/.run() chain for db.ts's shortlink helpers to
// work against, mirroring the real UNIQUE constraint on `blob`.
class FakeD1 {
  rows: { short_id: string; blob: string; created_at: string }[] = [];

  prepare(sql: string) {
    return {
      bind: (...args: unknown[]) => ({
        first: async () => {
          if (sql.includes('WHERE blob = ?')) {
            return this.rows.find(r => r.blob === args[0]) ?? null;
          }
          if (sql.includes('WHERE short_id = ?')) {
            return this.rows.find(r => r.short_id === args[0]) ?? null;
          }
          return null;
        },
        run: async () => {
          if (sql.startsWith('INSERT INTO shortlinks')) {
            const [shortId, blob, createdAt] = args as [string, string, string];
            if (this.rows.some(r => r.short_id === shortId)) {
              throw new Error('D1_ERROR: UNIQUE constraint failed: shortlinks.short_id');
            }
            if (this.rows.some(r => r.blob === blob)) {
              throw new Error('D1_ERROR: UNIQUE constraint failed: shortlinks.blob');
            }
            this.rows.push({ short_id: shortId, blob, created_at: createdAt });
          }
          return {};
        }
      })
    };
  }
}

function makeEnv(): { env: Env; db: FakeD1 } {
  const db = new FakeD1();
  return { env: { DB: db as unknown as Env['DB'] } as Env, db };
}

function request(body: unknown): Request {
  return new Request('https://example.test/api/shortlinks', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

describe('handleCreateShortLink', () => {
  it('mints a fresh short link for new content', async () => {
    const { env, db } = makeEnv();

    const response = await handleCreateShortLink(request({ blob: 'z1.abc', name: 'My Fighter' }), env);

    expect(response.status).toBe(201);
    const body = await response.json() as { shortId: string };
    expect(body.shortId).toMatch(/^[A-Za-z0-9]{8}$/);
    expect(db.rows).toHaveLength(1);
    expect(JSON.parse(db.rows[0].blob)).toEqual({ name: 'My Fighter', blob: 'z1.abc' });
  });

  it('dedupes identical gear + name into the same short link', async () => {
    const { env } = makeEnv();

    const first = await handleCreateShortLink(request({ blob: 'z1.abc', name: 'My Fighter' }), env);
    const second = await handleCreateShortLink(request({ blob: 'z1.abc', name: 'My Fighter' }), env);

    const firstBody = await first.json() as { shortId: string };
    const secondBody = await second.json() as { shortId: string };
    expect(second.status).toBe(200);
    expect(secondBody.shortId).toBe(firstBody.shortId);
  });

  it('mints a distinct short link when only the name differs', async () => {
    const { env, db } = makeEnv();

    const first = await handleCreateShortLink(request({ blob: 'z1.abc', name: 'My Fighter' }), env);
    const second = await handleCreateShortLink(request({ blob: 'z1.abc', name: 'My Fighter (final)' }), env);

    const firstBody = await first.json() as { shortId: string };
    const secondBody = await second.json() as { shortId: string };
    expect(secondBody.shortId).not.toBe(firstBody.shortId);
    expect(db.rows).toHaveLength(2);
  });

  it('mints a distinct short link when only the gear differs', async () => {
    const { env } = makeEnv();

    const first = await handleCreateShortLink(request({ blob: 'z1.abc', name: 'My Fighter' }), env);
    const second = await handleCreateShortLink(request({ blob: 'z1.def', name: 'My Fighter' }), env);

    const firstBody = await first.json() as { shortId: string };
    const secondBody = await second.json() as { shortId: string };
    expect(secondBody.shortId).not.toBe(firstBody.shortId);
  });

  it('defaults to an empty name when none is given', async () => {
    const { env, db } = makeEnv();

    await handleCreateShortLink(request({ blob: 'z1.abc' }), env);

    expect(JSON.parse(db.rows[0].blob)).toEqual({ name: '', blob: 'z1.abc' });
  });

  it('rejects a missing blob', async () => {
    const { env } = makeEnv();

    const response = await handleCreateShortLink(request({ name: 'My Fighter' }), env);

    expect(response.status).toBe(400);
  });

  it('rejects an oversized name', async () => {
    const { env } = makeEnv();

    const response = await handleCreateShortLink(request({ blob: 'z1.abc', name: 'x'.repeat(61) }), env);

    expect(response.status).toBe(400);
  });
});
