# Backend setup (one-time, manual)

Everything in `worker/` is written and tested locally (`npm test`, and
`wrangler dev --local` against local D1/KV). These are the steps that need
your actual Cloudflare and Auth0 accounts, which I can't act on myself.

## 1. Cloudflare

1. `cd worker && npx wrangler login` - opens a browser to authorize the CLI
   against your Cloudflare account.
2. `npx wrangler d1 create ddo-gear-planner` - prints a `database_id`. Paste
   it into `wrangler.toml`'s `[[d1_databases]]` block (replacing
   `REPLACE_WITH_D1_DATABASE_ID`).
3. `npx wrangler kv namespace create ddo-gear-planner-build-cache` - prints
   an `id`. Paste it into `wrangler.toml`'s `[[kv_namespaces]]` block
   (replacing `REPLACE_WITH_KV_NAMESPACE_ID`). The name here is just how the
   namespace is labeled in the dashboard, kebab-case like the D1 database's
   name above it - unrelated to the `binding = "BUILD_CACHE"` that the code
   actually references as `env.BUILD_CACHE`.
4. `npx wrangler d1 migrations apply DB --remote` - runs every pending file
   under `migrations/` (currently `0001_init.sql` through
   `0005_user_email_verified.sql`) against the real (not local) database, in
   order, skipping any already applied. Safe to re-run.
5. In the Cloudflare dashboard, since `ddo-gear-planner.com`'s DNS is already
   on Cloudflare, deploying the Worker (step 7 below) with the
   `custom_domain = true` route in `wrangler.toml` will offer to provision
   `api.ddo-gear-planner.com` as a Custom Domain automatically - accept that
   prompt (or configure it manually under Workers & Pages -> your worker ->
   Settings -> Domains & Routes if it doesn't).
6. Rate limiting on the mutating build endpoints is handled in-Worker
   (`src/rateLimit.ts`, ~20 requests/minute per IP via KV) rather than
   Cloudflare's dashboard Rate Limiting Rules, which require a paid add-on
   outside Business/Enterprise plans - nothing to configure here.
7. `npx wrangler deploy` - ships the Worker.

## 2. Auth0

1. Create a free Auth0 account/tenant at https://auth0.com if you don't have
   one.
2. **Applications -> Create Application -> Single Page Application.** Note
   its Client ID and Domain (e.g. `your-tenant.us.auth0.com`) - Phase 3's
   Angular `auth.service.ts` needs both.
   - Allowed Callback URLs / Allowed Logout URLs / Allowed Web Origins:
     `https://ddo-gear-planner.com` (and `http://localhost:4200` for local
     dev).
3. **Applications -> APIs -> Create API.** Identifier:
   `https://api.ddo-gear-planner.com` (this must exactly match
   `AUTH0_AUDIENCE` in `wrangler.toml` - it's what makes Auth0 issue a
   verifiable JWT access token instead of an opaque one). Creating the API
   isn't enough by itself - under this API's **Applications** tab, toggle
   **Authorized** on for the SPA application from step 2. Without this,
   `/authorize` fails with `invalid_request: Client "..." is not authorized
   to access resource server "https://api.ddo-gear-planner.com"`, which the
   SDK's default error handling turns into a bounce back to `/` (the same
   symptom as the missing-API case). Under this API's
   **Settings -> Access Settings**, turn on **Allow Offline Access** - the
   Angular app is configured with `useRefreshTokens: true` (see
   `app.module.ts`'s comment for why: without it, token renewal falls back
   to a hidden iframe that modern browsers' third-party-cookie blocking
   breaks, which loses whatever the user was doing when a renewal is
   silently triggered mid-action). Without this toggle, Auth0 won't issue
   the refresh token the SDK needs, and auth silently reverts to the
   iframe-based renewal this is meant to avoid.
4. On the SPA application from step 2, under **Settings -> Advanced
   Settings -> Grant Types**, confirm **Refresh Token** is checked (on by
   default for SPA apps created through Auth0's current dashboard, but
   worth confirming).
5. **Authentication -> Social:** enable Google and Discord connections (both
   free). Under each connection's "Applications" tab, make sure the SPA
   application from step 2 is enabled for it.
6. Update `worker/wrangler.toml`'s `AUTH0_DOMAIN` to your tenant domain from
   step 2, and redeploy (`npx wrangler deploy`).
7. **Actions -> Library -> Build Custom -> Create Action** ("Login /
   Post Login" trigger). Access tokens issued for a custom API audience only
   carry registered claims (`sub`/`iss`/`aud`/`scope`/...) by default -
   `email`/`name` live on the ID token, which this backend never sees (the
   Angular SDK's interceptor sends the access token). Getting them onto the
   access token needs this Action, and Auth0 silently drops any custom claim
   that isn't namespaced under a URL, which is why `auth.ts` reads
   `${AUTH0_AUDIENCE}/email` rather than a bare `email` claim:
   ```js
   exports.onExecutePostLogin = async (event, api) => {
     const namespace = 'https://api.ddo-gear-planner.com';
     if (event.user.email) {
       api.accessToken.setCustomClaim(`${namespace}/email`, event.user.email);
       api.accessToken.setCustomClaim(`${namespace}/email_verified`, !!event.user.email_verified);
     }
     if (event.user.name) {
       api.accessToken.setCustomClaim(`${namespace}/name`, event.user.name);
     }
   };
   ```
   Deploy the Action, then drag it into the **Login** flow under
   **Actions -> Flows -> Login** and apply. Without this step, `/api/users/me`
   still works but creates/updates D1 `users` rows with `email`/`display_name`
   left `NULL`.

   `email_verified` is what lets the backend recognize the same person
   signing in through a different connection (e.g. Google, then Discord)
   with the same address as their existing account instead of silently
   creating a second, empty one - see `auth.ts` and `db.ts`'s
   `getUserByVerifiedEmail`. Without it, every social connection's emails
   are treated as unverified and cross-provider login always creates a
   separate account.

## 3. Verifying it's live

- `curl https://api.ddo-gear-planner.com/api/build/doesnotexist` should
  return a 404 JSON error (not a connection error / not HTML from Netlify).
- From the Auth0 dashboard, use "Test" on the API (step 2.3) to get a real
  access token, then:
  `curl -H "Authorization: Bearer <token>" https://api.ddo-gear-planner.com/api/users/me`
  should return `{"id":...,"buildCount":0}` and create a row in the `users`
  table (`npx wrangler d1 execute DB --remote --command "SELECT * FROM users"`).
- Open the app in an actual browser (not curl) and confirm a cross-origin
  call with an `Authorization` header succeeds - the CORS preflight path is
  the one thing curl can't validate for you (see `src/index.ts`'s comment on
  why).

None of this is needed for Phase 1 (URL compression) to keep working - it's
only required before Phase 3 (save/My Builds) can call this backend for
real.
