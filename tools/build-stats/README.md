# Build stats

What people actually do with the planner, from the saved builds and share
links in D1, and how well the slot suggestions predict it. Two steps:
export (needs Cloudflare access), then analyse (runs locally, offline).

## 1. Export

From the repository root, once `npx wrangler login` has been done in `worker/`:

```sh
node tools/build-stats/export-builds.mjs            # or --no-names to drop build names
```

That writes `tools/build-stats/builds.local.json` (gitignored): each saved
build's blob, name and timestamps, plus share links whose gear no saved build
has. Owners become `u1`, `u2`, ...; emails, display names and user ids are
never read. Build names are kept by default because they often say the class
(useful for grouping later); pass `--no-names` if you'd rather not.

## 2. Analyse

From `site/`:

```sh
SUGGESTION_EVAL_BUILDS=$PWD/../tools/build-stats/builds.local.json \
SUGGESTION_EVAL_REPORT=$PWD/../tools/build-stats/report.local.json \
  npx ng test --watch=false --include src/app/suggestion-eval/real-builds.spec.ts
```

This loads each build into the planner the way its link would
(`src/app/suggestion-eval/real-builds.spec.ts`) and writes an aggregate
report - no names or blobs, so it's safe to share:

- **corpus**: builds decoded, owners, how many are "finished" (9+ slots filled),
  level ranges, how many affixes people track;
- **trackedAffixes / bundles**: what people track;
- **sourcesByAffix / sourceTotals**: for every tracked bonus type a finished
  build covers (3/4 of best or more), where the value comes from - the item's
  own affix, an augment by gem colour, a Sun or Moon gem, another crafting
  system, a set bonus, or non-gear;
- **needCoverage**: per tracked bonus type, how often finished builds cover it -
  low numbers are the needs people want and can't fit;
- **artifactProfaneStrategies / sunMoonSlots**: whether builds take Artifact and
  Profane bonuses from Sun/Moon gems, a set, both or neither;
- **topItemsBySlot / topSets**;
- **leaveOneOut**: for each filled slot of a finished build, empty that slot and
  rank its candidates by each scorer; record where the item the player chose
  lands (mean rank, MRR, hit@1/5/20), overall and per slot.

Leave-one-out is the slow part (every candidate of every slot of every build,
for each scorer). Options, all environment variables:

- `SUGGESTION_EVAL_MIN_ML=28` keeps only builds whose equipped items have a
  median level of 28 or more (the endgame); `SUGGESTION_EVAL_MAX_ML` caps it.
- `SUGGESTION_EVAL_SAMPLE=100` limits leave-one-out to the first 100 finished
  builds. The other statistics still use every build.
- `SUGGESTION_EVAL_POLICIES="live getScore|planned artifact"` limits the
  scorers, by name substring, several separated by `|`.
- `SUGGESTION_EVAL_LOG=<file>` appends a line per leave-one-out build, to
  follow a long run.
- `SUGGESTION_EVAL_SLOTS=Helm|Cloak` ranks only those slots, and
  `SUGGESTION_EVAL_DETAIL=1` (with a log) logs where each player's item
  ranked and each scorer's top 3. `SUGGESTION_EVAL_SPLIT=1` adds the app
  scorer's top 25, each with its score without crafting slots.
- `SUGGESTION_EVAL_SHARD=k/n` ranks only every nth build from the kth, so n
  processes can split the work (the machine needs a core each). Merge their
  reports with `python3 tools/build-stats/merge-loo.py shard-0.json shard-1.json ...`.
  100 endgame builds and three scorers took about 25 minutes over 3 shards.

Caveat for leave-one-out: players who followed the suggestions will have
picked what the live scorer ranked well, which flatters it. Compare scorers
per slot, and weigh builds whose tracked list and gear disagree with the
suggestions (the hand-picked ones) as the more telling.

## The synthetic harness

`src/app/suggestion-eval/suggestion-eval.spec.ts` needs no export. It
simulates a player filling an empty level 28-34 build from the suggestions,
for four tracked-affix profiles. Each build takes exactly one minor artifact,
chosen as its own decision. The harness fills every crafting slot greedily and
reports total value (each affix's values summed over its bonus types, as a
share of its best, times its weight - the live scorer's own objective). It
also reports which affixes are over-represented in each slot's top 20
suggestions, artifacts left out.

```sh
SUGGESTION_EVAL=1 SUGGESTION_EVAL_LOG=/tmp/eval.log \
  npx ng test --watch=false --include src/app/suggestion-eval/suggestion-eval.spec.ts
```

Both specs are skipped in the normal test run unless their variable is set.

## Game-data scripts

These two read `data/*.json` only, with no export needed:

- `affix-sources.py data rows.json`: for each bonus type of the affixes in
  the common bundles, at level 28-34, which item slots carry it near its best
  value, which augment colours do (and in how many slots), and which sets.
  Each row is classed floating / Sun-Moon / slot-bound / limited / set-only.
- `artifact-profane-strategies.py data`: for four tracked profiles, how many
  tracked Artifact and Profane needs Sun/Moon gems alone cover, against each
  set plus gems in the gem slots it leaves free.
- `expert-check.py data`: compares an expert's priorities
  (`lominal-priorities.json`, transcribed from Lominal's "Gearing at cap"
  tables) with the data. For each effect he lists, it checks whether it's
  augmentable and how hard it is to find (by slots, as the planner does today,
  and by items), and where the data agrees with his colour code. The
  suggestion harness reads the same JSON to score builds by his tiers
  (critical 3, strong 2, filler 1) and to build profiles from his lists.
- `bundle-usage.py builds.local.json [--coverage report.json]`: how saved
  builds use the affix bundles. It compares each build with the bundles as
  they were when it was created (from git history; needs a full clone, not a
  shallow one). It reports, per bundle, what adopters drop, what they added by
  hand before the bundle had it, and what they add that no bundle has. With a
  real-builds report it also lists how often tracked affixes are actually
  covered.
