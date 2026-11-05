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
(`worker/src/routes/progress.ts`), and the shopping list a build save
carries (`PUT /api/builds/:id`'s `progress`), whose write counts against
the same interval and daily cap. The site doesn't read them: its sync
waits out a quiet spell after the last change before writing (2 s, set in
`SHOPPING_SYNC_TIMING`), which keeps it above the write interval.

| Key | Bounds |
|---|---|
| `maxProgressEntries` | tick overrides per build, and the length of `needed` and `route` |
| `maxProgressPicks` | picked things per build |
| `maxProgressKeyLength` | any key, thing or quest name |
| `maxProgressBytes` | the request body, and the stored JSON columns together |
| `progressMinWriteIntervalMs` | the gap between two writes to one build's progress |
| `maxProgressWritesPerUserPerDay` | progress writes per user per UTC day, over all their builds |

They are ceilings against a runaway or scripted client, not limits a real
build gets near: the longest key data/ can produce is about 230 characters,
and the client sends one write per burst of changes, one at a time.

## Live shopping lists

A friend's still-needed page holds a WebSocket to the Worker
(`worker/src/live.ts`; the site's end is
`site/src/app/build/live-build-list.service.ts`). These are its protocol's
fixed values, which both ends must send and recognise alike:

| Key | Is |
|---|---|
| `livePing` / `livePong` | the page's keepalive, and the answer the room gives without waking |
| `liveGoneCloseCode` | the close code after a `gone` message: no (longer a) build to show |

## Group runs

Several saved builds shopped for as one list (`worker/src/routes/groups.ts`).

| Key | Bounds |
|---|---|
| `maxGroupBuilds` | builds in one group, over all its members |
| `maxGroupsPerUser` | groups one user hosts at a time |
| `maxCharacterNameLength` | the character name each of a build's rows is labelled with |
| `groupIdleDays` | how long a group with no changes and no ticks lasts before it's deleted |
