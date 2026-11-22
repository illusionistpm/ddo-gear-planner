/**
 * Suggestion evaluation harness - not a test. Skipped unless SUGGESTION_EVAL is set:
 *
 *   SUGGESTION_EVAL=1 npx ng test --watch=false --include src/app/suggestion-eval/suggestion-eval.spec.ts
 *
 * Simulates a player filling an empty build one item at a time from the planner's slot suggestions,
 * for a few tracked-affix profiles, then fills every crafting slot greedily and measures how much of
 * what the player tracks the finished build covers. Compares the live scorer (EquippedService.getScore)
 * with alternative policies. Writes a JSON report to SUGGESTION_EVAL_OUT (default: stdout summary only).
 */
import { appendFileSync, writeFileSync } from 'node:fs';
import { TestBed } from '@angular/core/testing';

import { AffixPackagesService } from '../affixes/affix-packages.service';
import { AffixAvailabilityService } from '../affixes/affix-availability.service';
import { AffixService } from '../affixes/affix.service';
import { GearDbService } from '../gear/gear-db.service';
import { EquippedService } from '../planner/equipped.service';
import { FiltersService } from '../planner/filters.service';
import { BehaviorSubject } from 'rxjs';
import { BuildUrlCodecService } from '../build/build-url-codec.service';
import { QueryParamRecord } from '../build/query-param-types';
import { BuildState, evaluate, expertObjective, fillCrafting, legacyObjective, meanFill, NeedIndex, needsMet } from './build-model';
import { applyExpertWeights, expertAffixes, expertWeights } from './expert-priorities';
import { argmax, candidates, Ctx, Scorer, SCORERS } from './policies';
import { Item } from '../gear/item';

const LOG = process.env['SUGGESTION_EVAL_LOG'];
function log(line: string) {
  console.log(line);
  if (LOG) {
    appendFileSync(LOG, line + '\n');
  }
}

const ENABLED = !!process.env['SUGGESTION_EVAL'];
const LEVEL_RANGE: [number, number] = [28, 34];
const SLOTS = ['Armor', 'Belt', 'Boots', 'Bracers', 'Cloak', 'Gloves', 'Goggles', 'Helm', 'Necklace', 'Ring1', 'Ring2', 'Trinket'];

/**
 * A tracked-affix profile: bundles plus extras, or (`expertOnly`) exactly the affixes an expert's
 * list names. `expert` scores finished builds against that role's priorities as well.
 */
interface Profile {
  name: string;
  packages: string[];
  spellpower?: string[];
  extra?: string[];
  expert?: string;
  expertOnly?: boolean;
}
const ALL_PROFILES: Profile[] = [
  { name: 'Melee (Basic + Melee + Strength)', packages: ['Basic', 'Melee'], extra: ['Strength'], expert: 'Melee' },
  { name: 'Ranged (Basic + Ranged + Dexterity)', packages: ['Basic', 'Ranged'], extra: ['Dexterity'], expert: 'Ranged' },
  { name: 'Fire caster (Basic + Caster + Fire + Int + Evocation)', packages: ['Basic', 'Caster'], spellpower: ['Fire'], extra: ['Intelligence', 'Evocation Focus'] },
  { name: 'Healer (Basic + Caster + Healing + Wis)', packages: ['Basic', 'Caster'], spellpower: ['Healing'], extra: ['Wisdom'], expert: 'Healer' },
  { name: 'Lominal melee', packages: [], expert: 'Melee', expertOnly: true },
  { name: 'Lominal ranged', packages: [], expert: 'Ranged', expertOnly: true },
  { name: 'Lominal healer', packages: [], expert: 'Healer', expertOnly: true },
];
// SUGGESTION_EVAL_PROFILES picks profiles by name substring, several separated by |.
const PROFILES = ALL_PROFILES.filter(profile =>
  !process.env['SUGGESTION_EVAL_PROFILES'] || process.env['SUGGESTION_EVAL_PROFILES'].split('|').some(p => profile.name.includes(p)));

interface RunResult {
  profile: string;
  policy: string;
  needs: number;
  /** Total value (see legacyObjective) as a share of every need at its best: the headline number. */
  value: number;
  /** The same for the items alone, before any crafting slot is filled. */
  valueItemsOnly: number;
  /** The expert's priorities (see expert-priorities.ts) as a share of every listed type at its best, where the profile has an expert. */
  expert?: number;
  needsMet: number;
  meanFill: number;
  items: Record<string, string>;
  artifact: string;
  /** The artifacts the scorer liked best for this build, with what each swap gained. */
  artifactShortlist: string[];
  /** Per tracked affix, the share of its best total the finished build reaches. */
  affixTotals: Record<string, number>;
  firstPicks: string[];
}

/** Every policy's build is finished the same way, so the comparison is about the items picked. */
const FINISH_OBJECTIVE = legacyObjective;

function greedy(ctx: Ctx, scorer: Scorer, start: BuildState, open: string[], picks: string[]): BuildState {
  let state = start;
  open = open.slice();
  while (open.length) {
    const pick = argmax(ctx, state, open, scorer(ctx, state, open), 'none');
    if (!pick) {
      break;
    }
    state = state.clone();
    state.setItem(pick.slot, pick.item);
    open.splice(open.indexOf(pick.slot), 1);
    picks.push(`${pick.slot}: ${pick.item.name}`);
  }
  return state;
}

/**
 * A minor artifact is a given in any endgame build, so each policy takes exactly one, as its own
 * decision: fill the build without artifacts, find the artifact whose swap into its slot the scorer
 * rates highest, then refill the other slots around it.
 */
function runPolicy(ctx: Ctx, scorer: Scorer, name: string, profile: string): RunResult & { finished: BuildState } {
  const firstPicks: string[] = [];
  const draft = greedy(ctx, scorer, new BuildState(ctx.index, ctx.gearDB), SLOTS, firstPicks);

  const swaps: Array<{ slot: string; item: Item; gain: number }> = [];
  for (const slot of SLOTS) {
    const without = draft.clone();
    without.items.delete(slot);
    without.recompute();
    const score = scorer(ctx, without, [slot]);
    const current = draft.items.get(slot);
    const baseline = current ? score(current, slot) : 0;
    for (const item of candidates(ctx, without, slot, 'only')) {
      swaps.push({ slot, item, gain: score(item, slot) - baseline });
    }
  }
  swaps.sort((a, b) => b.gain - a.gain);
  let state = new BuildState(ctx.index, ctx.gearDB);
  const artifact = swaps[0];
  if (artifact) {
    state.setItem(artifact.slot, artifact.item);
  }
  state = greedy(ctx, scorer, state, SLOTS.filter(slot => slot !== artifact?.slot), []);

  return summarise(ctx, state, name, profile, {
    artifact: artifact ? `${artifact.slot}: ${artifact.item.name}` : '(none)',
    artifactShortlist: swaps.slice(0, 5).map(swap => `${swap.slot}: ${swap.item.name} (+${swap.gain.toFixed(2)})`),
    firstPicks: firstPicks.slice(0, 4),
  });
}

/** Finishes a build's crafting and measures it. */
function summarise(ctx: Ctx, state: BuildState, policy: string, profile: string,
                   extra: Pick<RunResult, 'artifact' | 'artifactShortlist' | 'firstPicks'>): RunResult & { finished: BuildState } {
  const finished = fillCrafting(state, ctx.index, FINISH_OBJECTIVE, ctx.maxLevel);
  const values = finished.values;
  const needs = ctx.index.needs;
  const best = needs.map(need => need.best);
  const share = (vs: number[]) => evaluate(legacyObjective, needs, vs) / evaluate(legacyObjective, needs, best);
  const affixTotals: Record<string, number> = {};
  const affixBest: Record<string, number> = {};
  needs.forEach((need, i) => {
    affixTotals[need.affix] = (affixTotals[need.affix] ?? 0) + Math.min(values[i], need.best);
    affixBest[need.affix] = need.affixBest;
  });
  for (const affix of Object.keys(affixTotals)) {
    affixTotals[affix] = +(affixTotals[affix] / affixBest[affix]).toFixed(2);
  }
  return {
    profile,
    policy,
    needs: needs.length,
    value: share(values),
    valueItemsOnly: share(state.values),
    ...(needs.some(need => need.expertWeight) ? {
      expert: evaluate(expertObjective, needs, values) / evaluate(expertObjective, needs, best),
    } : {}),
    needsMet: evaluate(needsMet, needs, values),
    meanFill: evaluate(meanFill, needs, values),
    items: Object.fromEntries(Array.from(state.items).map(([slot, item]) => [slot, item.name])),
    affixTotals,
    ...extra,
    finished,
  };
}

function describeResult(result: RunResult, seconds: number) {
  return `${result.profile} | ${result.policy} | value ${(result.value * 100).toFixed(1)}% (items only ${(result.valueItemsOnly * 100).toFixed(1)}%)`
    + (result.expert !== undefined ? ` | expert ${(result.expert * 100).toFixed(1)}%` : '')
    + ` | needs met ${(result.needsMet * 100).toFixed(1)}% | artifact ${result.artifact} | ${seconds.toFixed(1)}s`;
}

function trackedSnapshot(equipped: EquippedService): Set<string> {
  return new Set(equipped.getImportantAffixes());
}

function coveredSnapshot(equipped: EquippedService) {
  let snapshot = new Map<string, Array<{ bonusType: string; value: number }>>();
  equipped.getCoveredAffixes().subscribe(map => snapshot = map).unsubscribe();
  return snapshot;
}

describe.skipIf(!ENABLED)('suggestion evaluation', () => {
  it('compares suggestion policies on synthetic profiles', () => {
    const skipRuns = !!process.env['SUGGESTION_EVAL_SKIP_RUNS'];
    TestBed.configureTestingModule({});
    const filters = TestBed.inject(FiltersService);
    // After GearDbService exists: creating it sets the filters' max level, which resets the range.
    const gearDB = TestBed.inject(GearDbService);
    filters.setLevelRange(...LEVEL_RANGE);
    let applied: number[] = [];
    filters.getItemFilters().subscribe(f => applied = f.levelRange).unsubscribe();
    expect(applied).toEqual(LEVEL_RANGE);
    const equipped = TestBed.inject(EquippedService);
    const availability = TestBed.inject(AffixAvailabilityService);
    const packages = TestBed.inject(AffixPackagesService);

    const setUpProfile = (profile: Profile): NeedIndex => {
      const tracked = new Set<string>(profile.extra ?? []);
      if (profile.expertOnly && profile.expert) {
        expertAffixes(profile.expert).forEach(affix => tracked.add(affix));
      }
      for (const name of profile.packages) {
        packages.packages.get(name)?.forEach(affix => tracked.add(affix));
      }
      for (const name of profile.spellpower ?? []) {
        packages.spellpowerPackages.get(name)?.forEach(affix => tracked.add(affix));
      }
      for (const slot of SLOTS) {
        equipped.clearSlot(slot);
      }
      equipped.setImportantAffixes(Array.from(tracked));
      const index = new NeedIndex(TestBed.inject(AffixService), gearDB, coveredSnapshot(equipped), trackedSnapshot(equipped));
      if (profile.expert) {
        applyExpertWeights(index, expertWeights(profile.expert, gearDB));
      }
      return index;
    };

    const codec = TestBed.inject(BuildUrlCodecService);
    const fixtureOut = process.env['SUGGESTION_EVAL_FIXTURE_OUT'];
    const fixture: Array<Record<string, string>> = [];
    const only = process.env['SUGGESTION_EVAL_POLICIES']?.split('|');
    const results: RunResult[] = [];
    for (const profile of skipRuns ? [] : PROFILES) {
      const index = setUpProfile(profile);
      const ctx: Ctx = { equipped, gearDB, availability, index, maxLevel: LEVEL_RANGE[1] };

      for (const [name, scorer] of SCORERS) {
        if (only && !only.some(o => name.includes(o))) {
          continue;
        }
        const started = Date.now();
        const { finished, ...result } = runPolicy(ctx, scorer, name, profile.name);
        results.push(result);
        if (fixtureOut) {
          // Encode the finished build, crafting and all, the way a saved build is stored, as a
          // stand-in export for real-builds.spec.ts.
          for (const slot of SLOTS) {
            equipped.clearSlot(slot);
          }
          for (const item of finished.items.values()) {
            equipped.set(item);
          }
          equipped._updateRouterState();
          filters._updateRouterState();
          // QueryParamsService only collects these once the router's first navigation is done, which
          // never happens here, so read each service's own record (both are private BehaviorSubjects).
          const record = {
            ...(filters['params'] as unknown as BehaviorSubject<QueryParamRecord>).getValue(),
            ...(equipped['params'] as unknown as BehaviorSubject<QueryParamRecord>).getValue(),
          };
          fixture.push({ source: 'saved', owner: `u${fixture.length % 3}`, name: `${profile.name} / ${name}`,
            blob: codec.encode(record), createdAt: new Date().toISOString() });
        }
        log(describeResult(result, (Date.now() - started) / 1000));
        log(`    artifact shortlist: ${result.artifactShortlist.join('; ')}`);
      }
    }

    // Headroom: improve each profile's best greedy build by swapping one item at a time, each swap
    // judged on the finished build (crafting refilled), until no swap helps. An upper-bound-ish
    // reference for what a whole-build optimizer could reach.
    if (process.env['SUGGESTION_EVAL_LOCAL_SEARCH']) {
      const lsProfiles = PROFILES.filter(p => p.name.startsWith(process.env['SUGGESTION_EVAL_LOCAL_SEARCH']!) || process.env['SUGGESTION_EVAL_LOCAL_SEARCH'] === '1');
      for (const profile of lsProfiles) {
        const index = setUpProfile(profile);
        const ctx: Ctx = { equipped, gearDB, availability, index, maxLevel: LEVEL_RANGE[1] };
        const started = Date.now();
        const seedName = 'total value, augment-aware + discount';
        const seedScorer = SCORERS.find(([n]) => n === seedName)![1];
        const seed = runPolicy(ctx, seedScorer, seedName, profile.name);
        let state = new BuildState(index, gearDB);
        for (const [slot, name] of Object.entries(seed.items)) {
          state.setItem(slot, (gearDB.getFilteredGearBySlot(slot) ?? []).find(item => item.name === name)!);
        }
        const judge = (candidate: BuildState) =>
          evaluate(FINISH_OBJECTIVE, index.needs, fillCrafting(candidate, index, FINISH_OBJECTIVE, ctx.maxLevel).values);
        let current = judge(state);
        let improved = true;
        let sweeps = 0;
        while (improved && sweeps < 2) {
          improved = false;
          sweeps++;
          for (const slot of SLOTS) {
            const without = state.clone();
            without.items.delete(slot);
            without.recompute();
            // Keep exactly one artifact: an artifact's slot takes another artifact, any other slot none.
            const rule = state.items.get(slot)?.artifact ? 'only' : 'none';
            // Shortlist by quick marginal gain before the costly judge.
            const quick = seedScorer(ctx, without, [slot]);
            const shortlist = candidates(ctx, without, slot, rule)
              .map(item => ({ item, s: quick(item, slot) }))
              .sort((x, y) => y.s - x.s)
              .slice(0, 12);
            for (const { item } of shortlist) {
              if (item.name === state.items.get(slot)?.name) {
                continue;
              }
              const trial = without.clone();
              trial.setItem(slot, item);
              const score = judge(trial);
              if (score > current + 1e-9) {
                current = score;
                state = trial;
                improved = true;
              }
            }
            log(`  local search ${profile.name}: sweep ${sweeps} ${slot} (${((Date.now() - started) / 1000).toFixed(0)}s)`);
          }
        }
        const artifactSlot = Array.from(state.items).find(([, item]) => item.artifact);
        const result = summarise(ctx, state, 'local search from best greedy', profile.name, {
          artifact: artifactSlot ? `${artifactSlot[0]}: ${artifactSlot[1].name}` : '(none)', artifactShortlist: [], firstPicks: [],
        });
        const plain: RunResult = { ...result };
        delete (plain as Partial<typeof result>).finished;
        results.push(plain);
        log(describeResult(plain, (Date.now() - started) / 1000));
      }
    }

    // Over-representation: from an empty build, which affixes turn up in each slot's top 20 far more
    // often than among all of that slot's candidates? Ratio > 1 means the scorer favours carriers.
    const overrepOnly = process.env['SUGGESTION_EVAL_POLICIES']?.split('|');
    const overrep: Array<{ profile: string; scorer: string; affix: string; topShare: number; baseShare: number; ratio: number }> = [];
    for (const profile of process.env['SUGGESTION_EVAL_SKIP_OVERREP'] ? [] : PROFILES) {
      const index = setUpProfile(profile);
      const ctx: Ctx = { equipped, gearDB, availability, index, maxLevel: LEVEL_RANGE[1] };
      const empty = new BuildState(index, gearDB);
      for (const [name, scorer] of SCORERS.filter(([n]) => !overrepOnly || overrepOnly.some(o => n.includes(o)))
        .filter(([n]) => n === 'live getScore' || n.startsWith('total value, augment-aware'))) {
        const score = scorer(ctx, empty, SLOTS);
        const top = new Map<string, number>();
        const all = new Map<string, number>();
        let topCount = 0;
        let allCount = 0;
        for (const slot of SLOTS) {
          // Artifacts are a separate decision (one per build), so rank the rest.
          const items = candidates(ctx, empty, slot, 'none');
          const ranked = items.map(item => ({ item, s: score(item, slot) })).sort((a, b) => b.s - a.s).slice(0, 20);
          const count = (list: Item[], into: Map<string, number>) => {
            for (const item of list) {
              const tracked = new Set(item.affixes.filter(a => equipped.isImportantAffix(a.name)).map(a => a.name));
              tracked.forEach(affix => into.set(affix, (into.get(affix) ?? 0) + 1));
            }
          };
          count(ranked.map(r => r.item), top);
          count(items, all);
          topCount += ranked.length;
          allCount += items.length;
        }
        for (const [affix, n] of top) {
          const topShare = n / topCount;
          const baseShare = (all.get(affix) ?? 0) / allCount;
          overrep.push({ profile: profile.name, scorer: name, affix, topShare, baseShare, ratio: topShare / baseShare });
        }
        const sorted = overrep.filter(r => r.profile === profile.name && r.scorer === name).sort((a, b) => b.topShare - a.topShare).slice(0, 12);
        log(`TOP20 ${profile.name} | ${name} | ` + sorted.map(r => `${r.affix} ${(r.topShare * 100).toFixed(0)}% (x${r.ratio.toFixed(1)})`).join(', '));
      }
    }
    const overrepOut = process.env['SUGGESTION_EVAL_OVERREP_OUT'];
    if (overrepOut) {
      writeFileSync(overrepOut, JSON.stringify(overrep, null, 1));
    }

    if (fixtureOut) {
      writeFileSync(fixtureOut, JSON.stringify({ exportedAt: new Date().toISOString(), builds: fixture }, null, 1));
    }
    const out = process.env['SUGGESTION_EVAL_OUT'];
    if (out) {
      writeFileSync(out, JSON.stringify(results, null, 1));
    }
    expect(results.length + overrep.length).toBeGreaterThan(0);
  }, 3_600_000);
});
