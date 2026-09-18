# shared/

Constants that both `site/` and `worker/` need to agree on, imported directly
by each (`resolveJsonModule` is already enabled in both `tsconfig.json`s).
There's no monorepo tooling here - `site/` and `worker/` are two independent
npm projects with their own dependencies and build pipelines - so this is
deliberately just one plain JSON file at a path both can reach with a
relative import, not a published package.

The Worker (`worker/src/routes/builds.ts`) is the authoritative enforcement
point for every value here - this API is callable directly, so nothing
client-side is a real guarantee. The site's own copy is for early,
friendlier validation (and UI display, e.g. the "X/100" builds-remaining
indicator) only.

If a value here ever changes, both `worker/src/routes/builds.ts` and the
site's import sites pick it up automatically on their next build - there is
no separate value to remember to update.
