# Group runs: several people's builds on one shopping list

## Context

Today one saved build has one shopping list. Its owner ticks things off, and a
friend follows along read-only at `/still-needed/:shortId`, which shows the
build's name at the top.

**This plan builds on the live-sync branch `ccr-0b6a224f-mmqcm4`, which is not
merged yet.** On that branch:
- Every saved build has a `ProgressRoom` Durable Object
  (`worker/src/progress-room.ts`, keyed by shortId). It uses the Hibernation
  API and answers the ping without waking.
- A friend's page opens `GET /api/build/:shortId/live`. The room sends the
  whole `FriendList` (`{name, blob, needed, route, order, version}`, in
  `worker/src/live.ts`) on connect.
- Whenever a progress PUT or a build save changes what friends see,
  `tellFriends(env, waiter, shortId, list)` POSTs to the room's `/send`. That
  happens in `planProgressWrite` (`routes/progress.ts`) and in
  `routes/builds.ts`, where a save can carry its list.
- Deleting a build calls `closeFriends`, which sends `gone` with close code
  4404.
- The public progress GET is gone.
- On the site, `LiveBuildListService` owns the socket: jittered reconnect with
  backoff, a ping only while the page is visible, and reconnect on
  focus/visibility. Messages are ordered by `version`.
  `FriendShoppingListService.watch(shortId)` turns each message into a view,
  re-deriving entries only when the blob changes.

Branch `claude/group-shopping-list-plan-hnpe56` should be rebased onto that
branch, or onto master once it merges, before any group work starts.

The next phase is a **group run**. Up to 12 builds, from any number of friends,
go into one combined list. One person can bring several characters. Each row
says which characters it's for, using short character names rather than build
names. Everyone routes through one shared quest order, so a single run of a
quest covers as many people as possible. Builds can be added and removed while
the run is going.

Decisions you made:
- **Only a build's owner can tick its rows.** Everyone sees the ticks update.
- **Joining is by invite link, with no approval step.** Anyone signed in who
  has the link can add their saved builds. The host can remove builds and reset
  the link.
- **There is one shared route.** The host's picks and Arrange order apply to
  everyone. Other members see the order but can't change it.
- **The cap is 12 builds per group.** It goes in `shared/constants.json`.

## Data model (worker, D1)

New migration `worker/migrations/0008_groups.sql`:

```sql
CREATE TABLE groups (
  id TEXT PRIMARY KEY,
  short_id TEXT UNIQUE NOT NULL,      -- from the short_ids allocator, kind 'group'
  host_user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,                 -- "Saturday Reaper run"; optional and defaulted
  invite_token TEXT NOT NULL,         -- secret half of the invite link; host can rotate it
  picks TEXT NOT NULL DEFAULT '{}',   -- shared route picks, by identity (same shape as build_progress.picks)
  route_order TEXT,                   -- shared Arrange order (same shape as 0007)
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE group_builds (
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  build_id TEXT NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  added_by_user_id TEXT NOT NULL REFERENCES users(id),
  character_name TEXT NOT NULL,       -- short label shown on rows; unique within a group
  added_at TEXT NOT NULL,
  PRIMARY KEY (group_id, build_id)
);
CREATE INDEX idx_group_builds_build ON group_builds(build_id);
```

The tables split responsibility like this:
- **Ticks stay in `build_progress`.** No new progress store is needed. A
  member's ticks on the group page go through the same per-build PUT as their
  own list, with the same throttles and daily cap. Their ticks also show on
  their own list and on their `/still-needed` link.
- **`build_progress.needed` stays the source of "still needed".** The group
  view reads it for each build, just as the friend view does today. Each
  build's own route and order are ignored in a group, because the group's
  `picks`/`route_order` replace them.
- **Deleting a build removes it from its groups.** `deleteBuild` (`db.ts`)
  does this in the same batch it already uses for the build's progress row. The
  CASCADE is a backstop, as it is in 0006.

New constants in `shared/constants.json`: `maxGroupBuilds: 12`,
`maxCharacterNameLength` (about 20), `maxGroupsPerUser` (about 10).

## Worker API: new file `worker/src/routes/groups.ts`

| Route | Who | What |
|---|---|---|
| `POST /api/groups` | signed in | Creates a group. The caller is host. The body can carry the first builds `[{buildId, characterName}]`. |
| `GET /api/groups/:shortId/live?t=<token>` | anyone with the token | WebSocket to the group's `GroupRoom` (see Live updates). This is shared content only, since a browser socket can't send a Bearer header. |
| `GET /api/groups/:shortId/me?t=<token>` | signed in | Facts about the viewer only: `isHost`, and which of the group's builds are yours. Fetched once on load and again after you change sign-in state. |
| `POST /api/groups/:shortId/builds` | signed in, with token | Adds one of the caller's own builds with a character name. Answers 409 at the 12-build cap or on a duplicate name. |
| `PATCH /api/groups/:shortId/builds/:buildId` | the build's owner | Renames the character. |
| `DELETE /api/groups/:shortId/builds/:buildId` | the build's owner or the host | Removes a build from the group. |
| `PUT /api/groups/:shortId/route` | host | Sets `{picksPatch?, order?}`, merged the way `handlePutProgress` merges picks. It reuses that file's `parseKeyed`/`parseOrder`/`mergePatch`, moved to a small shared module, and uses the same throttle pattern. |
| `POST /api/groups/:shortId/invite` | host | Rotates the invite token. |
| `PATCH /api/groups/:shortId` | host | Renames the group `{name}` (1-60 characters). |
| `DELETE /api/groups/:shortId` | host | Ends the group. |
| `GET /api/groups/mine` | signed in | Groups you host or have a build in, for a "Your group runs" list, with each one's character names so lists can be told apart. |

The token travels as a query param on the API call. In the site URL it rides
in the fragment, so it never reaches server logs or Referer headers.

A wrong token gets the same `gone` / 4404 that `ProgressRoom` sends for a
missing build. `handleLive`'s Origin check is reused, and the socket route
skips `withCors`, as `/api/build/:shortId/live` does in `index.ts`.

Rotating the invite token or ending the group closes every socket in the room
(`/close`). Members with the new link reconnect.

The routes are wired into `worker/src/index.ts` following the existing regex
pattern. Tests go in `worker/test/` next to the progress tests.

## Site

### Entry points
> **Since shipped differently:** your own list has two actions, *Add builds*
> (your other saved builds, on a list only you add to) and *Invite friends*
> (a list friends join by link). Neither creates anything until confirmed in
> its dialog, a new list needs a name (prefilled, unique among yours), and a
> build already on a list is offered that list first. The host can rename a
> list (`PATCH /api/groups/:shortId`).

1. **"Start a group run" in the shopping list header.** It goes next to Share
   in `shopping-list.component.html`, and only appears for a saved build that
   is signed in, since a group needs saved builds. It opens the setup dialog
   with the current build pre-selected.
2. **A "Group runs" list** in the My Builds area, built from
   `GET /api/groups/mine`, for getting back to a run.
3. **The invite link** `/group/:shortId#join=<token>` opens the group page,
   which offers "Add your builds" (sign in first if needed).

### Group page: `/group/:shortId`
- A new routed page modelled on `StillNeededPageComponent`. It reads the
  group itself and never loads anything into the planner. Add it to
  `app-routing.module.ts`, and to the `app.component.ts` branch that leaves the
  planner alone for `/still-needed`.
- **Make it a standalone component loaded with `loadComponent`**, not part of
  the eager `AppModule`, following the CLAUDE.md note on initial bundle size.
  Check the production build's initial total before and after.
- **Header:** the group name, a chip for each character (name and progress
  count, coloured), "Add builds" (for anyone signed in with the token), Invite
  (copy link), and a host menu (Remove, Reset invite link, End group).
- **Body:** it reuses `ShoppingListComponent` in a new `group` mode. This
  reworks the single-build-name heading. The heading becomes the group name and
  the character chips, and `FriendBuildHeading` is generalised (or a sibling
  input is added).
- **Add builds dialog:** a list of your saved builds (`BuildsService.listMine`)
  to check off. Each gets a character-name field, prefilled from the build name
  and trimmed to the max. A build already in the group shows as added, with
  Remove. Removing has an undo snackbar, since you can add and remove builds as
  you go.

### Combined list model: pure, in `planner/shopping-list/`
New `group-shopping-list.ts`:
- **Entries:** for each group build, run
  `deriveShoppingEntries(slotsFromParams(decode(blob)))`. This is the same
  pipeline as `FriendShoppingListService.build`. Prefix each key with the
  member: `${buildId}|${key}`. Keep `identity` unprefixed, so the same augment
  needed by three characters folds into one row and routes once. Add
  `member: string` (the buildId) to `ShoppingEntry` as an optional field, so
  single-build code is untouched.
- **Progress:** the entries whose build's `needed` doesn't list them count as
  acquired, as in `progressOf` in `friend-shopping-list.service.ts`.
- **View:** call `buildShoppingListView(allEntries, progress, null, { filter,
  picks: group.picks, order: group.order })`. The routing (`routeSources`)
  already works on identities across every entry, so the combined route comes
  for free.
- **Who each row is for:** add `members: {member, quantity, acquired}[]` to
  `ShoppingRow`, filled in `foldRows` from the folded entries. It's empty
  outside group mode. The template shows these as small character-name chips on
  the row, such as `Kira ×2  Thane ✓`, coloured per character. Add colour
  tokens (`--member-accent-0..11`) to both themes in `styles.css`, following
  the pack-accent pattern and the colour rules in CLAUDE.md.
- **Filters:** add "Mine only" alongside All/Needed, and a filter for each
  character.

### Ticking in a group
**Rows fold the same thing across characters, and the chips are where you
tick.** One row reads "Ring of the Stalker", followed by one chip per
character: `Kira ×2`, `Thane ✓`, `Vex`. Folding keeps the route readable:
three people needing the same augment is one line under one quest. The chips
say who each copy is for.

How ticking works:
- **Your own characters' chips are buttons.** A chip ticks that character's
  entries in the row, through `togglePatch` on a row cut down to those entries.
  If you have three builds needing the item, you tap the chip of whichever one
  is getting this drop. Other people's chips are read-only.
- **A chip for several copies on one character** (`Kira ×2`, two rings with
  the same augment) ticks one copy per tap: `0/2 → 1/2 → 2/2 → 0/2`. A single
  copy toggles.
- **The row checkbox ticks all of your characters at once,** using
  `togglePatch` semantics over all your entries in the row. It shows a mixed
  state when some of your chips are done.
- **Pure pieces to add:**
  - `membersOf(row)` returns `{member, keys, acquired, quantity}[]`. It is
    computed in `foldRows`, from the folded entries' `member`.
  - `chipPatch(row, member, …)` steps one copy, and reuses `togglePatch`'s
    trove-aware key logic.
  - Specs for both, including a row with three of your builds and one
    friend's.
- **The writes need a per-build sync engine.** Today `ServerShoppingProgressStore`
  is a root singleton tied to `CurrentBuildService`. Extract its
  outbox/debounce/backoff/keepalive engine into a plain class,
  `BuildProgressSync(buildId)`. The root store uses it for the current build,
  and the group page creates one per own build in the group. Before that
  extraction, commit characterization specs that pin the store's sync
  behaviour, per the repo convention.
- **Each write also updates that build's published `needed`, but
  incrementally.** Take the last published list from the live message, then
  remove the keys just ticked and add back the keys just unticked. Don't
  recompute it with `publishedProgress`. Trove auto-ticks are already resolved
  into `needed` when the owner publishes, but the trove import lives in the
  owner's localStorage (`UserGearService`). Recomputing on a device without
  that import would put trove-covered items back on the list. The incremental
  update keeps them resolved, and friends' `/still-needed` links stay right.
  `route` is not republished: the build's own route belongs to its own list.

### Live updates, on the live-sync branch's rooms

**Worker:**
- **A new `GroupRoom` Durable Object, one per group shortId.** It is a copy of
  `ProgressRoom`'s shape: hibernation, ping auto-response, and the same
  `/connect`, `/send` and `/close` routes.
  - Factor the shared parts out of `progress-room.ts`: `trySend`/`tryClose`,
    the close handshake, and the socket accept. Then the two classes differ
    only in what `/connect` reads.
  - Declare it in `wrangler.toml` with a new `[[migrations]] tag = "v2"
    new_sqlite_classes = ["GroupRoom"]`.
- **On `/connect`, check the token, then send a full snapshot**,
  `{kind:'group', version, name, picks, order, members: [{buildId,
  characterName, list: FriendList}]}`. The snapshot comes from one D1 query
  joining `group_builds`, `builds` and `build_progress`. All builds are
  public, so there is nothing extra to check.
- **Two incremental messages follow the snapshot:**
  - `{kind:'member', buildId, list}` when one build's list changes.
  - `{kind:'group', ...}` again, the whole snapshot, when membership, names,
    picks or order change. These are rare, and a full resend keeps the client
    simple.
- **Fan-out happens in `tellFriends`, not at its call sites.**
  `tellFriends(env, waiter, shortId, list)` gains a `buildId` and, in the same
  `waitUntil`, looks up `group_builds` for that build. It then POSTs a `member`
  message to each group's room. Every path that already tells a build's
  friends (progress PUT, a build save with or without its list) covers groups
  too, without new wiring.
- **`closeFriends` on build delete removes the build from its groups** and
  sends their rooms a fresh `group` snapshot.
- **The group routes (add, remove, rename, host route PUT) end with
  `tellGroup(env, waiter, groupShortId)`,** which re-reads the snapshot and
  POSTs it.
- **Cost stays in line with the live branch's reasoning** (see the header of
  `live.ts`). A change costs one DO request per room it reaches, plus one D1
  read for the group lookup. Idle groups hibernate for free.

**Site:**
- **Extract the socket lifecycle from `LiveBuildListService.watch`** (ping,
  jitter/backoff, visibility, pagehide, `gone` handling) into a generic
  `liveSocket<M>(url, parse, timing)` observable. `LiveBuildListService` and
  a new `LiveGroupListService` are then thin wrappers. Its spec already drives
  a fake socket through `LIVE_SOCKET_FACTORY`/`LIVE_TIMING`, so keep those
  tokens and run the existing spec unchanged against the extraction, as the
  characterization.
- **`LiveGroupListService.watch(shortId, token)` folds messages into a state.**
  A `group` snapshot replaces everything. A `member` message replaces that
  member's `list` only if its `version` is newer, the same rule as today.
- **A `GroupShoppingListService` turns that state into the view.** Like
  `FriendShoppingListService.watch`, it re-derives a member's entries only
  when that member's `blob` changes, and keeps a cache keyed by buildId.
- **No polling, and no Refresh button.** The connection state
  (`live`/`reconnecting`/`offline`) shows in the header the way the
  still-needed page shows it on the live branch.

## Risks and how the plan handles them

1. **Every client must compute the same route.** The route is computed on the
   client. Today it uses the viewer's planner pack filter (`hiddenPacks` in
   `ShoppingListService`) and their own ticks, so two members would see
   different cards. The fix:
   - The group view passes no per-viewer `hiddenPacks`.
   - `routeSettled` comes only from the members' published `needed`.
   - Then `routeSources` is deterministic for everyone. Pin this with a spec:
     the same snapshot gives the same view for any viewer.
   - If the host wants packs hidden, that becomes a group setting next to
     `picks`, not anyone's planner filter.
2. **Cards jumping mid-run.** When someone adds a build, or ticks something,
   the route re-plans and quests can move.
   - Ticks are already handled: `routeSettled` is the existing mechanism that
     keeps ticked things in place, and the group view keeps it.
   - New builds are still a problem. Their needs can pull things into a
     different quest.
   - Mitigations: the host's picks and Arrange order pin things. The group page
     also offers "Re-plan route" (as `resetRoute` does today) rather than
     re-planning silently.
   - A full fix is to freeze the route on the group row when the host locks it.
     That can come later.
3. **Ticking from the group page must not lose trove auto-ticks.** Avoided by
   updating `needed` incrementally (see "Ticking in a group"). If the build has
   unsaved changes open in another tab, the group page still works from the
   saved blob. That is correct, because friends see the saved build.
4. **The daily write cap is per user.** `maxProgressWritesPerUserPerDay`
   (300) is shared across all of a user's builds. A long night ticking for
   three characters could hit it. The debounce batches ticks per build, so 300
   is probably fine, but log the 429 rate after launch before raising it.
5. **Each tick costs an extra D1 read.** Fan-out in `tellFriends` needs one
   lookup of `group_builds`, which is free-tier D1, not KV. Skip it when
   `friendsSeeChange` is false. That is already the gate today.
6. **Groups are short-lived, for hours or days.** There is no host handoff. If
   the host disappears, the others start a new group. Groups idle for 14 days
   are deleted lazily, by `GET /api/groups/mine` and on connect, so old rows
   don't pile up. No cron is needed.
7. **Character names.** A label is unique within a group, but one person may
   add two builds for the same character (say a leveling build and an endgame
   build). Prefill the label as `Name` and, on a clash, suggest `Name (2)`
   instead of refusing it.
8. **Builds edited mid-run.** Entry keys are `g|slot|item…`, so changing an
   item drops that entry's ticks. That's the same as today. The group view
   picks up the new blob through the `member` message, re-derives only that
   build, and shows a brief "Kira's build changed" note so the change doesn't
   pass silently.
9. **The live branch isn't tested yet.** Everything here depends on its rooms.
   Test it end to end first (PR 0): sockets under `wrangler dev`, reconnect
   after a deploy, and the half-closed socket caveat noted in `live.ts`. Any
   flaw there doubles once groups depend on it.

## Suggested PR sequence
0. Rebase onto the live-sync branch, or onto master once it merges.
1. Worker: the migration, constants, `groups.ts` REST routes, and tests.
2. Worker: refactor `ProgressRoom` into a shared base, add `GroupRoom`, the
   group socket route, and fan-out in `tellFriends`/`closeFriends`. Extend
   `worker/test/live.test.ts` and its fakes.
3. Site: characterization specs, then extract `BuildProgressSync` from
   `ServerShoppingProgressStore`. Also extract `liveSocket` from
   `LiveBuildListService`, with its existing spec unchanged.
4. Site: the pure `group-shopping-list.ts`, plus `member`/`members` on
   entries and rows, with specs.
5. Site: `LiveGroupListService`, `GroupShoppingListService`, and the
   `/group/:shortId` lazy page, read-only and live.
6. Site: setup and add-builds dialogs, the "Start a group run" button, and
   the invite flow.
7. Site: ticking your own rows from the group page, the host's Arrange and
   picks, and the member filters.
8. Visual-diff scenes for the group page in `tools/visual-diff`, plus
   CLAUDE.md notes on anything that cost time.

## Verification
- From `site/`, the full gate for each PR: `npx ng test --watch=false` with
  zero failures and zero `ERROR` lines, `npm run lint`, `npm run build`, and
  `npm run admin:build`. Compare the initial bundle size before and after PR 5.
- Run the worker tests (`worker/`, vitest).
  - Permissions: owner, host, another member, and an outsider without the
    token.
  - Limits: the 12-build cap and duplicate character names.
  - Lifecycle: rotating the token closes sockets, and deleting a build removes
    it from its groups.
  - Live: a progress PUT reaches both the build's `ProgressRoom` and each
    `GroupRoom` that build is in, and a wrong token on the socket gets 4404.
- `build-url-codec.property.spec.ts` must stay green. Nothing here changes
  `?b=` payloads.
- Manual end-to-end with `wrangler dev` and `ng serve`, using two browser
  profiles (two accounts). Host creates a group from their shopping list. The
  second account opens the invite link, signs in, and adds two builds with
  character names. Rows show chips per character. Ticking in one profile
  appears in the other within a second or two, with no refresh. Kill the
  network briefly and confirm the page shows reconnecting, then catches up. The host's Arrange order shows for
  both. Removing a build drops its rows.
