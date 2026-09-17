import { describe, expect, it } from 'vitest';
import { AuthenticatedUser, Env } from '../src/auth';
import { handleCreateShortLink } from '../src/routes/shortlinks';
import { FakeD1 } from './fakes';

function makeEnv(): { env: Env; db: FakeD1 } {
  const db = new FakeD1();
  return { env: { DB: db as unknown as Env['DB'] } as Env, db };
}

const user: AuthenticatedUser = { sub: 'auth0|abc123', email: 'player@example.test', name: 'Player' };

function request(body: unknown): Request {
  return new Request('https://example.test/api/shortlinks', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

describe('handleCreateShortLink', () => {
  it('mints a fresh short link for new content, reserving it in the shared allocator', async () => {
    const { env, db } = makeEnv();

    const response = await handleCreateShortLink(request({ blob: 'z1.abc', name: 'My Fighter' }), user, env);

    expect(response.status).toBe(201);
    const body = await response.json() as { shortId: string };
    expect(body.shortId).toMatch(/^[A-Za-z0-9]{8}$/);
    expect(db.shortlinks).toHaveLength(1);
    expect(JSON.parse(db.shortlinks[0].blob)).toEqual({ name: 'My Fighter', blob: 'z1.abc' });
    expect(db.shortIds).toEqual([{ short_id: body.shortId, kind: 'shortlink', created_at: db.shortlinks[0].created_at }]);
  });

  it('attributes the shortlink to its creator when the caller has a user row', async () => {
    const { env, db } = makeEnv();
    db.users.push({ id: 'user-1', auth0_sub: user.sub, email: null, display_name: null, created_at: 'now', last_login_at: 'now' });

    await handleCreateShortLink(request({ blob: 'z1.abc', name: 'My Fighter' }), user, env);

    expect(db.shortlinks[0].creator_user_id).toBe('user-1');
  });

  it('leaves creator_user_id null (rather than failing) for a caller with no user row yet', async () => {
    const { env, db } = makeEnv();

    const response = await handleCreateShortLink(request({ blob: 'z1.abc', name: 'My Fighter' }), user, env);

    expect(response.status).toBe(201);
    expect(db.shortlinks[0].creator_user_id).toBeNull();
  });

  it('does not mint a new shortId that collides with one already reserved by a build', async () => {
    // The whole point of the shared allocator (migrations/0003) - a build
    // and a shortlink can never end up sharing a shortId, even though they
    // live in separate tables with their own independent UNIQUE columns.
    const { env, db } = makeEnv();
    db.shortIds.push({ short_id: 'AAAAAAAA', kind: 'build', created_at: 'now' });

    await handleCreateShortLink(request({ blob: 'z1.abc', name: 'My Fighter' }), user, env);

    expect(db.shortlinks[0].short_id).not.toBe('AAAAAAAA');
  });

  it('dedupes identical gear + name into the same short link', async () => {
    const { env } = makeEnv();

    const first = await handleCreateShortLink(request({ blob: 'z1.abc', name: 'My Fighter' }), user, env);
    const second = await handleCreateShortLink(request({ blob: 'z1.abc', name: 'My Fighter' }), user, env);

    const firstBody = await first.json() as { shortId: string };
    const secondBody = await second.json() as { shortId: string };
    expect(second.status).toBe(200);
    expect(secondBody.shortId).toBe(firstBody.shortId);
  });

  it('mints a distinct short link when only the name differs', async () => {
    const { env, db } = makeEnv();

    const first = await handleCreateShortLink(request({ blob: 'z1.abc', name: 'My Fighter' }), user, env);
    const second = await handleCreateShortLink(request({ blob: 'z1.abc', name: 'My Fighter (final)' }), user, env);

    const firstBody = await first.json() as { shortId: string };
    const secondBody = await second.json() as { shortId: string };
    expect(secondBody.shortId).not.toBe(firstBody.shortId);
    expect(db.shortlinks).toHaveLength(2);
  });

  it('mints a distinct short link when only the gear differs', async () => {
    const { env } = makeEnv();

    const first = await handleCreateShortLink(request({ blob: 'z1.abc', name: 'My Fighter' }), user, env);
    const second = await handleCreateShortLink(request({ blob: 'z1.def', name: 'My Fighter' }), user, env);

    const firstBody = await first.json() as { shortId: string };
    const secondBody = await second.json() as { shortId: string };
    expect(secondBody.shortId).not.toBe(firstBody.shortId);
  });

  it('defaults to an empty name when none is given', async () => {
    const { env, db } = makeEnv();

    await handleCreateShortLink(request({ blob: 'z1.abc' }), user, env);

    expect(JSON.parse(db.shortlinks[0].blob)).toEqual({ name: '', blob: 'z1.abc' });
  });

  it('rejects a missing blob', async () => {
    const { env } = makeEnv();

    const response = await handleCreateShortLink(request({ name: 'My Fighter' }), user, env);

    expect(response.status).toBe(400);
  });

  it('rejects an oversized name', async () => {
    const { env } = makeEnv();

    const response = await handleCreateShortLink(request({ blob: 'z1.abc', name: 'x'.repeat(61) }), user, env);

    expect(response.status).toBe(400);
  });
});
