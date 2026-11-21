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
import { BuildState, evaluate, fillCrafting, legacyObjective, meanFill, NeedIndex, needsMet } from './build-model';
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

interface Profile { name: string; packages: string[]; spellpower?: string[]; extra?: string[] }
const PROFILES: Profile[] = [
  { name: 'Melee (Basic + Melee + Strength)', packages: ['Basic', 'Melee'], extra: ['Strength'] },
  { name: 'Ranged (Basic + Ranged + Dexterity)', packages: ['Basic', 'Ranged'], extra: ['Dexterity'] },
  { name: 'Fire caster (Basic + Caster + Fire + Int + Evocation)', packages: ['Basic', 'Caster'], spellpower: ['Fire'], extra: ['Intelligence', 'Evocation Focus'] },
  { name: 'Healer (Basic + Caster + Healing + Wis)', packages: ['Basic', 'Caster'], spellpower: ['Healing'], extra: ['Wisdom'] },
];

interface RunResult {
  profile: string;
  policy: string;
  needs: number;
  needsMet: number;
  /** Needs met by the items alone, before any crafting slot is filled. */
  needsMetItemsOnly?: number;
  meanFill: number;
  legacy: number;
  items: Record<string, string>;
  /** The need each finished build misses that its augments couldn't make up, by affix. */
  missed: string[];
  firstPicks: string[];
}

function runPolicy(ctx: Ctx, scorer: Scorer, name: string, profile: string): RunResult & { finished: BuildState } {
  let state = new BuildState(ctx.index, ctx.gearDB);
  const firstPicks: string[] = [];
  const open = SLOTS.slice();
  while (open.length) {
    const pick = argmax(ctx, state, open, scorer(ctx, state, open));
    if (!pick) {
      break;
    }
    state = state.clone();
    state.setItem(pick.slot, pick.item);
    open.splice(open.indexOf(pick.slot), 1);
    if (firstPicks.length < 4) {
      firstPicks.push(`${pick.slot}: ${pick.item.name}`);
    }
  }
  // Every policy's build is finished the same way, under the same objective, so the comparison is
  // about which items were picked.
  const finished = fillCrafting(state, ctx.index, meanFill, ctx.maxLevel);
  const values = finished.values;
  const needs = ctx.index.needs;
  return {
    profile,
    policy: name,
    needs: needs.length,
    needsMet: evaluate(needsMet, needs, values),
    needsMetItemsOnly: evaluate(needsMet, needs, state.values),
    meanFill: evaluate(meanFill, needs, values),
    legacy: evaluate(legacyObjective, needs, values) / evaluate(legacyObjective, needs, needs.map(need => need.best)),
    items: Object.fromEntries(Array.from(state.items).map(([slot, item]) => [slot, item.name])),
    missed: needs.filter((need, i) => values[i] < 0.75 * need.best).map(need => `${need.affix} (${need.type})`),
    firstPicks,
    finished,
  };
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

    const setUpProfile = (profile: Profile) => {
      const tracked = new Set<string>(profile.extra ?? []);
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
    };

    const codec = TestBed.inject(BuildUrlCodecService);
    const fixtureOut = process.env['SUGGESTION_EVAL_FIXTURE_OUT'];
    const fixture: Array<Record<string, string>> = [];
    const only = process.env['SUGGESTION_EVAL_POLICIES']?.split(',');
    const results: RunResult[] = [];
    for (const profile of skipRuns ? [] : PROFILES) {
      setUpProfile(profile);
      const index = new NeedIndex(TestBed.inject(AffixService), gearDB, coveredSnapshot(equipped), trackedSnapshot(equipped));
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
        log(`${profile.name} | ${name} | met ${(result.needsMet * 100).toFixed(1)}% of ${result.needs} (items only ${((result.needsMetItemsOnly ?? 0) * 100).toFixed(1)}%) | fill ${(result.meanFill * 100).toFixed(1)}% | legacy ${(result.legacy * 100).toFixed(1)}% | ${((Date.now() - started) / 1000).toFixed(1)}s`);
      }
    }

    // Headroom: improve each profile's best greedy build by swapping one item at a time, each swap
    // judged on the finished build (crafting refilled), until no swap helps. An upper-bound-ish
    // reference for what a whole-build optimizer could reach.
    if (process.env['SUGGESTION_EVAL_LOCAL_SEARCH']) {
      const lsProfiles = PROFILES.filter(p => p.name.startsWith(process.env['SUGGESTION_EVAL_LOCAL_SEARCH']!) || process.env['SUGGESTION_EVAL_LOCAL_SEARCH'] === '1');
      for (const profile of lsProfiles) {
        setUpProfile(profile);
        const index = new NeedIndex(TestBed.inject(AffixService), gearDB, coveredSnapshot(equipped), trackedSnapshot(equipped));
        const ctx: Ctx = { equipped, gearDB, availability, index, maxLevel: LEVEL_RANGE[1] };
        const started = Date.now();
        const seedName = 'per-need fill, augment-aware + discount';
        const seed = runPolicy(ctx, SCORERS.find(([n]) => n === seedName)![1], seedName, profile.name);
        let state = new BuildState(index, gearDB);
        for (const [slot, name] of Object.entries(seed.items)) {
          state.setItem(slot, (gearDB.getFilteredGearBySlot(slot) ?? []).find(item => item.name === name)!);
        }
        const judge = (candidate: BuildState) => {
          const values = fillCrafting(candidate, index, meanFill, ctx.maxLevel).values;
          return evaluate(needsMet, index.needs, values) + evaluate(meanFill, index.needs, values) * 1e-3;
        };
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
            // Shortlist by quick marginal gain before the costly judge.
            const quick = SCORERS.find(([n]) => n === seedName)![1](ctx, without, [slot]);
            const shortlist = candidates(ctx, without, slot)
              .map(item => ({ item, s: quick(item, slot) }))
              .sort((a, b) => b.s - a.s)
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
            log(`  local search ${profile.name}: sweep ${sweeps} ${slot} -> ${(current * 100).toFixed(1)}% (${((Date.now() - started) / 1000).toFixed(0)}s)`);
          }
        }
        const values = fillCrafting(state, index, meanFill, ctx.maxLevel).values;
        const result: RunResult = {
          profile: profile.name, policy: 'local search from best greedy', needs: index.needs.length,
          needsMet: evaluate(needsMet, index.needs, values), meanFill: evaluate(meanFill, index.needs, values),
          legacy: evaluate(legacyObjective, index.needs, values) / evaluate(legacyObjective, index.needs, index.needs.map(n => n.best)),
          items: Object.fromEntries(Array.from(state.items).map(([slot, item]) => [slot, item.name])),
          missed: index.needs.filter((need, i) => values[i] < 0.75 * need.best).map(need => `${need.affix} (${need.type})`),
          firstPicks: [],
        };
        results.push(result);
        log(`${profile.name} | ${result.policy} | met ${(result.needsMet * 100).toFixed(1)}% of ${result.needs} | fill ${(result.meanFill * 100).toFixed(1)}% | legacy ${(result.legacy * 100).toFixed(1)}% | ${((Date.now() - started) / 1000).toFixed(1)}s`);
      }
    }

    // Over-representation: from an empty build, which affixes turn up in each slot's top 20 far more
    // often than among all of that slot's candidates? Ratio > 1 means the scorer favours carriers.
    const overrep: Array<{ profile: string; scorer: string; affix: string; topShare: number; baseShare: number; ratio: number }> = [];
    for (const profile of process.env['SUGGESTION_EVAL_SKIP_OVERREP'] ? [] : PROFILES) {
      setUpProfile(profile);
      const index = new NeedIndex(TestBed.inject(AffixService), gearDB, coveredSnapshot(equipped), trackedSnapshot(equipped));
      const ctx: Ctx = { equipped, gearDB, availability, index, maxLevel: LEVEL_RANGE[1] };
      const empty = new BuildState(index, gearDB);
      for (const [name, scorer] of SCORERS.filter(([n]) => n === 'live getScore' || n.includes('+ discount') && n.startsWith('per-need'))) {
        const score = scorer(ctx, empty, SLOTS);
        const top = new Map<string, number>();
        const all = new Map<string, number>();
        let topCount = 0;
        let allCount = 0;
        for (const slot of SLOTS) {
          const items = candidates(ctx, empty, slot);
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
