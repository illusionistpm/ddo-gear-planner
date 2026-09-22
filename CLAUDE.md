# Working in this repo

Notes for anyone (human or agent) changing this codebase. Only things that are
non-obvious or have caused real bugs - the rest is discoverable from the code.

## Layout

- `site/` — the Angular 22 planner app (projects `site` and `admin`).
- `worker/` — Cloudflare Worker API: saved builds, short links, auth.
- `data-builder/` — Python scrapers that regenerate `site/src/assets/*.json`.
- `shared/constants.json` — values both the site and worker must agree on
  (blob size limits, per-user build caps). Change them **here**, not in either
  copy; see `shared/README.md`.
- `tools/visual-diff/` — before/after screenshot harness for changes that
  should look identical. See its README.

Inside `site/src/app/`, non-component files are grouped by area:

| Folder | Holds |
|---|---|
| `gear/` | the static game model: game data, items, crafting, augment slots, quests |
| `affixes/` | affixes, affix UI, availability, tracked-affix derivation |
| `planner/` | the user's in-progress plan: equipped gear, filters, owned gear, view state |
| `build/` | saved builds, build URLs and slugs, the URL codec, query params, guards |
| `shared/` | auth, analytics, theme, clipboard, perf tracing, a directive and a pipe |

Components keep their own folders. `app.module.ts`, routing, the root component
and `admin-link.component.ts` (named by path in `angular.json`) stay in `app/`.

## Verifying a change

From `site/`, all four:

```sh
npx ng test --watch=false   # Vitest under jsdom, ~560 specs, ~70s
npm run lint                # ESLint over both projects, plus the CSS-colour check
npm run build               # the site project
npm run admin:build         # the admin project - a separate build, easy to forget
```

What "green" means:

- **Zero failures**, and **zero `ERROR` lines in the test log.** The log is
  deliberately clean: a stray `ERROR` means a real problem (usually an async
  callback outliving its TestBed). Don't let that signal rot.
- **No worker crashes.** A `JavaScript heap out of memory` / `Worker forks emitted
  error` line means a file's later specs silently never ran - the pass count
  drops rather than anything failing. Compare the total against the spec count.

## Invariants worth knowing before you refactor

**Build URLs are a compatibility contract.** A `?b=...` payload is stored in D1
for every saved build and lives in every shared link. Changing what
`BuildUrlCodecService.encode` emits breaks links that already exist.
`build-url-codec.property.spec.ts` round-trips a few hundred generated param
records to catch that; treat a failure there as "you changed the wire format".

**Query-param keys belong to `build/build-param-keys.ts`.** It owns the fixed
key names, the `ml_<slot>` / `craft_<n>_<field>` builders and parsers, and the
list that decides whether a URL key is build data at all. A new param that
skips it will be dropped by the codec or leak into view state.

**`Craftable`'s selection strings travel in those URLs**: `"System: Option"`, or
`"System (empty)"` for a system chosen with nothing in it yet. `craftable.spec.ts`
pins every shape. Item copies use `Craftable.clone()` - don't route copies back
through the string form.

**An empty equipment slot is `null`.** It used to be a truthy `Item` with no
name, distinguished by `isValid()`, which caused four separate bugs. The
placeholder and `isValid()` are gone; `EquippedService` stores `Item | null` and
the compiler enforces the check. Don't reintroduce a sentinel object.

**Bootstrap is loaded globally**, from `angular.json`'s styles array, and its
reboot carries `[hidden] { display: none !important }`. Nothing short of
`!important` overrides it, so any rule that reveals a `[hidden]` element needs
its own - which is why `.planner-tab-panel`'s ultrawide rule has always had one.
A rule without it fails silently: the selector matches, the media query matches,
and the element stays hidden. The `col-*` grid classes are Bootstrap's too, and
they are media-queried on the **viewport**, which is wrong for anything sitting
in a narrower column - that was the equipment grid's "cards get tiny before a
column drops" bug. The grid is intrinsic now (`--gear-card-min`); don't
reintroduce `col-sm-*`/`col-md-*`/`col-lg-*` for layout.

**Colours live in `site/src/styles.css` as tokens**, defined per theme. Never put
a colour literal in component CSS: a hardcoded value is a light-mode colour that
silently leaks into dark mode, which is exactly the bug the token sweep removed
from ~97 places. When you need a colour:

1. Look for an existing token — there are ~160, most of them semantic
   (`--danger-color`, `--surface-elevated-color`, `--selected-row-bg`).
2. If none fits, add one to **both** `:root` and `:root.dark-theme`, named for
   what it means rather than what it looks like (`--chip-eliminated-bg`, not
   `--grey-400`). For a translucent tint of an existing colour, use the
   `rgba(var(--primary-color-rgb), 0.1)` pattern.
3. Don't add a `:host-context(.dark-theme)` block to a component. One survives,
   in `equipment-slot-card`, and it swaps tokens rather than hardcoding colours.
4. Verify with `tools/visual-diff` if the change is meant to look identical.

`npm run lint` enforces this: `site/tools/check-css-colors.js` fails on a hex,
`rgb()` or `hsl()` literal in component CSS. It allows `var(--token)`,
`rgba(var(--token-rgb), a)`, and the deliberate `rgba(255,255,255,...)` overlays
on filled buttons - the only literals left in the tree.

## Angular specifics that have bitten us

- **`trackBy` functions run unbound** - a `this.` reference inside one throws at
  render time. One such change broke 16 specs in a single commit.
- **`OnPush` components** here mutate state from async callbacks, so they call
  `cdr.markForCheck()` explicitly. Keep that up in new async paths.
- Specs that drive a component **through its rendered DOM** survive refactors of
  the component's internals; specs that call its methods do not. Prefer the
  former when the point is to pin behaviour before changing structure.

## Specs run under Vitest + jsdom

Tests are `@angular/build:unit-test` with the Vitest runner, not a browser.
Things that behave differently from the Jasmine/Chrome days, and cost real time:

- **`fakeAsync` and `waitForAsync` don't work** - zone.js only wires up its
  ProxyZone for Jasmine/Jest/Mocha, so they throw "Expected to be running in
  'ProxyZone'". Use `async` specs; wait on router work with
  `TestBed.inject(ApplicationRef).whenStable()`.
- **`src/test-setup.ts` is load-bearing**, not boilerplate. It stubs game data,
  the layout APIs jsdom lacks (`ResizeObserver`, `Range` rects), and works
  around two Vitest 4 behaviours that exhaust the heap: `vi.spyOn` mocks are
  retained forever along with the object they spied on (so `vi.spyOn` is
  replaced with a leaner one), and specs no longer yield to the event loop
  (so a `beforeEach` does). Delete those two once `@angular/build` accepts
  Vitest 5, which fixes the first.
- `vi.spyOn` calls through by default, where Jasmine's `spyOn` stubbed
  (returned `undefined`). A spy that must not run the real method needs
  `.mockReturnValue(...)`.
- `toContain` is `===`; use `toContainEqual` for objects. `vi.fn()` mocks of a
  class need a cast (`as unknown as MockedObject<T>`).
- The unit-test builder takes its polyfills from the `build` target and only
  loads `zone.js/testing` if `"zone.js"` is listed there literally. It is, so
  don't move it behind a polyfills file again.

## Conventions

- Commit messages: say plainly when a commit changes behaviour, and why.
- No attribution trailers in commits.
- Tests that pin current behaviour ("characterization tests") are committed
  **before** the refactor they guard, so a revert keeps them.

## Keeping this file current

Add to it when you solve something that cost you real time, in the same commit
as the fix. The bar, because every line here is loaded into context at the start
of every session:

- it cost time twice, or caused a defect, **and**
- it is not discoverable by reading the code or running the gate.

"Angular works like X" doesn't qualify; "this repo's `trackBy` change broke 16
specs because those functions run unbound" does. **Delete entries that go
stale** — the Vitest 4 workarounds above die when Vitest 5 is supported, and
guidance that is no longer true is worse than none. This file was written after
a large cleanup branch; if something here contradicts the code, the code wins,
and the entry should be fixed or removed.
