import { defineConfig } from 'vitest/config';

// shortId.ts and auth.ts are plain logic over standard Web APIs
// (crypto.getRandomValues, fetch) with no actual D1/KV binding at runtime,
// so a full Workers runtime (miniflare / @cloudflare/vitest-pool-workers)
// isn't needed for the units the plan calls out for coverage. db.ts and
// index.ts do touch real bindings and are exercised via `wrangler dev`
// against local D1/KV instead (see ../README or SETUP.md), not unit tests.
export default defineConfig({
  resolve: {
    // jose picks its runtime implementation via package.json export
    // conditions - without this, Vite resolves its default Node build,
    // which fetches the JWKS via Node's own https module instead of global
    // fetch(), silently ignoring any fetch mock in tests. The real Worker
    // runs under the "workerd" condition, so matching it here is also more
    // representative of production, not just a test-mocking workaround.
    conditions: ['workerd', 'worker', 'browser']
  },
  test: {
    environment: 'node'
  }
});
