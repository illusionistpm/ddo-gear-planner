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

## Shopping-list progress

The `*Progress*` values bound what `PUT /api/builds/:id/progress` stores
(`worker/src/routes/progress.ts`), and the site's sync uses the write
interval to pace itself:

| Key | Bounds |
|---|---|
| `maxProgressEntries` | tick overrides per build, and the length of `needed` and `route` |
| `maxProgressPicks` | picked things per build |
| `maxProgressKeyLength` | any key, thing or quest name |
| `maxProgressBytes` | the request body, and the four stored JSON columns together |
| `progressMinWriteIntervalMs` | the gap between two writes to one build's progress |
| `maxProgressWritesPerUserPerDay` | progress writes per user per UTC day, over all their builds |

They are ceilings against a runaway or scripted client, not limits a real
build gets near: the longest key data/ can produce is about 230 characters,
and the client debounces its writes to a few per minute.
