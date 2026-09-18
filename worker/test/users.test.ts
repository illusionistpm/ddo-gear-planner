import { describe, expect, it } from 'vitest';
import { AuthenticatedUser, Env } from '../src/auth';
import { handleGetMe } from '../src/routes/users';
import { createFakeKv, FakeD1 } from './fakes';

function makeEnv(): { env: Env; db: FakeD1 } {
  const db = new FakeD1();
  return { env: { DB: db as unknown as Env['DB'], BUILD_CACHE: createFakeKv() } as Env, db };
}

describe('handleGetMe / upsertUser', () => {
  it('creates a new row on a first-ever login', async () => {
    const { env, db } = makeEnv();
    const user: AuthenticatedUser = { sub: 'google-oauth2|1', email: 'player@example.test', emailVerified: true, name: 'Player' };

    const response = await handleGetMe(user, env);

    expect(response.status).toBe(200);
    expect(db.users).toHaveLength(1);
    expect(db.users[0]).toMatchObject({ auth0_sub: 'google-oauth2|1', email: 'player@example.test', email_verified: 1 });
  });

  it('recognizes a returning login by auth0_sub without touching other rows', async () => {
    const { env, db } = makeEnv();
    const user: AuthenticatedUser = { sub: 'google-oauth2|1', email: 'player@example.test', emailVerified: true, name: 'Player' };
    await handleGetMe(user, env);

    await handleGetMe({ ...user, name: 'Renamed Player' }, env);

    expect(db.users).toHaveLength(1);
    expect(db.users[0].display_name).toBe('Renamed Player');
  });

  it('links a second provider to the same account when the email is verified on both', async () => {
    const { env, db } = makeEnv();
    const google: AuthenticatedUser = { sub: 'google-oauth2|1', email: 'player@example.test', emailVerified: true, name: 'Player' };
    const discord: AuthenticatedUser = { sub: 'discord|2', email: 'player@example.test', emailVerified: true, name: 'Player' };

    const first = await handleGetMe(google, env);
    const firstBody = await first.json() as { id: string };

    const second = await handleGetMe(discord, env);
    const secondBody = await second.json() as { id: string };

    // Same account (same id) - the sub was repointed, not a second row
    // created, so builds already saved under the Google login stay visible.
    expect(secondBody.id).toBe(firstBody.id);
    expect(db.users).toHaveLength(1);
    expect(db.users[0].auth0_sub).toBe('discord|2');

    // And logging back in with the original provider still resolves back
    // to the very same account via the email match.
    const third = await handleGetMe(google, env);
    const thirdBody = await third.json() as { id: string };
    expect(thirdBody.id).toBe(firstBody.id);
    expect(db.users).toHaveLength(1);
  });

  it('does not link accounts when the email is unverified', async () => {
    const { env, db } = makeEnv();
    const google: AuthenticatedUser = { sub: 'google-oauth2|1', email: 'player@example.test', emailVerified: true, name: 'Player' };
    const unverified: AuthenticatedUser = { sub: 'auth0|2', email: 'player@example.test', emailVerified: false, name: 'Someone Else' };

    await handleGetMe(google, env);
    await handleGetMe(unverified, env);

    expect(db.users).toHaveLength(2);
  });
});
