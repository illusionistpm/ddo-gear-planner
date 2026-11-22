/**
 * What saved builds actually do - not a test. Skipped unless SUGGESTION_EVAL_BUILDS names an export
 * from tools/build-stats/export-builds.mjs:
 *
 *   SUGGESTION_EVAL_BUILDS=$PWD/../tools/build-stats/builds.local.json \
 *   SUGGESTION_EVAL_REPORT=$PWD/../tools/build-stats/report.json \
 *     npx ng test --watch=false --include src/app/suggestion-eval/real-builds.spec.ts
 *
 * Loads each build into the planner exactly as its link would, then records:
 *  - what people track, and which bundles;
 *  - for each tracked bonus type a build has covered (3/4 of best or more), where it comes from: an
 *    item's own affix, an augment (by colour, Sun, Moon), another crafting system, a set, non-gear;
 *  - how each build gets Artifact and Profane bonuses: Sun/Moon gems or set bonuses;
 *  - the most used items per slot and sets;
 *  - leave-one-out: for each filled slot of a well-filled build, empty it and see where the item the
 *    player chose ranks among that slot's suggestions, under the live scorer and the alternatives.
 *
 * The report is aggregate only - no build names or blobs - so it can be shared.
 * SUGGESTION_EVAL_SAMPLE=n limits leave-one-out to n builds (it's the slow part).
 */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { TestBed } from '@angular/core/testing';

import { AffixAvailabilityService } from '../affixes/affix-availability.service';
import { AffixPackagesService } from '../affixes/affix-packages.service';
import { AffixService } from '../affixes/affix.service';
import { BuildUrlCodecService } from '../build/build-url-codec.service';
import { TRACKED_KEY } from '../build/build-param-keys';
import type { ParamsAdapter } from '../build/query-params.service';
import { GearDbService } from '../gear/gear-db.service';
import { Item } from '../gear/item';
import { EquippedService } from '../planner/equipped.service';
import { FiltersService } from '../planner/filters.service';
import { BuildState, NeedIndex } from './build-model';
import { Ctx, liveScorer, SCORERS } from './policies';

const BUILDS_FILE = process.env['SUGGESTION_EVAL_BUILDS'];
const REPORT_FILE = process.env['SUGGESTION_EVAL_REPORT'];
const SAMPLE = Number(process.env['SUGGESTION_EVAL_SAMPLE'] || 0);
const ONLY_SCORERS = process.env['SUGGESTION_EVAL_POLICIES']?.split('|');
/** A build with at least this many of its slots filled counts as a finished build for the source and LOO stats. */
const MIN_FILLED = 9;
/**
 * SUGGESTION_EVAL_SHARD=k/n runs leave-one-out on every nth finished build from the kth (0-based),
 * so n processes can split it. Each writes the same statistics; merge their leave-one-out results.
 */
const [SHARD, SHARD_COUNT] = (process.env['SUGGESTION_EVAL_SHARD'] ?? '0/1').split('/').map(Number);
/** A file to append a line to per leave-one-out build, to follow a long run. */
const PROGRESS = process.env['SUGGESTION_EVAL_LOG'];
/**
 * Only builds whose equipped items' median minimum level is in this range (both default to all):
 * SUGGESTION_EVAL_MIN_ML=28 keeps endgame builds. Heroic and epic builds use different sets and
 * have no Sun or Moon slots, so mixing them in muddies most of the statistics.
 */
const MIN_ML = Number(process.env['SUGGESTION_EVAL_MIN_ML'] || 0);
const MAX_ML = Number(process.env['SUGGESTION_EVAL_MAX_ML'] || 99);

interface ExportedBuild { source: 'saved' | 'share'; owner: string | null; name?: string; blob: string; createdAt: string }

function adapterFor(record: Record<string, string | string[]>): ParamsAdapter {
  return {
    keys: Object.keys(record),
    get: key => {
      const value = record[key];
      return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
    },
    getAll: key => {
      const value = record[key];
      return Array.isArray(value) ? value : (value === undefined ? [] : [value]);
    },
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

class Counter<K> {
  readonly counts = new Map<K, number>();
  add(key: K, by = 1) {
    this.counts.set(key, (this.counts.get(key) ?? 0) + by);
  }
  top(n: number): Array<[K, number]> {
    return Array.from(this.counts).sort((a, b) => b[1] - a[1]).slice(0, n);
  }
}

/** Where a covered need's value comes from, as a label. */
function sourceLabel(item: Item | null, augmentName: string | undefined, affixName: string, bonusType: string, affixSvc: AffixService): string {
  if (!item) {
    return 'item';
  }
  if (augmentName) {
    const craftable = (item.crafting ?? []).find(c => c.selected?.describe(true, false) === augmentName);
    const system = craftable ? (craftable.selectedCraftingSystemName || craftable.name) : '';
    if (system === 'Sun Augment Slot') {
      return 'Sun gem';
    }
    if (system === 'Moon Augment Slot') {
      return 'Moon gem';
    }
    // The gem's own colour, not the slot's: a Blue gem in a Purple slot is a Blue augment.
    const colour = augmentColour(item, augmentName);
    return `augment (${colour ?? system.replace(' Augment Slot', '')})`;
  }
  const native = affixSvc.flattenAffixGroups(item.affixes, true)
    .some(affix => affixSvc.resolvesToAffix(affix.name, affixName) && affix.type === bonusType);
  if (native) {
    return 'item';
  }
  const crafted = (item.crafting ?? []).find(c => c.selected?.affixes.some(a => affixSvc.resolvesToAffix(a.name, affixName) && a.type === bonusType));
  return crafted ? `crafting (${crafted.name.replace(/ \(.*\)$/, '')})` : 'item bonus (mythic/reaper)';
}

let colourByAugment: Map<string, string> | null = null;
function augmentColour(item: Item, augmentName: string): string | undefined {
  if (!colourByAugment) {
    colourByAugment = new Map();
    const gearDB = TestBed.inject(GearDbService);
    for (const colour of ['Colorless', 'Blue', 'Yellow', 'Red', 'Green', 'Purple', 'Orange']) {
      // Only the unmerged lists are wanted, so walk the raw data rather than the merged craftables.
      const raw = (gearDB as unknown as { gameData: { crafting: Record<string, Record<string, Array<{ name?: string }>>> } })
        .gameData.crafting[`${colour} Augment Slot`]?.['*'] ?? [];
      for (const option of raw) {
        if (option.name && !colourByAugment.has(option.name)) {
          colourByAugment.set(option.name, colour);
        }
      }
    }
  }
  const name = augmentName.replace(/ \(ML \d+\)$/, '');
  return colourByAugment.get(name) ?? colourByAugment.get(augmentName);
}

describe.skipIf(!BUILDS_FILE)('real builds', () => {
  it('analyses exported builds', () => {
    const exported: { builds: ExportedBuild[] } = JSON.parse(readFileSync(BUILDS_FILE!, 'utf8'));
    TestBed.configureTestingModule({});
    const codec = TestBed.inject(BuildUrlCodecService);
    const filters = TestBed.inject(FiltersService);
    const gearDB = TestBed.inject(GearDbService);
    const equipped = TestBed.inject(EquippedService);
    const affixSvc = TestBed.inject(AffixService);
    const availability = TestBed.inject(AffixAvailabilityService);
    const packages = TestBed.inject(AffixPackagesService);
    const slotNames = equipped.getSlotNames();

    const corpus = { total: exported.builds.length, decoded: 0, failed: 0, outsideLevelRange: 0, finished: 0, owners: new Set<string>() };
    const medianMlHistogram = new Counter<number>();
    const filledHistogram = new Counter<number>();
    const maxLevelHistogram = new Counter<number>();
    const tracked = new Counter<string>();
    const bundles = new Counter<string>();
    const trackedCountHistogram = new Counter<number>();
    // affix -> label -> weight (a need covered by n tied sources gives each 1/n)
    const sources = new Map<string, Counter<string>>();
    const sourceTotals = new Counter<string>();
    const needsCovered = new Counter<string>(); // affix|type -> builds covering it
    const needsTracked = new Counter<string>(); // affix|type -> builds tracking it (finished builds)
    const strategies = new Counter<string>();
    const gemCounts = new Counter<string>();
    const gems = new Counter<string>();
    const typedSets = new Counter<string>();
    const sunSlotUse = new Counter<string>();
    const itemsBySlot = new Map<string, Counter<string>>();
    const sets = new Counter<string>();
    type Loo = { rankSum: Record<string, number>; rr: Record<string, number>; hit1: Record<string, number>; hit5: Record<string, number>; hit20: Record<string, number>; n: number; missing: number };
    const looBySlot = new Map<string, Loo>();
    const looAll: Loo = { rankSum: {}, rr: {}, hit1: {}, hit5: {}, hit20: {}, n: 0, missing: 0 };
    let looBuilds = 0;

    const scorers = SCORERS.filter(([name]) => !ONLY_SCORERS || ONLY_SCORERS.some(o => name.includes(o)));

    for (const build of exported.builds) {
      const params = codec.decode(build.blob);
      if (!params) {
        corpus.failed++;
        continue;
      }
      corpus.decoded++;
      const adapter = adapterFor(params);
      filters.updateFromParams(adapter);
      equipped.updateFromParams(adapter);

      const slots = equipped.getSlotsSnapshot();
      const filled = slotNames.filter(slot => slots.get(slot));
      const levels = filled.map(slot => slots.get(slot)!.ml).sort((a, b) => a - b);
      const medianMl = levels.length ? levels[Math.floor(levels.length / 2)] : 0;
      medianMlHistogram.add(medianMl);
      if (medianMl < MIN_ML || medianMl > MAX_ML) {
        corpus.outsideLevelRange++;
        continue;
      }
      if (build.owner) {
        corpus.owners.add(build.owner);
      }
      filledHistogram.add(filled.length);
      const maxLevel = filters.getMaxLevel();
      let levelRange: [number, number] = [1, maxLevel];
      filters.getItemFilters().subscribe(f => levelRange = f.levelRange as [number, number]).unsubscribe();
      maxLevelHistogram.add(levelRange[1]);

      const picked = adapter.getAll(TRACKED_KEY);
      trackedCountHistogram.add(Math.min(100, Math.round(picked.length / 5) * 5));
      picked.forEach(affix => tracked.add(affix));
      const pickedSet = new Set(picked.map(a => affixSvc.getCanonicalName(a)));
      for (const [name, list] of [...packages.packages, ...packages.spellpowerPackages]) {
        if (list.length && list.every(a => pickedSet.has(a))) {
          bundles.add(name);
        }
      }

      for (const slot of filled) {
        const item = slots.get(slot)!;
        const counter = itemsBySlot.get(slot) ?? new Counter<string>();
        counter.add(item.name);
        itemsBySlot.set(slot, counter);
      }
      for (const [set, pieces] of equipped.getActiveSets()) {
        if (gearDB.getSetBonus(set, pieces).length) {
          sets.add(set);
        }
      }

      if (filled.length < MIN_FILLED) {
        continue;
      }
      corpus.finished++;

      // Sources of every covered need.
      const covered = coveredSnapshot(equipped);
      for (const [affix, types] of covered) {
        for (const { bonusType } of types) {
          const best = gearDB.getBestValueForAffixType(affix, bonusType);
          if (!(best > 0) || equipped.isAffixTypeIgnored(affix, bonusType)) {
            continue;
          }
          needsTracked.add(`${affix}|${bonusType}`);
          const value = equipped.getCurrentValueForAffixType(affix, bonusType);
          if (value < best * 0.75) {
            continue;
          }
          needsCovered.add(`${affix}|${bonusType}`);
          const found = equipped.getSourcesForAffixType(affix, bonusType);
          const counter = sources.get(affix) ?? new Counter<string>();
          for (const source of found) {
            const label = source.kind === 'item'
              ? sourceLabel(slots.get(source.slot) ?? null, source.augmentName, affix, bonusType, affixSvc)
              : source.kind === 'set' ? `set (${bonusType === 'Artifact' || bonusType === 'Profane' ? bonusType : 'other'})` : source.kind;
            counter.add(label, 1 / found.length);
            sourceTotals.add(label, 1 / found.length);
          }
          sources.set(affix, counter);
        }
      }

      // Artifact / Profane strategy.
      const sunItems = filled.filter(slot => slots.get(slot)!.crafting?.some(c => c.name === 'Sun Augment Slot'));
      const moonItems = filled.filter(slot => slots.get(slot)!.crafting?.some(c => c.name === 'Moon Augment Slot'));
      const gemmed = (name: string) => filled.filter(slot => slots.get(slot)!.crafting?.some(c => c.name === name && c.selected?.affixes.length)).length;
      // Gear sets only: filigree sets (Tough Shields...) give Artifact bonuses too, but take no gear slot.
      const activeTypes = (type: string) => Array.from(equipped.getActiveSets())
        .filter(([set]) => (gearDB.findSlotsForSet(set) ?? []).length > 0)
        .filter(([set, pieces]) => gearDB.getSetBonus(set, pieces).some(a => a.type === type)).map(([set]) => set);
      const artifactSets = activeTypes('Artifact');
      const profaneSets = activeTypes('Profane');
      const describe = (gems: number, setsOfType: string[]) =>
        gems && setsOfType.length ? 'both' : gems ? `gems (${gems})` : setsOfType.length ? 'set' : 'neither';
      strategies.add(`Artifact: ${describe(gemmed('Sun Augment Slot'), artifactSets)} | Profane: ${describe(gemmed('Moon Augment Slot'), profaneSets)}`);
      sunItems.forEach(slot => sunSlotUse.add(`Sun item in ${slot}`));
      gemCounts.add(`Sun gems: ${gemmed('Sun Augment Slot')}, Moon gems: ${gemmed('Moon Augment Slot')}`);
      for (const slot of filled) {
        for (const c of slots.get(slot)!.crafting ?? []) {
          if ((c.name === 'Sun Augment Slot' || c.name === 'Moon Augment Slot') && c.selected?.affixes.length) {
            gems.add(`${c.name.replace(' Augment Slot', '')}: ${c.selected.name || c.selected.describe(true, false)}`);
          }
        }
      }
      artifactSets.forEach(set => typedSets.add(`Artifact: ${set}`));
      profaneSets.forEach(set => typedSets.add(`Profane: ${set}`));
      moonItems.forEach(slot => sunSlotUse.add(`Moon item in ${slot}`));

      // Leave-one-out ranking.
      const finishedIndex = corpus.finished - 1;
      if ((SAMPLE && finishedIndex >= SAMPLE) || finishedIndex % SHARD_COUNT !== SHARD) {
        continue;
      }
      looBuilds++;
      if (PROGRESS) {
        appendFileSync(PROGRESS, `leave-one-out build ${looBuilds} (${filled.length} slots) at ${new Date().toISOString()}\n`);
      }
      const index = new NeedIndex(affixSvc, gearDB, covered, trackedSnapshot(equipped));
      const baseline = index.needs.map(need => {
        const externals = equipped.getExternalAffixesForType(need.affix, need.type);
        if (externals.some(e => e.kind === 'ignored')) {
          return need.best;
        }
        return Math.max(0, ...externals.map(e => e.value));
      });
      const ctx: Ctx = { equipped, gearDB, availability, index, maxLevel: levelRange[1] };
      const original = new Map(slots);
      for (const slot of filled) {
        const actual = original.get(slot)!;
        const state = new BuildState(index, gearDB, baseline);
        for (const other of filled) {
          if (other !== slot) {
            state.items.set(other, original.get(other)!);
          }
        }
        state.recompute();
        const pool = equipped.getCompatibleGearForSlot(slot, gearDB.getFilteredGearBySlot(slot) ?? [])
          .filter(item => !item.isGeneratedEssenceCraftingBlank());
        const loo = looBySlot.get(slot) ?? { rankSum: {}, rr: {}, hit1: {}, hit5: {}, hit20: {}, n: 0, missing: 0 };
        looBySlot.set(slot, loo);
        if (!pool.some(item => item.name === actual.name)) {
          loo.missing++;
          looAll.missing++;
          continue;
        }
        loo.n++;
        looAll.n++;
        for (const [name, scorer] of scorers) {
          const score = scorer(ctx, state, [slot]);
          const scores = pool.map(item => ({ name: item.name, s: score(item, slot) }));
          const mine = scores.find(entry => entry.name === actual.name)!.s;
          const above = scores.filter(entry => entry.s > mine + 1e-9).length;
          const ties = scores.filter(entry => Math.abs(entry.s - mine) <= 1e-9).length - 1;
          const rank = 1 + above + ties / 2;
          for (const target of [loo, looAll]) {
            target.rankSum[name] = (target.rankSum[name] ?? 0) + rank;
            target.rr[name] = (target.rr[name] ?? 0) + 1 / rank;
            target.hit1[name] = (target.hit1[name] ?? 0) + (rank <= 1 ? 1 : 0);
            target.hit5[name] = (target.hit5[name] ?? 0) + (rank <= 5 ? 1 : 0);
            target.hit20[name] = (target.hit20[name] ?? 0) + (rank <= 20 ? 1 : 0);
          }
        }
        // The live scorer reads EquippedService, which the loop above changed; put the build back.
        if (scorers.some(([, scorer]) => scorer === liveScorer)) {
          for (const s of slotNames) {
            const item = original.get(s);
            if (item) {
              equipped.set(item);
            } else {
              equipped.clearSlot(s);
            }
          }
        }
      }
    }

    const summariseLoo = (loo: Loo) => Object.fromEntries(scorers.map(([name]) => [name, loo.n ? {
      meanRank: +(loo.rankSum[name] / loo.n).toFixed(1),
      mrr: +(loo.rr[name] / loo.n).toFixed(3),
      hit1: +(loo.hit1[name] / loo.n).toFixed(3),
      hit5: +(loo.hit5[name] / loo.n).toFixed(3),
      hit20: +(loo.hit20[name] / loo.n).toFixed(3),
    } : null]));

    const report = {
      corpus: { ...corpus, owners: corpus.owners.size, minFilledForFinished: MIN_FILLED },
      medianItemLevel: Object.fromEntries(Array.from(medianMlHistogram.counts).sort((a, b) => a[0] - b[0])),
      filledSlots: Object.fromEntries(Array.from(filledHistogram.counts).sort((a, b) => a[0] - b[0])),
      maxLevel: Object.fromEntries(Array.from(maxLevelHistogram.counts).sort((a, b) => a[0] - b[0])),
      trackedCount: Object.fromEntries(Array.from(trackedCountHistogram.counts).sort((a, b) => a[0] - b[0])),
      trackedAffixes: tracked.top(120),
      bundles: bundles.top(30),
      sourceTotals: sourceTotals.top(40).map(([label, w]) => [label, +w.toFixed(1)]),
      sourcesByAffix: Array.from(sources)
        .map(([affix, counter]) => {
          const total = Array.from(counter.counts.values()).reduce((a, b) => a + b, 0);
          return { affix, covered: +total.toFixed(1), shares: counter.top(8).map(([label, w]) => [label, +(w / total).toFixed(2)]) };
        })
        .sort((a, b) => b.covered - a.covered),
      needCoverage: Array.from(needsTracked.counts)
        .map(([key, n]) => ({ need: key, tracked: n, coveredShare: +((needsCovered.counts.get(key) ?? 0) / n).toFixed(2) }))
        .filter(row => row.tracked >= 5)
        .sort((a, b) => b.tracked - a.tracked),
      artifactProfaneStrategies: strategies.top(30),
      sunMoonGemCounts: gemCounts.top(40),
      sunMoonGems: gems.top(60),
      artifactProfaneSets: typedSets.top(40),
      sunMoonSlots: sunSlotUse.top(20),
      topItemsBySlot: Object.fromEntries(Array.from(itemsBySlot).map(([slot, counter]) => [slot, counter.top(12)])),
      topSets: sets.top(40),
      leaveOneOut: { builds: looBuilds, all: { n: looAll.n, missing: looAll.missing, ...summariseLoo(looAll) },
        bySlot: Object.fromEntries(Array.from(looBySlot).map(([slot, loo]) => [slot, { n: loo.n, missing: loo.missing, ...summariseLoo(loo) }])) },
    };
    if (REPORT_FILE) {
      writeFileSync(REPORT_FILE, JSON.stringify(report, null, 1));
    }
    console.log(JSON.stringify(report.leaveOneOut.all, null, 1));
    expect(corpus.decoded).toBeGreaterThan(0);
  }, 6 * 3_600_000);
});
